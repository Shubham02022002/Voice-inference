"""Local HTTP worker serving one Kokoro inference at a time."""

from __future__ import annotations

import argparse
from base64 import b64encode
from contextlib import closing
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from select import select
from socket import MSG_PEEK
from time import perf_counter
from typing import TYPE_CHECKING

from .audio import encode_wav
from .scheduler import QueueFull, QueueTimeout, RequestCancelled, Scheduler

if TYPE_CHECKING:
    from .models.kokoro import KokoroAdapter

MAX_BODY_BYTES = 16_384
MAX_TEXT_LENGTH = 2_000


class InferenceServer(ThreadingHTTPServer):
    def __init__(self, port: int, adapter: KokoroAdapter, scheduler: Scheduler | None = None):
        self.adapter = adapter
        self.scheduler = scheduler if scheduler is not None else Scheduler()
        super().__init__(("127.0.0.1", port), InferenceHandler)


class InferenceHandler(BaseHTTPRequestHandler):
    server: InferenceServer

    def respond(self, status: int, content_type: str, body: bytes, **headers: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        for key, value in headers.items():
            self.send_header(key.replace("_", "-"), value)
        self.end_headers()
        self.wfile.write(body)

    def error_json(self, status: int, message: str, **headers: str) -> None:
        self.respond(status, "application/json", json.dumps({"error": message}).encode(), **headers)

    def client_disconnected(self) -> bool:
        readable, _, _ = select([self.connection], [], [], 0)
        try:
            return bool(readable) and not self.connection.recv(1, MSG_PEEK)
        except ConnectionError:
            return True

    def do_GET(self) -> None:
        if self.path == "/health":
            self.respond(200, "application/json", b'{"status":"ready"}')
        else:
            self.error_json(404, "Route not found.")

    def do_POST(self) -> None:
        if self.path not in ("/synthesize", "/synthesize/stream"):
            self.error_json(404, "Route not found.")
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= MAX_BODY_BYTES:
                raise ValueError()
            payload = json.loads(self.rfile.read(length))
        except ValueError:
            self.error_json(400, "Expected a JSON object of at most 16 KiB.")
            return

        if not isinstance(payload, dict):
            self.error_json(400, "Expected a JSON object.")
            return
        text = payload.get("text")
        voice = payload.get("voice_id", "af_heart")
        if not isinstance(text, str) or not text.strip() or len(text) > MAX_TEXT_LENGTH:
            self.error_json(400, "Text must contain 1–2000 characters.")
            return
        if not isinstance(voice, str):
            self.error_json(400, "Voice ID must be a string.")
            return
        scheduler = self.server.scheduler
        try:
            queue_ms = scheduler.acquire(len(text), self.client_disconnected) * 1000
        except RequestCancelled:
            return
        except QueueFull:
            self.error_json(503, "The speech queue is full. Try again shortly.", Retry_After="1")
            return
        except QueueTimeout:
            self.error_json(504, "The speech request expired while waiting for the worker.")
            return

        started = perf_counter()
        try:
            if self.path == "/synthesize/stream":
                self.stream_audio(text, voice, queue_ms)
                return
            audio = encode_wav(self.server.adapter.synthesize(text, voice))
            inference_ms = (perf_counter() - started) * 1000
        except (ConnectionError, TimeoutError):
            return
        except ValueError as error:
            self.error_json(400, str(error))
            return
        except Exception as error:
            self.log_error("Synthesis failed: %s", error)
            self.error_json(500, "Audio synthesis failed.")
            return
        finally:
            scheduler.release()

        self.respond(200, "audio/wav", audio, X_Queue_Wait_Ms=f"{queue_ms:.3f}", X_Inference_Ms=f"{inference_ms:.3f}")

    def stream_audio(self, text: str, voice: str, queue_ms: float) -> None:
        def event(message: dict) -> None:
            self.wfile.write((json.dumps(message) + "\n").encode())
            self.wfile.flush()

        adapter = self.server.adapter
        with closing(adapter.iter_pcm(text, voice, sentence_chunks=True)) as chunks:
            started = perf_counter()
            first = next(chunks)
            inference_ms = (perf_counter() - started) * 1000
            self.connection.settimeout(10)
            self.close_connection = True
            self.send_response(200)
            self.send_header("Content-Type", "application/x-ndjson")
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Queue-Wait-Ms", f"{queue_ms:.3f}")
            self.send_header("Connection", "close")
            self.end_headers()

            try:
                event({"type": "start", "sample_rate": adapter.sample_rate_hz})
                pcm = first
                while pcm is not None:
                    event({"type": "audio", "pcm": b64encode(pcm).decode("ascii")})
                    if self.client_disconnected():
                        return
                    started = perf_counter()
                    pcm = next(chunks, None)
                    inference_ms += (perf_counter() - started) * 1000
                event({"type": "done", "inference_ms": round(inference_ms, 3)})
            except (ConnectionError, TimeoutError):
                return
            except Exception as error:
                self.log_error("Streaming synthesis failed: %s", error)
                event({"type": "error", "error": "Audio synthesis failed."})


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--device", choices=("cpu", "cuda"), default="cpu")
    parser.add_argument("--port", type=int, default=os.getenv("INFERENCE_PORT", "8000"))
    parser.add_argument("--queue-limit", type=int, default=4, help="maximum requests waiting for inference")
    parser.add_argument("--queue-timeout", type=float, default=15, help="maximum seconds a request may wait")
    parser.add_argument("--queue-policy", choices=("fifo", "shortest"), default="fifo")
    args = parser.parse_args()
    try:
        scheduler = Scheduler(args.queue_limit, args.queue_timeout, args.queue_policy)
    except ValueError as error:
        parser.error(str(error))

    from .models.kokoro import KokoroAdapter

    with InferenceServer(args.port, KokoroAdapter(device=args.device), scheduler) as server:
        print(f"Inference worker ready on http://127.0.0.1:{server.server_port}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
