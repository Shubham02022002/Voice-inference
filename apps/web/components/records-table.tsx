"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, ArrowUp, AudioLines, FolderOpen, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { deleteClip } from "../lib/audio-store";
import { formatDuration } from "../lib/data";
import { item, page, stagger } from "../lib/motion";
import { useWorkspace } from "../lib/workspace";
import AudioPlayerRow from "./audio-player-row";
import { Button, EmptyState, SectionHeading } from "./ui";

export default function RecordsTable({ history = false }: { history?: boolean }) {
  const { records, setRecords } = useRecords(history);
  const { notify } = useWorkspace();
  const [sort, setSort] = useState<{ key: "title" | "kind" | "date"; ascending: boolean }>({ key: "date", ascending: false });
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const ordered = [...records].sort((a, b) => a[sort.key].localeCompare(b[sort.key]) * (sort.ascending ? 1 : -1));
  const allSelected = records.length > 0 && selected.length === records.length;

  function changeSort(key: typeof sort.key) {
    setSort((current) => ({ key, ascending: current.key === key ? !current.ascending : true }));
  }

  return <>
    <SectionHeading title={history ? "History" : "Projects"} description={history ? "Review and manage your saved generations." : "Organize your voice and audio work."} action={!history && <Button className="primary" onClick={() => setRecords.create()}><Plus size={17} /> New project</Button>} />
    {records.length ? <div className="panel table-panel">
      <table>
        <thead><tr>
          <th><input aria-label="Select all rows" type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : records.map(({ id }) => id))} /></th>
          {([["title", history ? "Generation" : "Project"], ["kind", history ? "Voice" : "Type"], ["date", "Date"]] as const).map(([key, label]) => <th key={key} scope="col" aria-sort={sort.key === key ? (sort.ascending ? "ascending" : "descending") : "none"}>
            <button onClick={() => changeSort(key)}>{label}{sort.key === key && (sort.ascending ? <ArrowUp size={13} /> : <ArrowDown size={13} />)}</button>
          </th>)}
          {history && <th scope="col">Duration</th>}
        </tr></thead>
        <motion.tbody variants={stagger} initial="hidden" animate="visible">
          {ordered.map((record) => <motion.tr key={record.id} variants={item}>
            <td><input aria-label={`Select ${record.title}`} type="checkbox" checked={selected.includes(record.id)} onChange={() => setSelected((current) => current.includes(record.id) ? current.filter((id) => id !== record.id) : [...current, record.id])} /></td>
            <td>{history ? record.title : editing === record.id ? <form onSubmit={(event) => {
              event.preventDefault();
              const title = String(new FormData(event.currentTarget).get("title") ?? "").trim();
              if (title) { setRecords.rename(record.id, title); notify("Project renamed"); }
              setEditing(null);
            }}><input className="inline-input" name="title" aria-label="Project title" autoFocus defaultValue={record.title} maxLength={80} onBlur={() => setEditing(null)} onKeyDown={(event) => { if (event.key === "Escape") setEditing(null); }} /></form> : <button className="editable-title" onClick={() => setEditing(record.id)} aria-label={`Rename ${record.title}`}>{record.title}</button>}</td>
            <td>{record.kind}</td><td>{record.date.slice(0, 10)}</td>
            {history && <td>{formatDuration(record.duration ?? 0)}</td>}
          </motion.tr>)}
        </motion.tbody>
      </table>
    </div> : <div className="panel"><EmptyState icon={history ? <AudioLines size={24} /> : <FolderOpen size={24} />} title={history ? "No generations yet" : "No projects yet"} description={history ? "Generated audio appears here." : "Create a project to start organizing your work."} /></div>}
    {history && <HistoryPlayers />}
    <AnimatePresence>{selected.length > 0 && <motion.div className="bulk-bar panel" variants={page} initial="hidden" animate="visible" exit="exit">
      <strong>{selected.length} selected</strong><Button onClick={() => setSelected([])}>Clear</Button><Button className="danger-button" onClick={() => { setRecords.remove(selected); notify(`${selected.length} removed`); setSelected([]); }}><Trash2 size={16} /> Delete</Button>
    </motion.div>}</AnimatePresence>
  </>;
}

function HistoryPlayers() {
  const { generations } = useWorkspace();
  if (!generations.length) return null;
  return <section className="panel history-players" aria-label="Saved audio players"><h2>Saved audio</h2>{generations.map((entry) => <AudioPlayerRow key={entry.id} entry={entry} />)}</section>;
}

function useRecords(history: boolean) {
  const { projects, setProjects, generations, setGenerations, notify } = useWorkspace();
  return {
    records: history
      ? generations.map((entry) => ({ id: entry.id, title: entry.title, kind: entry.voice, duration: entry.duration, date: entry.date }))
      : projects.map((entry) => ({ id: entry.id, title: entry.title, kind: entry.type, duration: undefined, date: entry.updated })),
    setRecords: {
      create() {
        setProjects((current) => [{ id: crypto.randomUUID(), title: "Untitled project", type: "Text to Speech", updated: new Date().toISOString().slice(0, 10) }, ...current]);
        notify("Project created");
      },
      rename(id: string, title: string) {
        setProjects((current) => current.map((project) => project.id === id ? { ...project, title, updated: new Date().toISOString().slice(0, 10) } : project));
      },
      remove(ids: string[]) {
        if (!history) {
          setProjects((current) => current.filter(({ id }) => !ids.includes(id)));
          return;
        }
        const removed = generations.filter(({ id }) => ids.includes(id));
        setGenerations((current) => current.filter(({ id }) => !ids.includes(id)));
        for (const entry of removed) {
          if (entry.demo) continue;
          deleteClip(entry.id).catch(() => {
            setGenerations((current) => current.some(({ id }) => id === entry.id) ? current : [entry, ...current]);
            notify("Could not remove a clip", "The generation was restored.");
          });
        }
      },
    },
  };
}
