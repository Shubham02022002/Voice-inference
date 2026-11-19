"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { playStream } from "../lib/stream-audio";
import { saveClip } from "../lib/audio-store";
import { voices } from "../lib/data";
import { useWorkspace } from "../lib/workspace";
import GenerateBar from "./generate-bar";
import { SectionHeading } from "./ui";
import VoiceCard from "./voice-card";

export default function SpeechStudio() {
  const [text, setText] = useState("Hello, welcome to VoiceForge.");
  const [voice, setVoice] = useState("af_heart");
  const [mode, setMode] = useState("wav");
  const request = useRef<AbortController | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const { names, notify, setGenerations } = useWorkspace();

  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (!textarea.current) return;
    textarea.current.style.height = "auto";
    textarea.current.style.height = `${Math.min(textarea.current.scrollHeight, 560)}px`;
  }, [text]);

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.current) return;
    if (!text.trim()) { textarea.current?.focus(); setStatus("Enter some text to synthesize."); return; }
    const controller = new AbortController();
    request.current = controller;
    const { signal } = controller;
    const streaming = mode === "stream";
    let context: AudioContext | undefined;
    setBusy(true);
    setStatus("Waiting for Kokoro…");
    try {
      if (streaming) {
        setAudioUrl("");
        context = new AudioContext();
        await context.resume();
      }
      signal.throwIfAborted();
      const response = await fetch(streaming ? "/v1/speech/stream" : "/v1/speech", {
        signal, method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice_id: voice }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || `Speech API returned HTTP ${response.status}. Check that Express and Kokoro are running on ports 3001 and 8000.`);
      }
      const contentType = response.headers.get("content-type")?.split(";")[0];
      if (contentType !== (streaming ? "application/x-ndjson" : "audio/wav")) throw new Error("The speech API returned an unexpected response.");
      let audio: Blob;
      if (context) {
        const stream = await playStream(response.body, context, signal, () => setStatus("Streaming audio…"));
        audio = stream.audio;
        signal.throwIfAborted();
        setStatus("Finishing playback…");
        await Promise.race([stream.playbackFinished, new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }))]);
      } else {
        audio = await response.blob();
      }
      signal.throwIfAborted();
      setAudioUrl(URL.createObjectURL(audio));
      setStatus("Audio ready.");
      const id = crypto.randomUUID();
      try {
        await saveClip(id, audio);
        setGenerations((current) => [{
          id, title: text.trim().replace(/\s+/g, " ").slice(0, 64), voice: names[voice] ?? voices.find((entry) => entry.id === voice)?.name ?? voice,
          duration: Math.max(0, (audio.size - 44) / 48000), date: new Date().toISOString(),
        }, ...current]);
      } catch {
        notify("Audio generated", "Browser storage is unavailable. Download your WAV to keep it.");
      }
    } catch (error) {
      const message = signal.aborted ? "Playback stopped." : error instanceof Error ? error.message : "Audio generation failed.";
      setStatus(message);
      if (!signal.aborted) notify("Generation failed", message);
    } finally {
      if (context) await context.close().catch(() => {});
      request.current = null;
      setBusy(false);
    }
  }

  return <>
    <SectionHeading title="Text to Speech" description="Turn your words into natural audio with Kokoro." />
    <form onSubmit={generate}>
      <div className="playground-grid">
        <div className="panel editor-panel">
          <label htmlFor="script">Script</label>
          <textarea id="script" ref={textarea} rows={10} maxLength={2000} required value={text} onChange={(event) => setText(event.target.value)} placeholder="Write or paste your script…" />
          <span className="counter">{text.length.toLocaleString("en-US")} / 2,000 characters</span>
        </div>
        <aside className="panel voice-settings">
          <div className="panel-heading"><div><h2>Select a voice</h2><p>American English · Kokoro</p></div></div>
          <div className="picker-grid">{voices.map((entry) => <VoiceCard key={entry.id} voice={entry} selected={entry.id === voice} onSelect={() => setVoice(entry.id)} compact />)}</div>
          <label htmlFor="playback" className="label">Playback</label>
          <select id="playback" className="field" value={mode} disabled={busy} onChange={(event) => setMode(event.target.value)}><option value="wav">Full WAV</option><option value="stream">Stream as generated</option></select>
          <p className="hint">Advanced voice controls · Coming soon</p>
        </aside>
      </div>
      <GenerateBar busy={busy} status={status} result={audioUrl} streaming={mode === "stream"} onStop={() => request.current?.abort()} />
    </form>
  </>;
}
