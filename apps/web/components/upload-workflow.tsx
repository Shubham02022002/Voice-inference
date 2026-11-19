"use client";

import { AnimatePresence, motion } from "framer-motion";
import { FileAudio, FileVideo, UploadCloud, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import { page, spring } from "../lib/motion";
import { useWorkspace } from "../lib/workspace";
import { Button, IconButton, SectionHeading } from "./ui";

export function UploadZone({ file, onFile, accept, label }: { file: File | null; onFile: (file: File | null) => void; accept: string; label: string }) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const id = useId();
  const input = useRef<HTMLInputElement>(null);

  function receive(up?: File) {
    if (!up) return;
    const allowed = (up.type && accept.split(",").some((kind) => up.type.startsWith(kind.replace("*", "")))) ||
      (!up.type && /\.(wav|mp3|ogg|m4a|flac|aac|webm|mp4|mov|mkv)$/i.test(up.name) &&
       (accept.includes("video") || !/\.(mp4|mov|mkv)$/i.test(up.name)));
    if (!allowed || up.size > 50 * 1024 * 1024) {
      setError("Choose a supported media file up to 50 MB.");
      return;
    }
    setError("");
    onFile(up);
  }

  return <div>
    <motion.div className={`upload-zone ${dragging ? "upload-active" : ""}`} animate={{ scale: dragging ? 1.012 : 1 }} transition={spring} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={(event) => {
      event.preventDefault(); setDragging(false); receive(event.dataTransfer.files[0]);
    }}>
      <UploadCloud size={30} /><strong>{label}</strong><small>Up to 50 MB</small>
      <input ref={input} id={id} hidden type="file" accept={accept} onChange={(event) => { receive(event.target.files?.[0]); event.target.value = ""; }} />
      <Button type="button" onClick={() => input.current?.click()}>Browse files</Button>
    </motion.div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <AnimatePresence>{file && <motion.div key={file.name} className="selected-file" variants={page} initial="hidden" animate="visible" exit="exit">
      {file.type.startsWith("video") ? <FileVideo size={18} /> : <FileAudio size={18} />}<span>{file.name}</span><IconButton label="Remove file" onClick={() => onFile(null)}><X size={16} /></IconButton>
    </motion.div>}</AnimatePresence>
  </div>;
}

export default function UploadWorkflow({ dubbing = false }: { dubbing?: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState("Spanish");
  const [result, setResult] = useState<{ file: string; language: string } | null>(null);
  const { notify, setProjects } = useWorkspace();
  const title = dubbing ? "Dubbing" : "Speech to Text";
  return <>
    <SectionHeading title={title} description={dubbing ? "Prepare a video localization project." : "Prepare an audio file for transcription."} />
    <div className="workflow-grid">
      <section className="panel workflow-panel">
        <h2>{dubbing ? "Source video" : "Source audio"}</h2>
        <p>Files stay in your browser in this demo.</p>
        <UploadZone file={file} onFile={(next) => { setFile(next); setResult(null); }} accept={dubbing ? "video/*,audio/*" : "audio/*"} label={dubbing ? "Drop a video or audio file" : "Drop an audio file"} />
        {dubbing && <div className="mt-4"><label htmlFor="language" className="label">Target language</label><select id="language" className="field" value={language} onChange={(event) => setLanguage(event.target.value)}><option>Spanish</option><option>Hindi</option><option>French</option><option>Japanese</option></select></div>}
        <Button className="primary mt-4" disabled={!file} onClick={() => {
          if (!file) return;
          setResult({ file: file.name, language });
          setProjects((current) => [{ id: crypto.randomUUID(), title: file.name, type: title, updated: new Date().toISOString().slice(0, 10) }, ...current]);
          notify("Demo project saved");
        }}>Create demo project</Button>
      </section>
      <section className="panel workflow-panel">
        <span className="pill">Demo output</span><h2>{dubbing ? "Localization preview" : "Transcript preview"}</h2>
        {result ? <motion.div variants={page} initial="hidden" animate="visible" className="demo-output">
          <strong>{result.file}</strong><p>{dubbing ? `Target language: ${result.language}. This is a project preview. No dubbed audio was generated.` : "Example transcript: Welcome to the VoiceForge workspace. This sample text is independent of the uploaded audio."}</p>
        </motion.div> : <p>Choose a file to preview this workflow. The local inference service currently provides text to speech.</p>}
      </section>
    </div>
  </>;
}
