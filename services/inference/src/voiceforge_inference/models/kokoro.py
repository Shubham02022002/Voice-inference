"""Kokoro-82M adapter for American English speech."""

from collections.abc import Iterator
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

    sample_rate_hz = 24_000

    def synthesize(self, text: str, voice_id: str) -> SynthesisResult:
        pcm = b"".join(self.iter_pcm(text, voice_id))
        return SynthesisResult(pcm_s16le=pcm, sample_rate_hz=self.sample_rate_hz)

    def iter_pcm(self, text: str, voice_id: str, *, sentence_chunks: bool = False) -> Iterator[bytes]:
        """Yield signed 16-bit little-endian PCM as Kokoro completes each segment."""
        if not text.strip():
            raise ValueError("Text must contain at least one non-whitespace character.")
        if not re.fullmatch(r"a[fm]_[a-z]+", voice_id):
            raise ValueError("Use a built-in American English voice ID such as af_heart.")

        split_pattern = r"(?<=[.!?])\s+|\n+" if sentence_chunks else r"\n+"
        pipeline = self._pipeline(text, voice=voice_id, split_pattern=split_pattern)
        produced_audio = False
        while True:
            with torch.inference_mode():
                result = next(pipeline, None)
                if result is None:
                    break
                _, _, audio = result
                if audio is None or not audio.numel():
                    continue
                samples = audio.cpu().numpy()
                pcm = (samples * 32768).round().clip(-32768, 32767).astype("<i2").tobytes()
            produced_audio = True
            yield pcm
        if not produced_audio:
            raise RuntimeError("Kokoro returned no audio for the supplied text.")
