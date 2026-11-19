"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AudioLines, Download, LoaderCircle, Square } from "lucide-react";
import { useState } from "react";
import { page, spring } from "../lib/motion";
import { WaveformVisualizer } from "./audio-player-row";
import { Button } from "./ui";

export default function GenerateBar({ busy, result, status, streaming, onStop }: { busy: boolean; result: string; status: string; streaming: boolean; onStop: () => void }) {
  const [playing, setPlaying] = useState(false);
  const state = busy ? "loading" : result ? "result" : "idle";
  return <div className="generate-bar panel">
    <div role="status" className="generate-status">{status || "Kokoro · 24 kHz WAV"}</div>
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={state} className="generate-controls" variants={page} initial="hidden" animate="visible" exit="exit" layout transition={spring}>
        {state === "result" && <>
          <WaveformVisualizer playing={playing} />
          <audio src={result} aria-label="Generated speech" controls preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
          <a className="icon-button" aria-label="Download WAV" title="Download WAV" href={result} download="voiceforge.wav"><Download size={17} /></a>
        </>}
        <Button className="primary generate-button" type="submit" disabled={busy}>
          {busy ? <><LoaderCircle className="spinner" size={18} /> Generating</> : <><AudioLines size={18} /> {result ? "Generate again" : "Generate speech"}</>}
        </Button>
        {busy && streaming && <Button type="button" onClick={onStop}><Square size={15} /> Stop</Button>}
      </motion.div>
    </AnimatePresence>
  </div>;
}
