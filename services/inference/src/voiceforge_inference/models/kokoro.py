"""Kokoro-82M adapter for American English speech."""

from collections.abc import Iterator
import re

import torch
from kokoro import KPipeline

from ..conditioning import ConditioningCache, DEFAULT_CACHE_BYTES, DEFAULT_TTL_SECONDS
from .base import ModelAdapter, SynthesisResult


class ResidentVoicePipeline(KPipeline):
    def load_voice(self, voice, delimiter=","):
        # Kokoro 0.9.4 checks the CPU FloatTensor type for a supplied pack.
        if isinstance(voice, torch.Tensor):
            return voice
        return super().load_voice(voice, delimiter)


class KokoroAdapter(ModelAdapter):
    def __init__(
        self,
        device: str = "cpu",
        *,
        cache_bytes: int | None = DEFAULT_CACHE_BYTES,
        cache_ttl: float = DEFAULT_TTL_SECONDS,
    ) -> None:
        if device == "cuda" and not torch.cuda.is_available():
            raise RuntimeError("CUDA is unavailable. Use the CUDA build of PyTorch on a GPU runtime.")
        self.conditioning = (
            None if cache_bytes is None else ConditioningCache[torch.Tensor](cache_bytes, cache_ttl)
        )
        self._pipeline = ResidentVoicePipeline(
            lang_code="a", repo_id="hexgrad/Kokoro-82M", device=device
        )

    sample_rate_hz = 24_000

    def _load_conditioning(self, voice_id: str) -> tuple[torch.Tensor, int]:
        try:
            # Kokoro caches on load. The managed cache owns the retained tensor.
            pack = self._pipeline.load_voice(voice_id).to(self._pipeline.model.device)
        finally:
            self._pipeline.voices.pop(voice_id, None)
        return pack, pack.numel() * pack.element_size()

    def conditioning_stats(self) -> dict:
        if self.conditioning is None:
            return {"mode": "upstream"}
        return {"mode": "managed", **self.conditioning.stats()}


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
        voice: str | torch.Tensor = voice_id
        if self.conditioning is not None:
            with torch.inference_mode():
                voice = self.conditioning.get(voice_id, self._load_conditioning)
        pipeline = self._pipeline(text, voice=voice, split_pattern=split_pattern)
        produced_audio = False
        while True:
            with torch.inference_mode():
                result = next(pipeline, None)
                if result is None:
                    break
                _, _, audio = result
                if audio is None or not audio.numel():
                    continue
                samples = audio.to(device="cpu", dtype=torch.float32).numpy()
                pcm = (samples * 32768).round().clip(-32768, 32767).astype("<i2").tobytes()
            produced_audio = True
            yield pcm
        if not produced_audio:
            raise RuntimeError("Kokoro returned no audio for the supplied text.")
