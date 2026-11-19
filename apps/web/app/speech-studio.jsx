"use client";

import { useEffect, useRef, useState } from "react";
import { playStream } from "./stream-audio";

export default function SpeechStudio() {
  const [text, setText] = useState("Hello, welcome to VoiceForge.");
  const [voice, setVoice] = useState("af_heart");
  const [mode, setMode] = useState("wav");
  const request = useRef(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [audioUrl, setAudioUrl] = useState("");

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  useEffect(() => () => request.current?.abort(), []);

  async function generate(event) {
    event.preventDefault();
    if (busy) return;
    if (!text.trim()) {
      setStatus("Enter some text to synthesize.");
      event.currentTarget.querySelector("textarea").focus();
      return;
    }

    const controller = new AbortController();
    request.current = controller;
    const { signal } = controller;
    const streaming = mode === "stream";
    let context;
    setBusy(true);
    setStatus("Generating audio…");
    try {
      if (streaming) {
        setAudioUrl("");
        context = new AudioContext();
        await context.resume();
      }
      signal.throwIfAborted();
      const response = await fetch(streaming ? "/v1/speech/stream" : "/v1/speech", {
        signal,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice_id: voice }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Audio generation failed.");
      }
      if (streaming) {
        const { audio, playbackFinished } = await playStream(
          response.body, context, signal, () => setStatus("Streaming audio…"),
        );
        signal.throwIfAborted();
        setAudioUrl(URL.createObjectURL(audio));
        setStatus("Finishing playback…");
        await Promise.race([
          playbackFinished,
          new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true })),
        ]);
      } else {
        setAudioUrl(URL.createObjectURL(await response.blob()));
      }
      signal.throwIfAborted();
      setStatus("Audio ready.");
    } catch (error) {
      setStatus(signal.aborted ? "Playback stopped." : error.message);
    } finally {
      if (context) await context.close().catch(() => {});
      request.current = null;
      setBusy(false);
    }
  }

  return (
    <section id="studio" aria-labelledby="studio-title">
      <header className="section-heading">
        <h1 id="studio-title">Speech studio</h1>
        <p>Generate, listen to, and download speech from Kokoro.</p>
      </header>
      <form className="panel studio" onSubmit={generate}>
        <div className="editor">
          <label htmlFor="text">Text to synthesize</label>
          <textarea id="text" rows={6} maxLength={2000} required value={text} onChange={(event) => setText(event.target.value)} />
          <span className="counter">{text.length} / 2,000</span>
        </div>
        <div className="settings">
          <label htmlFor="voice">Voice</label>
          <select id="voice" value={voice} onChange={(event) => setVoice(event.target.value)}>
            <option value="af_heart">Heart</option>
            <option value="af_bella">Bella</option>
            <option value="am_michael">Michael</option>
          </select>
          <label className="mode-label" htmlFor="mode">Playback</label>
          <select id="mode" disabled={busy} value={mode} onChange={(event) => setMode(event.target.value)}>
            <option value="wav">Full WAV</option>
            <option value="stream">Stream as generated</option>
          </select>
          <dl className="format"><dt>Output</dt><dd>WAV · 24 kHz · Mono</dd></dl>
          <button type="submit" disabled={busy}>Generate audio <span aria-hidden="true">→</span></button>
          {busy && mode === "stream" && (
            <button type="button" className="stop-button" onClick={() => request.current?.abort()}>Stop</button>
          )}
        </div>
      </form>
      <p id="status" role="status">{status}</p>
      {audioUrl && (
        <section className="panel result" aria-label="Generated audio">
          <audio key={audioUrl} src={audioUrl} controls preload="metadata" aria-label="Generated speech" />
          <a href={audioUrl} download="voiceforge.wav">Download WAV</a>
        </section>
      )}
    </section>
  );
}
