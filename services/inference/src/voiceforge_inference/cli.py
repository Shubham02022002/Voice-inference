"""Generate a mono PCM WAV with the VoiceForge inference adapter."""

import argparse
from pathlib import Path
import wave



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
        with wave.open(str(args.output), "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(result.sample_rate_hz)
            wav.writeframes(result.pcm_s16le)
    except (ValueError, RuntimeError, OSError) as error:
        parser.exit(1, f"Error: {error}\n")

    print(f"Saved {args.output} ({result.sample_rate_hz} Hz, {args.device})")
