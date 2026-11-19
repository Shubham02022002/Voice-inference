"use client";

import { useEffect, useState } from "react";

export default function SpeechStudio() {
  const [text, setText] = useState("Hello, welcome to VoiceForge.");
  const [voice, setVoice] = useState("af_heart");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [audioUrl, setAudioUrl] = useState("");

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  async function generate(event) {
    event.preventDefault();
    if (busy) return;
    if (!text.trim()) {
      setStatus("Enter some text to synthesize.");
      event.currentTarget.querySelector("textarea").focus();
      return;
    }

    setBusy(true);
    setStatus("Generating audio…");
    try {
      const response = await fetch("/v1/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice_id: voice }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "Audio generation failed.");
      }
      setAudioUrl(URL.createObjectURL(await response.blob()));
      setStatus("Audio ready.");
    } catch (error) {
      setStatus(error.message);
    } finally {
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
          <dl className="format"><dt>Output</dt><dd>WAV · 24 kHz · Mono</dd></dl>
          <button type="submit" disabled={busy}>Generate audio <span aria-hidden="true">→</span></button>
        </div>
      </form>
      <p id="status" role="status">{status}</p>
      {audioUrl && (
        <section className="panel result" aria-label="Generated audio">
          <audio src={audioUrl} controls preload="metadata" aria-label="Generated speech" />
          <a href={audioUrl} download="voiceforge.wav">Download WAV</a>
        </section>
      )}
    </section>
  );
}
