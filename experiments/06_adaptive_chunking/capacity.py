"""Measure single-worker capacity at fixed offered rates using a seeded mixed trace."""
import argparse
from base64 import b64decode
from concurrent.futures import ThreadPoolExecutor
import json
import math
from pathlib import Path
import random
from threading import Thread
from time import perf_counter, sleep
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from load import PolicyAdapter, PROMPT
from voiceforge_inference.worker import InferenceServer

PROMPTS = {
    "short": "Your order is ready. Pick it up at gate five.",
    "control": PROMPT,
    "narration": "When the rain finally stopped, the crew walked down the platform and waited for the evening train. A few minutes later, the station lights came on. Beyond the tracks, the last patch of sunlight disappeared behind the hills.",
}


def trace(seed):
    rng = random.Random(seed)
    names = ["short"] * 30 + ["control"] * 18 + ["narration"] * 12
    rng.shuffle(names)
    gaps = [rng.expovariate(1) for _ in names]
    total = sum(gaps)
    elapsed = 0
    schedule = []
    for name, gap in zip(names, gaps):
        schedule.append((elapsed / total, name))
        elapsed += gap
    return schedule


def request(url, name, due):
    body = json.dumps({"text": PROMPTS[name], "voice_id": "af_heart"}).encode()
    result = {"prompt": name, "dispatch_lag_ms": (perf_counter() - due) * 1000}
    try:
        with urlopen(Request(url, body, {"Content-Type": "application/json"}), timeout=60) as response:
            result["queue_ms"] = float(response.headers["X-Queue-Wait-Ms"])
            samples = 0
            for line in response:
                event = json.loads(line)
                if event["type"] == "audio":
                    pcm = b64decode(event["pcm"], validate=True)
                    if not pcm or len(pcm) % 2:
                        raise ValueError("Invalid PCM")
                    result.setdefault("first_ms", (perf_counter() - due) * 1000)
                    samples += len(pcm) // 2
                elif event["type"] == "done" and samples:
                    return dict(result, status=200, audio_seconds=samples / 24000)
                elif event["type"] != "start":
                    raise ValueError("Incomplete audio stream")
            raise ValueError("Missing completion")
    except HTTPError as exc:
        return dict(result, status=exc.code)
    except (OSError, ValueError) as exc:
        return dict(result, status=0, error=str(exc))


def measure(url, schedule, rpm, target):
    with ThreadPoolExecutor(max_workers=32) as pool:
        jobs = []
        start = perf_counter()
        window = len(schedule) * 60 / rpm
        for fraction, name in schedule:
            due = start + fraction * window
            sleep(max(0, due - perf_counter()))
            jobs.append(pool.submit(request, url, name, due))
        rows = [job.result() for job in jobs]
        seconds = max(window, perf_counter() - start)
    times = sorted(r["first_ms"] for r in rows if r["status"] == 200)
    p95 = times[math.ceil(.95 * len(times)) - 1] if times else None
    return dict(offered_rpm=rpm, completed_rpm=60 * len(times) / seconds,
                p95_first_ms=p95, failures=len(rows)-len(times),
                passed=len(times)==len(rows) and p95 <= target, requests=rows)


def benchmark(model, target, rates):
    adapter = PolicyAdapter(model)
    runs = []
    with InferenceServer(0, adapter) as server:
        thread = Thread(target=server.serve_forever)
        thread.start()
        try:
            url = f"http://127.0.0.1:{server.server_port}/synthesize/stream"
            for adapter.sentences in (False, True):
                for name in PROMPTS:
                    if request(url, name, perf_counter())["status"] != 200:
                        raise RuntimeError("Warmup failed")
            for rpm in rates:
                for seed in (71, 72):
                    for sentence in ((False, True) if seed == 71 else (True, False)):
                        adapter.sentences = sentence
                        row = measure(url, trace(seed), rpm, target)
                        runs.append(dict(row, seed=seed, policy="sentence" if sentence else "paragraph"))
        finally:
            server.shutdown()
            thread.join()
    capacity = {}
    for policy in ("paragraph", "sentence"):
        passing = [rpm for rpm in rates if all(r["passed"] for r in runs
                   if r["offered_rpm"] == rpm and r["policy"] == policy)]
        capacity[policy] = max(passing, default=None)
    return dict(target_ms=target, prompts=PROMPTS, highest_passing_tested_rpm=capacity, runs=runs)


if __name__ == "__main__":
    import torch
    from voiceforge_inference.models.kokoro import KokoroAdapter
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target-ms", type=float, default=500)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if not math.isfinite(args.target_ms) or args.target_ms <= 0:
        parser.error("target must be positive and finite")
    report = benchmark(KokoroAdapter(device="cuda"), args.target_ms, (60, 120, 180))
    report.update(gpu=torch.cuda.get_device_name(), torch=str(torch.__version__), precision="fp32", voice="af_heart")
    args.output.write_text(json.dumps(report, indent=2))
