"""Local HTTP worker serving one Kokoro inference at a time."""

import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from threading import Lock

from .audio import encode_wav
from .models.kokoro import KokoroAdapter

MAX_BODY_BYTES = 16_384
MAX_TEXT_LENGTH = 2_000


class InferenceServer(ThreadingHTTPServer):
    def __init__(self, port: int, adapter: KokoroAdapter):
        self.adapter = adapter
        self.slot = Lock()
        super().__init__(("127.0.0.1", port), InferenceHandler)


class InferenceHandler(BaseHTTPRequestHandler):
    server: InferenceServer

    def respond(self, status: int, content_type: str, body: bytes) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def error_json(self, status: int, message: str) -> None:
        self.respond(status, "application/json", json.dumps({"error": message}).encode())

    def do_GET(self) -> None:
        if self.path == "/health":
            self.respond(200, "application/json", b'{"status":"ready"}')
        else:
            self.error_json(404, "Route not found.")

    def do_POST(self) -> None:
        if self.path != "/synthesize":
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
        if not self.server.slot.acquire(blocking=False):
            self.error_json(503, "Inference worker is busy. Try again shortly.")
            return

        try:
            audio = encode_wav(self.server.adapter.synthesize(text, voice))
        except ValueError as error:
            self.error_json(400, str(error))
            return
        except Exception as error:
            self.log_error("Synthesis failed: %s", error)
            self.error_json(500, "Audio synthesis failed.")
            return
        finally:
            self.server.slot.release()

        self.respond(200, "audio/wav", audio)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--device", choices=("cpu", "cuda"), default="cpu")
    parser.add_argument("--port", type=int, default=os.getenv("INFERENCE_PORT", "8000"))
    args = parser.parse_args()

    with InferenceServer(args.port, KokoroAdapter(device=args.device)) as server:
        print(f"Inference worker ready on http://127.0.0.1:{server.server_port}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
