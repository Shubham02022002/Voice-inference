"""Compare the existing Kokoro adapter in FP32 and CUDA autocast modes."""

import argparse
from contextlib import closing, nullcontext
from importlib.metadata import version
import json
from math import isfinite
from pathlib import Path
from statistics import median
from time import perf_counter
import warnings

import numpy as np
import torch

from voiceforge_inference.audio import encode_wav
from voiceforge_inference.models.base import SynthesisResult
from voiceforge_inference.models.kokoro import KokoroAdapter

WORKLOAD = {
    "short": "Welcome to VoiceForge. The proof is in the numbers.",
    "numbers": "The appointment is at 10:45 on November 19. The reference number is 7462.",
    "long": "Some listeners ask for quick answers. Others need a full explanation, with examples, pauses, and changes in emphasis.",
}
VOICE = "af_heart"
MIB = 1024 * 1024


def sample(adapter, prompt, device, dtype):
    torch.manual_seed(1876)
    if device == "cuda":
        torch.cuda.synchronize()
        torch.cuda.reset_peak_memory_stats()
    context = nullcontext() if dtype is None else torch.autocast("cuda", dtype=dtype)
    with warnings.catch_warnings(), context, closing(adapter.iter_pcm(prompt, VOICE, sentence_chunks=True)) as chunks:
        warnings.simplefilter("error", RuntimeWarning)
        started = perf_counter()
        first = next(chunks)
        first_ms = (perf_counter() - started) * 1000
        pcm = first + b"".join(chunks)
        if device == "cuda":
            torch.cuda.synchronize()
        elapsed = perf_counter() - started

    audio = np.frombuffer(pcm, dtype="<i2")
    if not np.any(audio):
        raise RuntimeError("The generated waveform was silent.")
    row = {
        "first_pcm_ms": first_ms,
        "total_ms": elapsed * 1000,
        "audio_seconds": len(audio) / adapter.sample_rate_hz,
        "clipped_samples": int(np.count_nonzero((audio == -32768) | (audio == 32767))),
        "peak_allocated_mib": torch.cuda.max_memory_allocated() / MIB if device == "cuda" else None,
        "peak_reserved_mib": torch.cuda.max_memory_reserved() / MIB if device == "cuda" else None,
    }
    return row, pcm


