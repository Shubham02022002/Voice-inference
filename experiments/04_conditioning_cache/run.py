"""Compare Kokoro's existing voice cache with the managed conditioning cache."""

import argparse
from hashlib import sha256
from importlib.metadata import version
import json
import os
from pathlib import Path
import platform
from statistics import median
from time import perf_counter

if os.getenv("HF_HUB_OFFLINE") != "1":
    raise SystemExit("Warm the model and voice files first, then set HF_HUB_OFFLINE=1 for this benchmark.")

import torch

from voiceforge_inference.conditioning import ConditioningCache, DEFAULT_TTL_SECONDS
from voiceforge_inference.models.kokoro import KokoroAdapter

VOICE = "af_heart"
TEXT = "VoiceForge is ready. This test repeats the same voice and text."
SEED = 1876


def sample(adapter, mode, expected_digest=None):
    torch.manual_seed(SEED)
    started = perf_counter()
    with_chunks = adapter.iter_pcm(TEXT, VOICE, sentence_chunks=True)
    first = next(with_chunks)
    first_ms = (perf_counter() - started) * 1000
    audio = first + b"".join(with_chunks)
    total_ms = (perf_counter() - started) * 1000
    digest = sha256(audio).hexdigest()
    if expected_digest is not None and expected_digest != digest:
        raise RuntimeError(f"PCM for {mode} differed from the seeded upstream result.")
    return {
        "first_pcm_ms": first_ms,
        "total_ms": total_ms,
        "audio_samples": len(audio) // 2,
        "sha256": digest,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--trials", type=int, default=8)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.trials < 1:
        parser.error("--trials must be positive.")

    torch.set_num_threads(2)
    adapter = KokoroAdapter()
    hot_cache = adapter.conditioning
    cold_cache = ConditioningCache[torch.Tensor](0, DEFAULT_TTL_SECONDS)
    upstream_packs = {}
    modes = {
        "upstream_warm": (None, upstream_packs),
        "managed_cold": (cold_cache, {}),
        "managed_warm": (hot_cache, {}),
    }

    def activate(mode):
        adapter.conditioning, adapter._pipeline.voices = modes[mode]

    activate("upstream_warm")
    expected = sample(adapter, "upstream_warm")["sha256"]
    activate("managed_warm")
    sample(adapter, "managed_warm", expected)
    activate("managed_cold")
    sample(adapter, "managed_cold", expected)

    results = {mode: [] for mode in modes}
    order = list(modes)
    for index in range(args.trials):
        for mode in order[index % len(order):] + order[:index % len(order)]:
            activate(mode)
            results[mode].append(sample(adapter, mode, expected))
        print(f"Round {index + 1}/{args.trials} complete", flush=True)

    labels = {"upstream_warm": "Kokoro warm", "managed_cold": "Managed cold", "managed_warm": "Managed warm"}
    policies = [{
        "id": mode,
        "label": labels[mode],
        "first_pcm_p50_ms": median(row["first_pcm_ms"] for row in samples),
        "total_p50_ms": median(row["total_ms"] for row in samples),
        "trials": samples,
    } for mode, samples in results.items()]
    upstream, cold, warm = policies
    stats = hot_cache.stats()
    report = {
        "kind": "conditioning-cache",
        "setup": f"Kokoro {version('kokoro')}, PyTorch {torch.__version__}, {platform.system()} "
                 f"{platform.machine()}, CPU, two Torch threads, one model instance, {args.trials} rounds.",
        "notes": "All measured trials returned byte-identical seeded PCM. The benchmark rotates the order of three cache modes. "
                 "Cold reloads from local disk with networking disabled. First PCM is measured at the adapter and excludes HTTP, "
                 "queueing and playback. Kokoro already caches host packs. CPU results do not measure CUDA transfer savings.",
        "metrics": [
            {"name": "P50 first PCM vs. existing warm cache", "unit": " ms", "before": upstream["first_pcm_p50_ms"],
             "after": warm["first_pcm_p50_ms"], "better": "lower"},
            {"name": "P50 first PCM, managed cold vs. warm", "unit": " ms", "before": cold["first_pcm_p50_ms"],
             "after": warm["first_pcm_p50_ms"], "better": "lower"},
        ],
        "prompt": TEXT,
        "voice_id": VOICE,
        "seed": SEED,
        "pcm_matches": True,
        "managed_warm": stats,
        "managed_cold": cold_cache.stats(),
        "modes": policies,
    }
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"metrics": report["metrics"], "managed_warm": stats}, indent=2))


if __name__ == "__main__":
    main()
