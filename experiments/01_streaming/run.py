"""Compare full WAV and streamed audio through the same HTTP entry point."""

import argparse
from base64 import b64decode
from io import BytesIO
import json
from pathlib import Path
from statistics import median
from time import perf_counter
from urllib.request import Request, urlopen
import wave

PROMPT = "\n".join((
    "Hello, welcome to VoiceForge.",
    "The first sentence can play while the next one is being generated.",
    "This benchmark compares audio delivery with the same text, voice, and model.",
))


def measure(base_url, streaming):
    request = Request(
        f"{base_url}/v1/speech" + ("/stream" if streaming else ""),
        data=json.dumps({"text": PROMPT, "voice_id": "af_heart"}).encode(),
        headers={"Content-Type": "application/json"},
    )
    started = perf_counter()
    with urlopen(request, timeout=65) as response:
        if not streaming:
            audio = response.read()
            elapsed = perf_counter() - started
            with wave.open(BytesIO(audio)) as wav:
                if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()) != (1, 2, 24_000):
                    raise RuntimeError("Unexpected WAV format.")
                frames = wav.getnframes()
                if not frames or len(wav.readframes(frames)) != frames * 2:
                    raise RuntimeError("Missing or incomplete WAV audio.")
            return {
                "first_ms": elapsed * 1000,
                "complete_ms": elapsed * 1000,
                "audio_seconds": frames / 24_000,
            }

        pcm_bytes = 0
        arrivals = []
        for line in response:
            arrived = perf_counter()
            event = json.loads(line)
            match event["type"]:
                case "start":
                    if event["sample_rate"] != 24_000:
                        raise RuntimeError("Unexpected PCM sample rate.")
                case "audio":
                    chunk = b64decode(event["pcm"], validate=True)
                    if not chunk or len(chunk) % 2:
                        raise RuntimeError("Invalid PCM chunk.")
                    pcm_bytes += len(chunk)
                    arrivals.append(arrived)
                case "done" if len(arrivals) > 1:
                    return {
                        "first_ms": (arrivals[0] - started) * 1000,
                        "complete_ms": (arrived - started) * 1000,
                        "chunk_count": len(arrivals),
                        "audio_seconds": pcm_bytes / 48_000,
                    }
                case _:
                    raise RuntimeError(event.get("error", "Unexpected stream event."))
        raise RuntimeError("Stream ended without completing.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:3000")
    parser.add_argument("--pairs", type=int, default=5)
    parser.add_argument("--setup", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.pairs < 1:
        parser.error("--pairs must be positive")

    url = args.url.rstrip("/")
    measure(url, False)
    measure(url, True)
    variants = {"wav": [], "stream": []}

    for index in range(args.pairs):
        modes = ("wav", "stream") if index % 2 == 0 else ("stream", "wav")
        for mode in modes:
            variants[mode].append(measure(url, mode == "stream"))
        print(f"Measured pair {index + 1}/{args.pairs}", flush=True)

    report = {
        "setup": args.setup,
        "notes": "One warm-up per mode, alternating order. First audio timing stops when a complete PCM chunk or WAV reaches the HTTP client. It excludes browser decoding and device playback. Both modes used the same newline-delimited prompt. Raw trials include audio duration and streaming chunk counts. This experiment measures delivery latency and excludes listening quality.",
        "prompt": PROMPT,
        "voice_id": "af_heart",
        "pairs": args.pairs,
        "variants": variants,
        "metrics": [
            {
                "name": label,
                "unit": " ms",
                "before": median(run[key] for run in variants["wav"]),
                "after": median(run[key] for run in variants["stream"]),
                "better": "lower",
            }
            for key, label in (
                ("first_ms", "P50 time to playable payload"),
                ("complete_ms", "P50 complete response"),
            )
        ],
    }
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Saved {args.output}")


if __name__ == "__main__":
    main()
