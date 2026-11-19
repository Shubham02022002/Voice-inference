"""Contracts for full-utterance text-to-speech inference."""

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class SynthesisResult:
    """Mono, signed 16-bit little-endian PCM and its sample rate in Hz."""

    pcm_s16le: bytes
    sample_rate_hz: int


class ModelAdapter(ABC):
    """A loaded text-to-speech model that can synthesize a complete utterance."""

    @abstractmethod
    def synthesize(self, text: str, voice_id: str) -> SynthesisResult:
        """Generate audio for text using the model's requested voice."""
