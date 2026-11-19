"""Generate a mono PCM WAV with the VoiceForge inference adapter."""

import argparse
from pathlib import Path
from .audio import encode_wav



def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--text", default="Hello, welcome to VoiceForge.")
    parser.add_argument("--voice", default="af_heart")
    parser.add_argument("--device", choices=("cpu", "cuda"), default="cpu")
    parser.add_argument("--output", type=Path, default=Path("output.wav"))
    args = parser.parse_args()
    from .models.kokoro import KokoroAdapter

    try:
        result = KokoroAdapter(device=args.device).synthesize(args.text, args.voice)
        args.output.write_bytes(encode_wav(result))
    except (ValueError, RuntimeError, OSError) as error:
        parser.exit(1, f"Error: {error}\n")

    print(f"Saved {args.output} ({result.sample_rate_hz} Hz, {args.device})")
