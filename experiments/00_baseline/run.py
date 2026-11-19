"""Measure WAV requests against a running VoiceForge gateway."""

import argparse
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
import json
import math
from pathlib import Path
import statistics
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import wave

PROMPTS = (
    "Hello, welcome to VoiceForge.",
    "VoiceForge generates speech from text. The baseline measures how long each request takes and how much audio it produces.",
    "A speech service must handle repeated requests and longer passages. This experiment keeps the model and voice fixed, then varies the input length and number of concurrent clients to measure how response time changes.",
)


def request_audio(url: str, text: str) -> dict:
    request = Request(
        url,
        data=json.dumps({"text": text, "voice_id": "af_heart"}).encode(),
        headers={"Content-Type": "application/json"},
    )
    started = time.perf_counter()
    try:
        with urlopen(request, timeout=65) as response:
            body = response.read()
        elapsed = time.perf_counter() - started
        with wave.open(BytesIO(body), "rb") as audio:
            duration = audio.getnframes() / audio.getframerate()
        return {"status": 200, "elapsed_seconds": elapsed, "audio_seconds": duration}
    except (HTTPError, URLError, TimeoutError, wave.Error, EOFError) as error:
        return {
            "status": getattr(error, "code", None),
            "elapsed_seconds": time.perf_counter() - started,
            "error": str(error),
        }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:3000/v1/speech")
    parser.add_argument("--concurrency", type=int, choices=(1, 2, 4, 8), default=1)
    parser.add_argument("--requests", type=int, default=9)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.requests < 1:
        parser.error("--requests must be positive")

    warmup = request_audio(args.url, PROMPTS[0])
    if warmup["status"] != 200:
        parser.exit(1, f"Warmup failed: {warmup.get('error')}\n")

    started = time.perf_counter()
    with ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        trials = list(pool.map(
            lambda index: request_audio(args.url, PROMPTS[index % len(PROMPTS)]),
            range(args.requests),
        ))
    wall_seconds = time.perf_counter() - started

    successful = [trial for trial in trials if trial["status"] == 200]
    latencies = sorted(trial["elapsed_seconds"] for trial in successful)
    for index, trial in enumerate(trials):
        trial["prompt_index"] = index % len(PROMPTS)

    report = {
        "url": args.url,
        "concurrency": args.concurrency,
        "voice_id": "af_heart",
        "prompts": PROMPTS,
        "successes": len(successful),
        "failures": len(trials) - len(successful),
        "p50_seconds": statistics.median(latencies) if latencies else None,
        "p95_seconds": latencies[math.ceil(len(latencies) * 0.95) - 1] if latencies else None,
        "wall_seconds": wall_seconds,
        "audio_seconds_per_wall_second": sum(trial["audio_seconds"] for trial in successful) / wall_seconds,
        "trials": trials,
    }
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(f"{len(successful)}/{len(trials)} successful requests. Saved {args.output}")


if __name__ == "__main__":
    main()
