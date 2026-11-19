"""WAV encoding for synthesis results."""

from io import BytesIO
import wave

from .models.base import SynthesisResult


def encode_wav(result: SynthesisResult) -> bytes:
    output = BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(result.sample_rate_hz)
        wav.writeframes(result.pcm_s16le)
    return output.getvalue()
