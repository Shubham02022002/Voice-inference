"use client";

import * as Tabs from "@radix-ui/react-tabs";
import { motion } from "framer-motion";
import { LibraryBig, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { voices } from "../lib/data";
import { spring, stagger } from "../lib/motion";
import { useWorkspace } from "../lib/workspace";
import { EmptyState, SectionHeading } from "./ui";
import VoiceCard from "./voice-card";
import { Modal } from "./workspace-overlays";

export default function VoiceLibrary({ personal = false }: { personal?: boolean }) {
  const { favorites, names, setModal } = useWorkspace();
  const [tab, setTab] = useState(personal ? "mine" : "community");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("featured");

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("clone")) setModal("clone");
  }, [setModal]);

  const results = voices.filter((voice) => {
    const matchesTab = tab === "community" || (tab === "mine" ? voice.own : favorites.includes(voice.id));
    return matchesTab && `${names[voice.id] ?? voice.name} ${voice.style} ${voice.accent}`.toLowerCase().includes(query.trim().toLowerCase());
  });
  if (sort === "name") results.sort((a, b) => (names[a.id] ?? a.name).localeCompare(names[b.id] ?? b.name));

  return <>
    <SectionHeading title={personal ? "Voices" : "Voice Library"} description="Preview Kokoro voices and save your favorites." action={<button type="button" className="button" onClick={() => setModal("clone")}>Voice cloning <span className="pill">Coming soon</span></button>} />
    <Tabs.Root value={tab} onValueChange={setTab}>
      <div className="library-tools">
        <Tabs.List aria-label="Voice collections" className="tabs">
          {[["mine", "Workspace"], ["community", "Built-in"], ["favorites", "Favorites"]].map(([value, label]) => <Tabs.Trigger key={value} value={value}>{label}{tab === value && <motion.span layoutId="voiceTabLine" className="tab-line" transition={spring} />}</Tabs.Trigger>)}
        </Tabs.List>
        <label className="filter-input"><Search size={16} /><input aria-label="Search voices" placeholder="Search voices" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <select className="field compact-field" aria-label="Sort voices" value={sort} onChange={(event) => setSort(event.target.value)}><option value="featured">Featured</option><option value="name">Name A–Z</option></select>
      </div>
      <Tabs.Content value={tab} className="library-results">
        <motion.div key={tab} className="voice-grid" variants={stagger} initial="hidden" animate="visible">
          {results.map((voice) => <VoiceCard key={voice.id} voice={voice} />)}
        </motion.div>
        {!results.length && tab !== "mine" && <EmptyState icon={<LibraryBig size={24} />} title="No voices found" description="Try another search or add a voice to favorites." />}
      </Tabs.Content>
    </Tabs.Root>
    <Modal id="clone" title="Voice cloning is coming soon" description="VoiceForge currently generates speech with the built-in Kokoro voices.">{null}</Modal>
  </>;
}
