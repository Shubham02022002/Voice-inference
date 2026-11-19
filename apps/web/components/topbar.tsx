"use client";

import * as Popover from "@radix-ui/react-popover";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, ChevronRight, Command, Menu, Moon, Search, Sun, Zap } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { navigation } from "../lib/data";
import { page } from "../lib/motion";
import { useWorkspace } from "../lib/workspace";
import { Button, IconButton } from "./ui";

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
  const [unread, setUnread] = useState(true);
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
        <Popover.Root onOpenChange={(open) => { if (open) setUnread(false); }}>
          <Popover.Trigger className="icon-button notification" aria-label="Notifications"><Bell size={17} />
            <AnimatePresence>{unread && <motion.span className="notification-count" initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}>1</motion.span>}</AnimatePresence>
          </Popover.Trigger>
          <Popover.Portal><Popover.Content className="menu notification-menu" align="end" sideOffset={10}>
            <strong>Notifications</strong><p>Your local workspace is ready. Open Benchmarks to explore measured inference results.</p>
          </Popover.Content></Popover.Portal>
        </Popover.Root>
        <Button className="upgrade-button" aria-label="Upgrade plan" onClick={() => setModal("billing")}><Zap size={14} /> <span>Upgrade</span></Button>
      </div>
    </header>
  );
}
