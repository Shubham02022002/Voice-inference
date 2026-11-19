function wavBlob(chunks: Uint8Array<ArrayBuffer>[], sampleRate: number) {
  const dataLength = chunks.reduce((length, chunk) => length + chunk.byteLength, 0);
  const header = new DataView(new ArrayBuffer(44));
  const writeTag = (offset: number, tag: string) => {
    for (let i = 0; i < tag.length; i++) header.setUint8(offset + i, tag.charCodeAt(i));
  };
  writeTag(0, "RIFF");
  header.setUint32(4, 36 + dataLength, true);
  writeTag(8, "WAVE");
  writeTag(12, "fmt ");
  header.setUint32(16, 16, true);
  header.setUint16(20, 1, true);
  header.setUint16(22, 1, true);
  header.setUint32(24, sampleRate, true);
  header.setUint32(28, sampleRate * 2, true);
  header.setUint16(32, 2, true);
  header.setUint16(34, 16, true);
  writeTag(36, "data");
  header.setUint32(40, dataLength, true);
  return new Blob([header.buffer, ...chunks], { type: "audio/wav" });
}

export async function playStream(
  body: ReadableStream<Uint8Array> | null,
  context: AudioContext,
  signal: AbortSignal,
  onPlaying: () => void,
) {
  if (!body) throw new Error("No audio stream was returned.");

  const reader = body.getReader();
  const decoder = new TextDecoder();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let pending = "";
  let nextStart = 0;
  let sampleRate: number | undefined;
  let finished = false;
  let playbackFinished: Promise<void> | undefined;

  try {
    while (!finished) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      if (done) throw new Error("The audio stream ended early.");
      pending += decoder.decode(value, { stream: true });
      let newline: number;

      while ((newline = pending.indexOf("\n")) !== -1 && !finished) {
        signal.throwIfAborted();
        const message = JSON.parse(pending.slice(0, newline));
        pending = pending.slice(newline + 1);

        if (message.type === "start" && !sampleRate && message.sample_rate === 24_000) {
          sampleRate = message.sample_rate;
        } else if (message.type === "audio" && sampleRate) {
          const pcm = Uint8Array.from(atob(message.pcm), (byte) => byte.charCodeAt(0));
          if (!pcm.byteLength || pcm.byteLength % 2) throw new Error("Invalid PCM audio chunk.");

          const view = new DataView(pcm.buffer);
          const buffer = context.createBuffer(1, pcm.byteLength / 2, sampleRate);
          const channel = buffer.getChannelData(0);
          for (let i = 0; i < channel.length; i++) channel[i] = view.getInt16(i * 2, true) / 32768;

          const source = context.createBufferSource();
          source.buffer = buffer;
          source.connect(context.destination);
          playbackFinished = new Promise<void>((resolve) => {
            source.onended = () => {
              source.disconnect();
              resolve();
            };
          });
          const start = nextStart > context.currentTime ? nextStart : context.currentTime + 0.025;
          source.start(start);
          nextStart = start + buffer.duration;
          if (!chunks.length) onPlaying();
          chunks.push(pcm);
        } else if (message.type === "done" && chunks.length) {
          finished = true;
        } else if (message.type === "error") {
          throw new Error(message.error || "Streaming synthesis failed.");
        } else {
          throw new Error("Invalid audio stream event.");
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }

  if (!sampleRate || !playbackFinished) throw new Error("The stream contained no playable audio.");
  return { audio: wavBlob(chunks, sampleRate), playbackFinished };
}
