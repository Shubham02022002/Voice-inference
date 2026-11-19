"""HTTP checks with a controllable inference adapter."""

from concurrent.futures import ThreadPoolExecutor
from http.client import HTTPConnection
import json
import socket
from threading import Event, Thread
from time import monotonic, sleep
import unittest

from voiceforge_inference.models.base import SynthesisResult
from voiceforge_inference.scheduler import Scheduler
from voiceforge_inference.worker import InferenceServer


class BlockingAdapter:
    def __init__(self):
        self.started = Event()
        self.unblock = Event()
        self.calls = []

    def synthesize(self, text, voice):
        self.calls.append(text)
        if text == "active":
            self.started.set()
            if not self.unblock.wait(3):
                raise RuntimeError("Test never released the active inference.")
        return SynthesisResult(b"\x00\x00", 24_000)


class WorkerQueueTests(unittest.TestCase):
    def setUp(self):
        self.adapter = BlockingAdapter()
        self.scheduler = Scheduler(limit=1, timeout=0.4)
        self.server = InferenceServer(0, self.adapter, self.scheduler)
        self.server_thread = Thread(target=self.server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)
        self.server_thread.start()
        self.pool = ThreadPoolExecutor(max_workers=2)
        self.active = self.pool.submit(self.synthesize, "active")
        self.assertTrue(self.adapter.started.wait(1))

    def tearDown(self):
        self.adapter.unblock.set()
        self.pool.shutdown(wait=True)
        self.server.shutdown()
        self.server.server_close()
        self.server_thread.join(1)

    def synthesize(self, text):
        connection = HTTPConnection("127.0.0.1", self.server.server_port, timeout=2)
        try:
            connection.request("POST", "/synthesize", json.dumps({"text": text}))
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            connection.close()

    def wait_for_depth(self, depth):
        deadline = monotonic() + 1
        while monotonic() < deadline:
            with self.scheduler.condition:
                if len(self.scheduler.waiting) == depth:
                    return
            sleep(0.005)
        self.fail(f"Queue never reached depth {depth}")

    def test_full_queue_rejects_and_queued_success_exposes_timing(self):
        queued = self.pool.submit(self.synthesize, "queued")
        self.wait_for_depth(1)
        status, headers, _ = self.synthesize("extra")
        self.assertEqual(status, 503)
        self.assertEqual(headers["Retry-After"], "1")
        self.adapter.unblock.set()
        self.assertEqual(self.active.result(1)[0], 200)
        status, headers, body = queued.result(1)
        self.assertEqual(status, 200)
        self.assertGreater(float(headers["X-Queue-Wait-Ms"]), 0)
        self.assertGreaterEqual(float(headers["X-Inference-Ms"]), 0)
        self.assertTrue(body.startswith(b"RIFF"))

    def test_queued_request_expires_without_running(self):
        status, _, body = self.synthesize("expired")
        self.assertEqual(status, 504)
        self.assertIn("waiting", json.loads(body)["error"])
        self.assertEqual(self.adapter.calls, ["active"])

    def test_disconnected_waiter_frees_slot_without_running(self):
        port = self.server.server_port
        with socket.create_connection(("127.0.0.1", port), timeout=1) as connection:
            body = b'{"text":"cancel me"}'
            connection.sendall(f"POST /synthesize HTTP/1.1\r\nHost: localhost\r\nContent-Length: {len(body)}\r\n\r\n".encode() + body)
            self.wait_for_depth(1)
        self.wait_for_depth(0)
        self.assertEqual(self.adapter.calls, ["active"])
        replacement = self.pool.submit(self.synthesize, "replacement")
        self.wait_for_depth(1)
        self.adapter.unblock.set()
        self.assertEqual(replacement.result(1)[0], 200)
        self.assertEqual(self.adapter.calls, ["active", "replacement"])


if __name__ == "__main__":
    unittest.main()
