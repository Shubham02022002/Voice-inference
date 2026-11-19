"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, AudioLines, AudioWaveform, ChartNoAxesCombined, Clock3, Fingerprint, LetterText, Mic, Radio, Video } from "lucide-react";
import Link from "next/link";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { usage } from "../lib/data";
import { deleteClip } from "../lib/audio-store";
import { item, lift, spring, stagger } from "../lib/motion";
import { useWorkspace } from "../lib/workspace";
import AudioPlayerRow from "./audio-player-row";
import StatCard from "./stat-card";
import { EmptyState } from "./ui";

const actions = [
  ["/text-to-speech", "Generate speech", "Turn a script into audio", AudioLines, "mint"],
  ["/voices?clone=1", "Clone a voice", "Create a voice profile", Fingerprint, "violet"],
  ["/dubbing", "Dub a video", "Prepare a localized project", Video, "peach"],
  ["/speech-to-text", "Transcribe audio", "Turn speech into text", Mic, "blue"],
] as const;

const marks = [13, 20, 29, 40, 57, 84, 120, 88, 60, 37, 49, 94, 126, 104, 69, 39, 49, 76, 111, 132, 99, 69, 52, 35, 22, 13];

export default function DashboardHome() {
  const { generations, setGenerations, notify } = useWorkspace();
  const reduce = useReducedMotion();

  return (
    <div className="home-stack">
      <section className="hero">
        <div className="hero-copy">
          <span className="hero-label"><Radio size={15} /> VOICE WORKSPACE</span>
          <h1>Good afternoon, <span>Krishna.</span></h1>
          <p>Write, generate, and refine speech in one workspace.</p>
          <Link className="hero-button" href="/text-to-speech">Generate speech <ArrowRight size={16} /></Link>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="hero-grid" />
          <div className="hero-wave">{marks.map((height, index) => <motion.span key={index} style={{ height, opacity: .35 + height / 220 }} initial={reduce ? false : { scaleY: .28 }} animate={{ scaleY: 1 }} transition={{ ...spring, delay: index * .014 }} />)}</div>
        </div>
      </section>

      <section aria-label="Demo usage overview" className="stats-grid">
        <StatCard label="Characters used" number={12480} detail="of 50,000 demo credits" icon={LetterText} />
        <StatCard label="Voices created" number={2} detail="Demo workspace voices" icon={AudioWaveform} />
        <StatCard label="API calls" number={348} detail="Demo activity this month" icon={ChartNoAxesCombined} />
        <StatCard label="Minutes generated" number={86} detail="Demo activity this month" icon={Clock3} />
      </section>

      <section aria-labelledby="quick-actions">
        <h2 className="home-section-title" id="quick-actions">Quick actions</h2>
        <motion.div className="quick-grid" variants={stagger} initial="hidden" animate="visible">
          {actions.map(([href, title, description, Icon, color]) => <motion.div key={href} variants={item} whileHover={lift} transition={spring}>
            <Link className="panel quick-action" href={href}><span className={`action-icon tone-${color}`}><Icon size={20} /></span><strong>{title}</strong><small>{description}</small><ArrowRight className="quick-arrow" size={16} /></Link>
          </motion.div>)}
        </motion.div>
      </section>

      <div className="dashboard-lower">
        <section className="panel chart-panel" aria-labelledby="usage-title">
          <header className="panel-heading"><div><h2 id="usage-title">Character usage</h2><p>Characters generated over time</p></div><span className="pill">Demo · November</span></header>
          <div className="usage-chart" role="img" aria-label="Example character usage increased from 700 characters on November 1 to 2,850 on November 19.">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <AreaChart data={usage} margin={{ left: -20, right: 10, top: 10, bottom: 0 }}>
                <defs><linearGradient id="usage-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity={.27} /><stop offset="100%" stopColor="var(--accent)" stopOpacity={.02} /></linearGradient></defs>
                <CartesianGrid stroke="var(--border-subtle)" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: "var(--text-muted)", fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={14} />
                <YAxis tick={{ fill: "var(--text-muted)", fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(value: number) => value ? `${value / 1000}k` : "0"} />
                <Tooltip contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)", borderRadius: "10px", color: "var(--text-primary)" }} />
                <Area name="Characters" type="monotone" dataKey="characters" stroke="var(--accent)" strokeWidth={2.5} fill="url(#usage-fill)" isAnimationActive={!reduce} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="panel recent-panel" aria-labelledby="recent-title">
          <header className="panel-heading"><div><h2 id="recent-title">Recent generations</h2><p>Play or download your audio</p></div><Link href="/history" className="text-link">History <ArrowRight size={14} /></Link></header>
          {generations.slice(0, 4).map((entry) => <AudioPlayerRow key={entry.id} entry={entry} onDelete={() => {
            setGenerations((current) => current.filter(({ id }) => id !== entry.id));
            if (!entry.demo) deleteClip(entry.id).catch(() => {
              setGenerations((current) => current.some(({ id }) => id === entry.id) ? current : [entry, ...current]);
              notify("Could not remove the clip", "The generation was restored.");
            });
            notify("Generation removed from history");
          }} />)}
          {!generations.length && <EmptyState icon={<AudioLines size={23} />} title="No generations yet" description="Generate speech to see it here." />}
        </section>
      </div>
    </div>
  );
}
