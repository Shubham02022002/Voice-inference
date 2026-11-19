"use client";

import { motion } from "framer-motion";
import { AudioLines, Heart, Pencil, Play, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Voice } from "../lib/data";
import { item, lift, spring } from "../lib/motion";
import { useWorkspace } from "../lib/workspace";
import { IconButton } from "./ui";

export default function VoiceCard({ voice, selected, onSelect, compact = false }: { voice: Voice; selected?: boolean; onSelect?: () => void; compact?: boolean }) {
  const { favorites, toggleFavorite, names, renameVoice, notify } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const player = useRef<HTMLAudioElement>(null);
  const previewRequest = useRef<AbortController | null>(null);
  const previewUrl = useRef("");
  const name = names[voice.id] ?? voice.name;
  const favorite = favorites.includes(voice.id);

  useEffect(() => () => {
    previewRequest.current?.abort();
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
  }, []);

  async function preview() {
    if (previewing || previewRequest.current) {
      previewRequest.current?.abort();
      player.current?.pause();
      return;
    }
    if (!player.current) return;
    const controller = new AbortController();
    previewRequest.current = controller;
    setPreviewing(true);
    try {
      const response = await fetch("/v1/speech", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Hello. This is a voice preview from VoiceForge.", voice_id: voice.id }),
      });
      if (!response.ok || !response.headers.get("content-type")?.startsWith("audio/wav")) {
        throw new Error("Preview service unavailable.");
      }
      const audio = await response.blob();
      controller.signal.throwIfAborted();
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = URL.createObjectURL(audio);
      player.current.src = previewUrl.current;
      document.querySelectorAll("audio[data-clip]").forEach((other) => {
        if (other !== player.current) (other as HTMLAudioElement).pause();
      });
      await player.current.play();
    } catch {
      setPreviewing(false);
      if (!controller.signal.aborted) notify("Voice preview unavailable", "Start the local inference worker and try again.");
    } finally {
      previewRequest.current = null;
    }
  }

  return <motion.article className={`panel voice-card ${compact ? "voice-compact" : ""}`} variants={item} whileHover={compact ? undefined : lift} transition={spring}>
    <audio data-clip ref={player} preload="none" onPause={() => setPreviewing(false)} onEnded={() => setPreviewing(false)} />
    {selected && <motion.span className="voice-ring" layoutId="selectedVoice" transition={spring} />}
    <span className={`voice-avatar tone-${voice.color}`}><AudioLines size={compact ? 19 : 27} /></span>
    {onSelect ? <button type="button" className="voice-select" aria-pressed={selected} onClick={onSelect}><strong>{name}</strong><small>{voice.style}</small></button> : <div className="voice-name">
      {editing ? <form onSubmit={(event) => {
        event.preventDefault();
        const updated = String(new FormData(event.currentTarget).get("voice-name") ?? "").trim();
        if (updated) renameVoice(voice.id, updated);
        setEditing(false);
      }}><input name="voice-name" className="inline-input" aria-label="Voice name" defaultValue={name} autoFocus maxLength={40} onBlur={() => setEditing(false)} onKeyDown={(event) => { if (event.key === "Escape") setEditing(false); }} /></form> : <strong>{name}</strong>}
      <small>{voice.accent} · {voice.style}</small>
    </div>}
    <div className="voice-actions">
      {!compact && voice.own && <IconButton label={`Rename ${name}`} onClick={() => setEditing(true)}><Pencil size={15} /></IconButton>}
      {!compact && <IconButton label={favorite ? `Unfavorite ${name}` : `Favorite ${name}`} aria-pressed={favorite} onClick={() => toggleFavorite(voice.id)}><Heart size={16} fill={favorite ? "currentColor" : "none"} /></IconButton>}
      <IconButton label={previewing ? `Stop preview for ${name}` : `Preview ${name}`} onClick={preview}>{previewing ? <Square size={14} /> : <Play size={15} />}</IconButton>
    </div>
  </motion.article>;
}
