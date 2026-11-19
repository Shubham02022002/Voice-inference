"""Local HTTP worker serving one Kokoro inference at a time."""

import argparse
from base64 import b64encode
from contextlib import closing
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from select import select
from socket import MSG_PEEK
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
        if not self.server.slot.acquire(blocking=False):
            self.error_json(503, "Inference worker is busy. Try again shortly.")
            return

        try:
            if self.path == "/synthesize/stream":
                self.stream_audio(text, voice)
                return
            audio = encode_wav(self.server.adapter.synthesize(text, voice))
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
            self.server.slot.release()

        self.respond(200, "audio/wav", audio)

    def stream_audio(self, text: str, voice: str) -> None:
        def event(message: dict) -> None:
            self.wfile.write((json.dumps(message) + "\n").encode())
            self.wfile.flush()

        adapter = self.server.adapter
        with closing(adapter.iter_pcm(text, voice, sentence_chunks=True)) as chunks:
            first = next(chunks)
            self.connection.settimeout(10)
            self.close_connection = True
            self.send_response(200)
            self.send_header("Content-Type", "application/x-ndjson")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Connection", "close")
            self.end_headers()

            try:
                event({"type": "start", "sample_rate": adapter.sample_rate_hz})
                pcm = first
                while pcm is not None:
                    event({"type": "audio", "pcm": b64encode(pcm).decode("ascii")})
                    readable, _, _ = select([self.connection], [], [], 0)
                    if readable and not self.connection.recv(1, MSG_PEEK):
                        return
                    pcm = next(chunks, None)
                event({"type": "done"})
            except (ConnectionError, TimeoutError):
                return
            except Exception as error:
                self.log_error("Streaming synthesis failed: %s", error)
                event({"type": "error", "error": "Audio synthesis failed."})


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
