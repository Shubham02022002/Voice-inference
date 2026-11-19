"""Probe Kokoro's token-forward contract with single- and multi-row input."""

import argparse
from importlib.metadata import version
import json
from pathlib import Path
import platform
from unittest.mock import patch

import torch
from kokoro import KPipeline

VOICE = "af_heart"
MODEL = "hexgrad/Kokoro-82M"
PROMPTS = (
    "Ready to go.",
    "VoiceForge tests independent speech requests with different phoneme lengths.",
)


def prepare(pipeline):
    model = pipeline.model
    voice = pipeline.load_voice(VOICE)
    requests = []
    baseline = []
    with patch.object(model, "forward_with_tokens", wraps=model.forward_with_tokens) as forward:
        for prompt in PROMPTS:
            before = forward.call_count
            results = list(pipeline(prompt, voice=VOICE))
            if len(results) != 1 or results[0].audio is None or not results[0].audio.numel():
                raise RuntimeError("Each serial control must produce one non-empty waveform.")
            result = results[0]
            phonemes = result.phonemes
            ids = [0, *(model.vocab[symbol] for symbol in phonemes if symbol in model.vocab), 0]
            requests.append((ids, voice[len(phonemes) - 1]))
            baseline.append({
                "prompt": prompt,
                "token_count": len(ids),
                "waveform_samples": result.audio.numel(),
                "forward_calls": forward.call_count - before,
            })
    if len(requests[0][0]) == len(requests[1][0]) or any(item["forward_calls"] != 1 for item in baseline):
        raise RuntimeError("The serial controls did not exercise two different token lengths.")
    return requests, baseline


def probe(model, label, requests):
    width = max(len(ids) for ids, _ in requests)
    input_ids = torch.tensor(
        [ids + [0] * (width - len(ids)) for ids, _ in requests],
        device=model.device,
    )
    conditioning = torch.cat([reference for _, reference in requests]).to(model.device)
    check = {
        "label": label,
        "input_shape": list(input_ids.shape),
        "token_lengths": [len(ids) for ids, _ in requests],
    }
    with patch.object(model, "forward_with_tokens", wraps=model.forward_with_tokens) as forward:
        try:
            audio, _ = model.forward_with_tokens(input_ids, conditioning)
            check["output_shape"] = list(audio.shape)
            # The public token-forward interface has no output-length or mask argument.
            # A two-row tensor would still need follow-up audio and length validation.
            check["outcome"] = "output returned"
        except (RuntimeError, ValueError, IndexError, AssertionError) as error:
            check["outcome"] = "failed"
            check["error"] = f"{type(error).__name__}: {error}"
        check["forward_calls"] = forward.call_count
    return check


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--device", choices=("cpu", "cuda"), default="cpu")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    torch.set_num_threads(2)
    pipeline = KPipeline(lang_code="a", repo_id=MODEL, device=args.device)

    requests, baseline = prepare(pipeline)
    checks = [
        probe(pipeline.model, "Single-row token control", requests[:1]),
        probe(pipeline.model, "Two equal-length rows", [requests[0], requests[0]]),
        probe(pipeline.model, "Two independent prompts, padded", requests),
    ]
    if checks[0]["outcome"] != "output returned":
        raise RuntimeError(f"Single-row control failed: {checks[0]}")

    blocked = all(check["outcome"] == "failed" for check in checks[1:])
    report = {
        "kind": "batching-feasibility",
        "status": "unsupported" if blocked else "needs-validation",
        "setup": f"Kokoro {version('kokoro')}, PyTorch {torch.__version__}, {args.device.upper()}, "
                 f"{platform.system()} {platform.machine()}, two Torch threads, {VOICE}.",
        "notes": (
            "Both prompts produced serial audio. Each two-row probe attempted one call to the "
            "upstream token-forward method. The equal-length probe duplicates one row to "
            "control for padding. The mixed-length probe uses separate text and conditioning "
            "rows with zero padding. These checks cover the installed backend without model changes."
        ),
        "serial": baseline,
        "checks": checks,
    }
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
