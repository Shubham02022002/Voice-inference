"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { motion } from "framer-motion";
import { LibraryBig, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { voices } from "../lib/data";
import { spring, stagger } from "../lib/motion";
import { useWorkspace } from "../lib/workspace";
import { Button, EmptyState, SectionHeading } from "./ui";
import VoiceCard from "./voice-card";
import { Modal } from "./workspace-overlays";
import { UploadZone } from "./upload-workflow";

export default function VoiceLibrary({ personal = false }: { personal?: boolean }) {
  const { favorites, names, setModal, notify } = useWorkspace();
  const [tab, setTab] = useState(personal ? "mine" : "community");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("featured");
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("clone")) setModal("clone");
  }, [setModal]);

  const results = voices.filter((voice) => {
    const matchesTab = tab === "community" || (tab === "mine" ? voice.own : favorites.includes(voice.id));
    return matchesTab && `${names[voice.id] ?? voice.name} ${voice.style} ${voice.accent}`.toLowerCase().includes(query.trim().toLowerCase());
  });
  if (sort === "name") results.sort((a, b) => (names[a.id] ?? a.name).localeCompare(names[b.id] ?? b.name));

  return <>
    <SectionHeading title={personal ? "Voices" : "Voice Library"} description="Discover curated voices and organize your favorites." action={<Button className="primary" onClick={() => setModal("clone")}><Plus size={17} /> Clone a voice</Button>} />
    <Tabs.Root value={tab} onValueChange={setTab}>
      <div className="library-tools">
        <Tabs.List aria-label="Voice collections" className="tabs">
          {[["mine", "My Voices"], ["community", "Community"], ["favorites", "Favorites"]].map(([value, label]) => <Tabs.Trigger key={value} value={value}>{label}{tab === value && <motion.span layoutId="voiceTabLine" className="tab-line" transition={spring} />}</Tabs.Trigger>)}
        </Tabs.List>
        <label className="filter-input"><Search size={16} /><input aria-label="Search voices" placeholder="Search voices" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <select className="field compact-field" aria-label="Sort voices" value={sort} onChange={(event) => setSort(event.target.value)}><option value="featured">Featured</option><option value="name">Name A–Z</option></select>
      </div>
      <Tabs.Content value={tab} className="library-results">
        <motion.div key={tab} className="voice-grid" variants={stagger} initial="hidden" animate="visible">
          {results.map((voice) => <VoiceCard key={voice.id} voice={voice} />)}
          {tab === "mine" && <motion.button className="clone-card" whileHover={{ scale: 1.015 }} whileTap={{ scale: .97 }} transition={spring} onClick={() => setModal("clone")}><Plus size={26} /><strong>Clone your voice</strong><small>Upload a sample to try the demo workflow</small></motion.button>}
        </motion.div>
        {!results.length && tab !== "mine" && <EmptyState icon={<LibraryBig size={24} />} title="No voices found" description="Try another search or add a voice to favorites." />}
      </Tabs.Content>
    </Tabs.Root>
    <Modal id="clone" title="Clone a voice" description="Demo upload. This workspace does not train or clone voices.">
      <UploadZone file={file} onFile={setFile} accept="audio/*" label="Drop a voice sample" />
      <Button className="primary mt-4" disabled={!file} onClick={() => { setModal(null); setFile(null); notify("Demo sample received", "No voice model was created."); }}>Finish demo</Button>
    </Modal>
  </>;
}
