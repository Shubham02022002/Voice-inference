"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, Command, Menu, Moon, Search, Sun } from "lucide-react";
import { usePathname } from "next/navigation";
import { navigation } from "../lib/data";
import { page } from "../lib/motion";
import { useWorkspace } from "../lib/workspace";
import { IconButton } from "./ui";

export function ThemeToggle() {
  const { theme, setTheme } = useWorkspace();
  return (
    <IconButton label={`Switch to ${theme === "light" ? "dark" : "light"} theme`} onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={theme} initial={{ opacity: 0, rotate: -30 }} animate={{ opacity: 1, rotate: 0 }} exit={{ opacity: 0, rotate: 30 }} transition={{ duration: .13 }}>
          {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
        </motion.span>
      </AnimatePresence>
    </IconButton>
  );
}

export default function Topbar() {
  const pathname = usePathname();
  const { setModal } = useWorkspace();
  const label = navigation.find((entry) => entry.path === pathname)?.label ?? "Studio";

  return (
    <header className="topbar">
      <div className="flex min-w-0 items-center gap-2">
        <IconButton className="drawer-toggle" label="Open navigation" onClick={() => setModal("navigation")}><Menu size={20} /></IconButton>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={pathname} className="breadcrumb" variants={page} initial="hidden" animate="visible" exit="exit">
            <span>Workspace</span><ChevronRight size={14} /><strong>{label}</strong>
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="top-actions">
        <button className="search-trigger" onClick={() => setModal("search")} aria-label="Search workspace"><Search size={16} /><span>Search workspace</span><kbd><Command size={12} /> K</kbd></button>
        <ThemeToggle />
      </div>
    </header>
  );
}
