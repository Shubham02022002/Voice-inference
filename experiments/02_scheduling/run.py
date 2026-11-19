"""Measure three admission policies with the same model and request bursts."""

import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from math import ceil
from pathlib import Path
import platform
from statistics import median
from threading import Thread
from time import perf_counter, sleep
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import torch

from voiceforge_inference.models.kokoro import KokoroAdapter
from voiceforge_inference.scheduler import Scheduler
from voiceforge_inference.worker import InferenceServer

PROMPTS = (
    ("Anchor", "Welcome to our local speech experiment."),
    ("Long A", "A voice assistant has to handle short replies and longer passages. "
     "Comparing the same requests helps us see where time is spent."),
    ("Short A", "Your request is ready."),
    ("Long B", "This is a second long request in the same burst. "
     "When it completes, the worker can move on to the next piece of text."),
    ("Short B", "Thanks for waiting."),
)
ARRIVAL_GAP = 0.025


def request_audio(url, prompt, delay=0):
    name, text = prompt
    sleep(delay)
    sent = perf_counter()
    request = Request(
        url,
        data=json.dumps({"text": text, "voice_id": "af_heart"}).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urlopen(request, timeout=25) as response:
            queued = float(response.headers["X-Queue-Wait-Ms"])
            first = None
            for line in response:
                arrived = (perf_counter() - sent) * 1000
                event = json.loads(line)
                if event["type"] == "audio" and first is None:
                    first = arrived
                elif event["type"] == "done" and first is not None:
                    return {
                        "prompt": name, "status": response.status, "queue_ms": queued,
                        "inference_ms": event["inference_ms"], "first_ms": first, "total_ms": arrived,
                    }
                elif event["type"] == "error":
                    raise RuntimeError(event["error"])
            raise RuntimeError("Incomplete audio response.")
    except HTTPError as error:
        with error:
            return {"prompt": name, "status": error.code, "total_ms": (perf_counter() - sent) * 1000}


def summarize(name, label, samples):
    complete = [sample for sample in samples if sample["status"] == 200]

    def percentile(key, quantile):
        if not complete:
            return None
        values = sorted(sample[key] for sample in complete)
        return round(values[ceil(quantile * len(values)) - 1], 2)

    short_times = [row["first_ms"] for row in complete if row["prompt"].startswith("Short")]
    return {
        "id": name,
        "label": label,
        "completed": len(complete),
        "rejected": sum(sample["status"] == 503 for sample in samples),
        "expired": sum(sample["status"] == 504 for sample in samples),
        "failed": sum(sample["status"] not in (200, 503, 504) for sample in samples),
        "first_p50_ms": percentile("first_ms", 0.5),
        "first_p95_ms": percentile("first_ms", 0.95),
        "first_p99_ms": percentile("first_ms", 0.99),
        "queue_p95_ms": percentile("queue_ms", 0.95),
        "inference_p50_ms": percentile("inference_ms", 0.5),
        "total_p95_ms": percentile("total_ms", 0.95),
        "short_first_p50_ms": round(median(short_times), 2) if short_times else None,
        "trials": samples,
    }


def run_policy(adapter, name, label, scheduler, bursts):
    with InferenceServer(0, adapter, scheduler) as server:
        url = f"http://127.0.0.1:{server.server_port}/synthesize/stream"
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        samples = []
        try:
            with ThreadPoolExecutor(max_workers=len(PROMPTS)) as pool:
                for burst in range(bursts):
                    requests = [
                        pool.submit(request_audio, url, prompt, index * ARRIVAL_GAP)
                        for index, prompt in enumerate(PROMPTS)
                    ]
                    samples.extend({"burst": burst + 1, **future.result()} for future in requests)
                    print(f"{label}: burst {burst + 1}/{bursts}", flush=True)
        finally:
            server.shutdown()
            thread.join()
    return summarize(name, label, samples)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bursts", type=int, default=4)
    parser.add_argument("--threads", type=int, default=2)
    parser.add_argument("--device", choices=("cpu", "cuda"), default="cpu")
    parser.add_argument("--setup", default=platform.platform())
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.bursts < 1 or args.threads < 1:
        parser.error("--bursts and --threads must be positive.")

    torch.set_num_threads(args.threads)
    adapter = KokoroAdapter(device=args.device)
    for _, text in PROMPTS:
        adapter.synthesize(text, "af_heart")

    policies = [
        run_policy(adapter, "reject", "No queue", Scheduler(limit=0), args.bursts),
        run_policy(adapter, "fifo", "FIFO", Scheduler(), args.bursts),
        run_policy(adapter, "shortest", "Shortest first", Scheduler(policy="shortest"), args.bursts),
    ]
    _, fifo, shortest = policies
    if fifo["first_p95_ms"] is None or shortest["first_p95_ms"] is None:
        raise RuntimeError("Both queue policies need completed requests for a latency comparison.")
    report = {
        "setup": f"{args.setup}. Kokoro on {args.device.upper()}, {args.threads} Torch threads, af_heart. "
                 f"{args.bursts} bursts of five requests per policy, spaced 25 ms apart; one active inference.",
        "notes": "Timings are from a local HTTP client calling the worker directly. "
                 "Percentiles use successful requests only. The no-queue policy can admit a different mix of requests, "
                 "so its latency cannot be compared directly with the queued policies. "
                 "Policies ran in sequence on shared hardware. Model execution time varied across policies, "
                 "and this small sample does not isolate scheduling effects from runtime variance.",
        "metrics": [{
            "name": "P95 first playable payload, FIFO vs. shortest first",
            "unit": " ms",
            "before": fifo["first_p95_ms"],
            "after": shortest["first_p95_ms"],
            "better": "lower",
        }],
        "queue_limit": 4,
        "queue_timeout_seconds": 15,
        "oldest_request_priority_seconds": 2,
        "prompts": dict(PROMPTS),
        "policies": policies,
    }
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(f"Saved {args.output}")


if __name__ == "__main__":
    main()
