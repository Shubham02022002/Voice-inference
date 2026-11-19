"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Download, Pause, Play, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { loadClip } from "../lib/audio-store";
import { formatDuration, type Generation } from "../lib/data";
import { useWorkspace } from "../lib/workspace";
import { IconButton } from "./ui";

const heights = [9, 15, 12, 23, 19, 29, 15, 23, 13, 20, 28, 15, 19, 24, 10, 16, 21, 11, 16, 8];

export function WaveformVisualizer({ playing = false }: { playing?: boolean }) {
  const reduce = useReducedMotion();
  return <div className={`waveform ${playing ? "waveform-active" : ""}`} aria-hidden="true">
    {heights.map((height, index) => <motion.span key={index} style={{ height }} animate={playing && !reduce ? { scaleY: [.55, 1.12, .55] } : { scaleY: 1 }} transition={playing && !reduce ? { repeat: Infinity, duration: .55 + index % 5 * .1, delay: index * .025 } : { duration: .2 }} />)}
  </div>;
}

export default function AudioPlayerRow({ entry, onDelete }: { entry: Generation; onDelete?: () => void }) {
  const { notify } = useWorkspace();
  const player = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [storedUrl, setStoredUrl] = useState("");

  useEffect(() => {
    let disposed = false;
    let url: string | undefined;
    if (!entry.audio) loadClip(entry.id).then((clip) => {
      if (disposed || !clip) return;
      url = URL.createObjectURL(clip);
      setStoredUrl(url);
    }).catch(() => {});
    return () => {
      disposed = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [entry.audio, entry.id]);

  const source = entry.audio || storedUrl;
  async function toggle() {
    if (!source || !player.current) {
      notify("Audio unavailable", "The clip is missing from this browser.");
      return;
    }
    if (playing) player.current.pause();
    else {
      document.querySelectorAll("audio[data-clip]").forEach((audio) => {
        if (audio !== player.current) (audio as HTMLAudioElement).pause();
      });
      await player.current.play().catch(() => notify("Could not play the clip"));
    }
  }

  return <div className="audio-row">
    <audio data-clip ref={player} src={source || undefined} preload="none" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
    <IconButton label={playing ? `Pause ${entry.title}` : `Play ${entry.title}`} className="row-play" onClick={toggle}>
      <AnimatePresence mode="wait" initial={false}><motion.span key={playing ? "pause" : "play"} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .1 }}>{playing ? <Pause size={15} /> : <Play size={15} />}</motion.span></AnimatePresence>
    </IconButton>
    <div className="clip-name"><strong>{entry.title}</strong><span>{entry.voice} · {entry.demo ? "Sample clip" : new Date(entry.date).toLocaleDateString()}</span></div>
    <WaveformVisualizer playing={playing} />
    <span className="clip-duration">{formatDuration(entry.duration)}</span>
    <div className="row-actions">
      {source && <a className="icon-button" href={source} download={entry.demo ? "voiceforge-sample.mp3" : "voiceforge.wav"} aria-label={`Download ${entry.title}`} title="Download"><Download size={16} /></a>}
      {onDelete && <IconButton label={`Delete ${entry.title}`} onClick={onDelete}><Trash2 size={15} /></IconButton>}
    </div>
  </div>;
}