def summarize(mode, samples, rate):
    runtime = sum(item["total_ms"] for item in samples) / 1000
    generated = sum(item["audio_seconds"] for item in samples)
    median_ms = median(item["first_pcm_ms"] for item in samples)
    allocated = [item["peak_allocated_mib"] for item in samples if item["peak_allocated_mib"] is not None]
    reserved = [item["peak_reserved_mib"] for item in samples if item["peak_reserved_mib"] is not None]
    return {
        "label": mode,
        "status": "measured",
        "p50_first_pcm_ms": median_ms,
        "p50_total_ms": median(item["total_ms"] for item in samples),
        "audio_seconds_per_second": generated / runtime,
        "peak_allocated_mib": max(allocated) if allocated else None,
        "peak_reserved_mib": max(reserved) if reserved else None,
        "estimated_cost_per_audio_minute": rate * runtime / 3600 / (generated / 60) if rate is not None else None,
        "trials": samples,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--device", choices=("cuda", "cpu"), default="cuda")
    parser.add_argument("--rounds", type=int, default=3)
    parser.add_argument("--usd-per-hour", type=float)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.rounds < 1:
        parser.error("--rounds must be positive.")
    if args.usd_per_hour is not None and (not isfinite(args.usd_per_hour) or args.usd_per_hour < 0):
        parser.error("--usd-per-hour must be finite and nonnegative.")
    if args.device == "cuda" and not torch.cuda.is_available():
        parser.error("CUDA is unavailable. Enable a GPU runtime and use CUDA-enabled PyTorch.")

    torch.set_num_threads(2)
    device = args.device
    hardware = torch.cuda.get_device_name() if device == "cuda" else "CPU smoke check"
    if device == "cuda":
        torch.backends.cuda.matmul.allow_tf32 = False
        torch.backends.cudnn.allow_tf32 = False
        torch.cuda.synchronize()

    started = perf_counter()
    adapter = KokoroAdapter(device=device)
    if device == "cuda":
        torch.cuda.synchronize()
    model_load_seconds = perf_counter() - started
    model_allocated_mib = torch.cuda.memory_allocated() / MIB if device == "cuda" else None
    free_after_model_load_mib = torch.cuda.mem_get_info()[0] / MIB if device == "cuda" else None
    modes = [("FP32", None)]
    runs = []
    if device == "cuda":
        modes.append(("FP16 autocast", torch.float16))
        if torch.cuda.is_bf16_supported(including_emulation=False):
            modes.append(("BF16 autocast", torch.bfloat16))
        else:
            runs.append({"label": "BF16 autocast", "status": "skipped", "reason": "No native BF16 support."})

    args.output.parent.mkdir(parents=True, exist_ok=True)
    baseline = {}
    for mode, dtype in modes:
        samples = []
        clips = {}
        try:
            # Start each mode without inactive allocations from the previous mode.
            if device == "cuda":
                torch.cuda.empty_cache()
            for name, text in WORKLOAD.items():
                sample(adapter, text, device, dtype)
            for _ in range(args.rounds):
                for name, text in WORKLOAD.items():
                    row, pcm = sample(adapter, text, device, dtype)
                    row["prompt"] = name
                    clips.setdefault(name, pcm)
                    samples.append(row)
        except (RuntimeError, ValueError, RuntimeWarning) as error:
            if dtype is None:
                raise
            runs.append({"label": mode, "status": "failed", "reason": str(error)})
            continue

        run = summarize(mode, samples, args.usd_per_hour)
        if dtype is None:
            baseline = {name: len(clip) for name, clip in clips.items()}
        run["sample_duration_change_pct"] = {
            name: (len(clip) / baseline[name] - 1) * 100 for name, clip in clips.items()
        }
        for name, pcm in clips.items():
            filename = f"{mode.lower().replace(' ', '-')}-{name}.wav"
            (args.output.parent / filename).write_bytes(encode_wav(SynthesisResult(pcm, adapter.sample_rate_hz)))
        runs.append(run)
        print(f"{mode}: {run['p50_first_pcm_ms']:.1f} ms median first PCM", flush=True)

    measured = [row for row in runs if row["status"] == "measured"]
    base = measured[0]
    metrics = []
    for row in measured[1:]:
        for key, title, unit, better in (
            ("p50_first_pcm_ms", "P50 first PCM", " ms", "lower"),
            ("peak_allocated_mib", "Peak tensor allocation", " MiB", "lower"),
            ("audio_seconds_per_second", "Audio seconds per inference second", "×", "higher"),
            ("estimated_cost_per_audio_minute", "Estimated cost per audio minute", " USD", "lower"),
        ):
            if row[key] is None or base[key] is None:
                continue
            metrics.append({"name": f"{row['label']} · {title}", "unit": unit, "before": base[key], "after": row[key], "better": better})

    report = {
        "kind": "precision-benchmark",
        "setup": f"{hardware}, Kokoro {version('kokoro')}, PyTorch {torch.__version__}, voice {VOICE}. "
                 f"{args.rounds} rounds per mode after warming all three prompts.",
        "notes": "Autocast keeps model weights in FP32. First PCM is measured before HTTP, queueing, and playback. "
                 "Peak allocations are PyTorch allocator measurements. Cost estimates cover measured inference time only. "
                 "Pronunciation and timbre require listening to matched WAV files.",
        "device": device,
        "gpu": hardware if device == "cuda" else None,
        "cuda_runtime": torch.version.cuda,
        "gpu_total_mib": torch.cuda.get_device_properties(0).total_memory / MIB if device == "cuda" else None,
        "model_load_seconds": model_load_seconds,
        "model_allocated_mib": model_allocated_mib,
        "free_after_model_load_mib": free_after_model_load_mib,
        "usd_per_hour": args.usd_per_hour,
        "workload": WORKLOAD,
        "runs": runs,
        "metrics": metrics,
    }
    args.output.write_text(json.dumps(report, indent=2, allow_nan=False) + "\n")
    print(f"Saved {args.output} and listening samples.")


if __name__ == "__main__":
    main()
