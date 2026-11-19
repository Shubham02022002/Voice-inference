"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Check, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { navigation } from "../lib/data";
import { dialog, item, overlay, spring, stagger } from "../lib/motion";
import { useWorkspace } from "../lib/workspace";
import { IconButton } from "./ui";

export function Modal({ id, title, description, children }: { id: string; title: string; description: string; children: ReactNode }) {
  const { modal, setModal } = useWorkspace();
  const open = modal === id;
  return (
    <Dialog.Root open={open} onOpenChange={(value) => setModal(value ? id : null)}>
      <AnimatePresence>
        {open && <Dialog.Portal forceMount>
          <Dialog.Overlay asChild forceMount><motion.div className="backdrop" variants={overlay} initial="hidden" animate="visible" exit="exit" /></Dialog.Overlay>
          <Dialog.Content asChild forceMount>
            <motion.div className="modal-panel" variants={dialog} initial="hidden" animate="visible" exit="exit">
              <div className="modal-header"><Dialog.Title>{title}</Dialog.Title><Dialog.Close asChild><IconButton label="Close dialog"><X size={18} /></IconButton></Dialog.Close></div>
              <Dialog.Description className="modal-description">{description}</Dialog.Description>
              {children}
            </motion.div>
          </Dialog.Content>
        </Dialog.Portal>}
      </AnimatePresence>
    </Dialog.Root>
  );
}

function SearchResults() {
  const router = useRouter();
  const { setModal } = useWorkspace();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const results = navigation.filter(({ label }) => label.toLowerCase().includes(query.trim().toLowerCase()));
  function go(path: string) { setModal(null); router.push(path); }
  return (
    <>
      <label className="command-input"><Search size={18} /><input autoFocus role="combobox" aria-label="Find a page" aria-expanded="true" aria-controls="command-results" aria-activedescendant={results[selected] ? `command-${selected}` : undefined} value={query} placeholder="Type a page name…" onChange={(event) => { setQuery(event.target.value); setSelected(0); }} onKeyDown={(event) => {
        if (!results.length) return;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const step = event.key === "ArrowDown" ? 1 : -1;
          const next = (selected + step + results.length) % results.length;
          setSelected(next);
          document.getElementById(`command-${next}`)?.scrollIntoView({ block: "nearest" });
        }
        if (event.key === "Enter" && results[selected]) go(results[selected].path);
      }} /></label>
      <motion.div id="command-results" role="listbox" className="command-results" variants={stagger} initial="hidden" animate="visible">
        {results.map(({ path, label, icon: Icon }, index) => <motion.button key={path} id={`command-${index}`} role="option" aria-selected={index === selected} tabIndex={-1} variants={item} className="command-item" onMouseMove={() => setSelected(index)} onClick={() => go(path)}>
          {index === selected && <motion.span className="command-highlight" layoutId="commandHighlight" transition={spring} />}
          <Icon size={17} /><span>{label}</span><ArrowUpRight size={14} />
        </motion.button>)}
        {!results.length && <p className="p-4">No matching pages.</p>}
      </motion.div>
    </>
  );
}

export function CommandPalette() {
  const { setModal } = useWorkspace();
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setModal("search");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setModal]);
  return <Modal id="search" title="Search workspace" description="Jump to any page. Use the arrow keys to browse."><SearchResults /></Modal>;
}

export function Toaster() {
  const { toasts, dismiss } = useWorkspace();
  return <div className="toast-stack" aria-live="polite"><AnimatePresence initial={false}>
    {toasts.map(({ id, title, detail }) => <motion.div key={id} layout className="toast" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }} transition={spring}>
      <Check size={18} /><div><strong>{title}</strong>{detail && <p>{detail}</p>}</div><IconButton label="Dismiss notification" onClick={() => dismiss(id)}><X size={16} /></IconButton>
    </motion.div>)}
  </AnimatePresence></div>;
}
