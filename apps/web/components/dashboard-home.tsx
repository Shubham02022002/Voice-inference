"use client";

import { ArrowRight, AudioLines, ChartNoAxesCombined, FolderOpen, LibraryBig } from "lucide-react";
import Link from "next/link";
import { deleteClip } from "../lib/audio-store";
import { formatDuration } from "../lib/data";
import { useWorkspace } from "../lib/workspace";
import AudioPlayerRow from "./audio-player-row";
import { EmptyState, SectionHeading } from "./ui";

const shortcuts = [
  { href: "/voice-library", label: "Browse voices", icon: LibraryBig },
  { href: "/projects", label: "Open projects", icon: FolderOpen },
  { href: "/benchmarks", label: "View benchmarks", icon: ChartNoAxesCombined },
];

export default function DashboardHome() {
  const { generations, setGenerations, projects, favorites, notify } = useWorkspace();
  const real = generations.filter((entry) => !entry.demo);
  const totalAudio = real.reduce((total, entry) => total + entry.duration, 0);

  return <div className="home-stack">
    <SectionHeading title="Overview" description="Your VoiceForge workspace." action={<Link className="button primary" href="/text-to-speech"><AudioLines size={16} /> Generate speech</Link>} />

    <dl className="overview-metrics" aria-label="Local workspace activity">
      <div><dt>Saved generations</dt><dd>{real.length}</dd></div>
      <div><dt>Generated audio</dt><dd>{formatDuration(totalAudio)}</dd></div>
      <div><dt>Projects</dt><dd>{projects.length}</dd></div>
      <div><dt>Favorite voices</dt><dd>{favorites.length}</dd></div>
    </dl>

    <div className="overview-grid">
      <section className="panel recent-panel" aria-labelledby="recent-title">
        <header className="panel-heading"><h2 id="recent-title">Recent generations</h2><Link href="/history" className="text-link">History <ArrowRight size={14} /></Link></header>
        {generations.slice(0, 5).map((entry) => <AudioPlayerRow key={entry.id} entry={entry} onDelete={() => {
          setGenerations((current) => current.filter(({ id }) => id !== entry.id));
          if (!entry.demo) deleteClip(entry.id).catch(() => {
            setGenerations((current) => current.some(({ id }) => id === entry.id) ? current : [entry, ...current]);
            notify("Could not remove the clip", "The generation was restored.");
          });
        }} />)}
        {!generations.length && <EmptyState icon={<AudioLines size={22} />} title="No generations yet" description="Generated audio appears here after you save a clip." />}
      </section>

      <nav className="panel overview-links" aria-label="Workspace shortcuts">
        <h2>Workspace</h2>
        {shortcuts.map(({ href, label, icon: Icon }) => <Link key={href} href={href}><Icon size={17} /><span>{label}</span><ArrowRight size={15} /></Link>)}
      </nav>
    </div>
  </div>;
}
