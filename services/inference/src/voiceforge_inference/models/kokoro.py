"""Kokoro-82M adapter for American English speech."""

import re

import torch
from kokoro import KPipeline

from .base import ModelAdapter, SynthesisResult


class KokoroAdapter(ModelAdapter):
    def __init__(self, device: str = "cpu") -> None:
        if device == "cuda" and not torch.cuda.is_available():
            raise RuntimeError("CUDA is unavailable. Use the CUDA build of PyTorch on a GPU runtime.")
        self._pipeline = KPipeline(
            lang_code="a", repo_id="hexgrad/Kokoro-82M", device=device
        )

    def synthesize(self, text: str, voice_id: str) -> SynthesisResult:
        if not text.strip():
            raise ValueError("Text must contain at least one non-whitespace character.")
        if not re.fullmatch(r"a[fm]_[a-z]+", voice_id):
            raise ValueError("Use a built-in American English voice ID such as af_heart.")

        chunks = []
        with torch.inference_mode():
            for _, _, audio in self._pipeline(text, voice=voice_id):
                if audio is not None and audio.numel():
                    chunks.append(audio.cpu())

        if not chunks:
            raise RuntimeError("Kokoro returned no audio for the supplied text.")

        samples = torch.cat(chunks).numpy()
        pcm = (samples * 32768).round().clip(-32768, 32767).astype("<i2")
        return SynthesisResult(pcm_s16le=pcm.tobytes(), sample_rate_hz=24_000)
