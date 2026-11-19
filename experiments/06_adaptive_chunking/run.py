"""Compare paragraph and sentence segmentation on a warmed Kokoro GPU worker."""
import argparse
import json
from pathlib import Path
from time import perf_counter
import wave

PROMPT = ("Welcome to VoiceForge. The appointment is at 10:45 on November 19. "
          "Please write down the reference number, 7462, before we continue. "
          "When you are ready, listen for the pause between these two sentences.")


def measure(adapter, sentence_chunks, clock=perf_counter):
    chunks = []
    started = clock()
    playable_until = started
    stalls = []
    for pcm in adapter.iter_pcm(PROMPT, "af_heart", sentence_chunks=sentence_chunks):
        arrived = clock()
        if chunks:
            stalls.append(max(0, arrived - playable_until))
        else:
            first = arrived - started
        playable_until = max(playable_until, arrived) + len(pcm) / 48000
        chunks.append(pcm)
    elapsed = clock() - started
    if not chunks:
        raise ValueError("Empty synthesis")
    audio = b"".join(chunks)
    return audio, dict(first_pcm_ms=first * 1000, max_playback_gap_ms=max(stalls, default=0) * 1000,
                       chunks=len(chunks), audio_seconds_per_second=len(audio) / 48000 / elapsed)


def main():
    from voiceforge_inference.models.kokoro import KokoroAdapter
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    out = parser.parse_args().output
    out.mkdir(parents=True, exist_ok=True)
    adapter = KokoroAdapter(device="cuda")
    trials = []
    for policy in (False, True):
        measure(adapter, policy)
    for index in range(4):
        for policy in ((False, True) if index % 2 == 0 else (True, False)):
            audio, metrics = measure(adapter, policy)
            label = "sentence" if policy else "paragraph"
            trials.append(dict(round=index + 1, policy=label, **metrics))
            if index == 0:
                with wave.open(str(out / f"{label}.wav"), "wb") as wav:
                    wav.setparams((1, 2, 24000, 0, "NONE", "not compressed"))
                    wav.writeframes(audio)
    (out / "chunking.json").write_text(json.dumps(dict(prompt=PROMPT, voice="af_heart",
        device="cuda", precision="fp32", concurrency=1, trials=trials), indent=2))


if __name__ == "__main__":
    main()
