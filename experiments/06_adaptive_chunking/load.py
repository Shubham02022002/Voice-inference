"""Compare chunk policies through the loopback HTTP worker under synchronized bursts."""
import argparse
from base64 import b64decode
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
from threading import Barrier, Thread
from time import perf_counter
from urllib.request import Request, urlopen
import wave

from run import PROMPT
from voiceforge_inference.worker import InferenceServer


class PolicyAdapter:
    def __init__(self, model):
        self.model = model
        self.sample_rate_hz = model.sample_rate_hz
        self.sentences = False

    def iter_pcm(self, text, voice, *, sentence_chunks):
        return self.model.iter_pcm(text, voice, sentence_chunks=self.sentences)


def request_audio(url, barrier):
    request = Request(url, data=json.dumps({"text": PROMPT, "voice_id": "af_heart"}).encode(),
                      headers={"Content-Type": "application/json"})
    barrier.wait(timeout=20)
    start = perf_counter()
    first = None
    chunks = []
    max_gap = 0
    with urlopen(request, timeout=60) as response:
        queue = float(response.headers["X-Queue-Wait-Ms"])
        for line in response:
            now = perf_counter()
            event = json.loads(line)
            if event["type"] == "start":
                assert event["sample_rate"] == 24000
            elif event["type"] == "audio":
                pcm = b64decode(event["pcm"], validate=True)
                if first is None:
                    first = now
                    playable_until = now
                max_gap = max(max_gap, now - playable_until)
                playable_until = max(now, playable_until) + len(pcm) / 48000
                chunks.append(pcm)
            elif event["type"] == "done" and first is not None:
                return dict(queue_ms=queue, first_pcm_ms=(first-start)*1000,
                            total_ms=(now-start)*1000, max_playback_gap_ms=max_gap*1000,
                            chunks=len(chunks)), b"".join(chunks), start, now
            else:
                raise RuntimeError(event)
    raise RuntimeError("Incomplete stream")


def benchmark(model, out):
    adapter = PolicyAdapter(model)
    bursts = []
    with InferenceServer(0, adapter) as server, ThreadPoolExecutor(max_workers=4) as clients:
        thread = Thread(target=server.serve_forever)
        thread.start()
        try:
            url = f"http://127.0.0.1:{server.server_port}/synthesize/stream"
            for adapter.sentences in (False, True):
                request_audio(url, Barrier(1))
            for size in (1, 2, 4):
                for index in range(4):
                    for sentence in ((False, True) if index % 2 == 0 else (True, False)):
                        adapter.sentences = sentence
                        policy = "sentence" if sentence else "paragraph"
                        gate = Barrier(size)
                        jobs = [clients.submit(request_audio, url, gate) for _ in range(size)]
                        runs = [job.result() for job in jobs]
                        elapsed = max(r[3] for r in runs) - min(r[2] for r in runs)
                        bursts.append(dict(concurrency=size, round=index+1, policy=policy,
                            requests=[r[0] for r in runs],
                            audio_seconds_per_second=sum(len(r[1]) for r in runs)/48000/elapsed))
                        if size == 1 and index == 0:
                            with wave.open(str(out / f"{policy}.wav"), "wb") as wav:
                                wav.setparams((1, 2, 24000, 0, "NONE", "not compressed"))
                                wav.writeframes(runs[0][1])
        finally:
            server.shutdown()
            thread.join()
    return bursts


if __name__ == "__main__":
    import torch
    from voiceforge_inference.models.kokoro import KokoroAdapter
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    out = parser.parse_args().output
    out.mkdir(parents=True, exist_ok=True)
    rows = benchmark(KokoroAdapter(device="cuda"), out)
    (out / "chunking-load.json").write_text(json.dumps(dict(gpu=torch.cuda.get_device_name(),
        precision="fp32", voice="af_heart", prompt=PROMPT, bursts=rows), indent=2))
