"use client";

import * as Dialog from "@radix-ui/react-dialog";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { AnimatePresence, motion } from "framer-motion";
import { AudioWaveform, ChevronsUpDown, PanelLeftClose, PanelLeftOpen, Settings, CreditCard, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { navigation } from "../lib/data";
import { overlay, spring } from "../lib/motion";
import { useWorkspace } from "../lib/workspace";
import { IconButton } from "./ui";

function SidebarContent({ compact = false, mobile = false }: { compact?: boolean; mobile?: boolean }) {
  const path = usePathname();
  const { collapsed, setCollapsed, setModal } = useWorkspace();

  return (
    <>
      <div className="sidebar-brand">
        <Link href="/" className="brand" onClick={() => setModal(null)} aria-label="VoiceForge dashboard">
          <span className="brand-icon"><AudioWaveform size={19} /></span>
          {!compact && <span>VoiceForge</span>}
        </Link>
        {mobile && <Dialog.Close asChild><IconButton label="Close navigation"><X size={18} /></IconButton></Dialog.Close>}
        {!mobile && !compact && <IconButton label="Collapse sidebar" onClick={() => setCollapsed(true)}><PanelLeftClose size={17} /></IconButton>}
      </div>
      {!mobile && compact && <IconButton className="expand-sidebar" label="Expand sidebar" onClick={() => setCollapsed(!collapsed)}><PanelLeftOpen size={17} /></IconButton>}
      <nav aria-label="Main navigation" className="sidebar-nav">
        {["Workspace", "Manage"].map((group) => (
          <div key={group} className="nav-group">
            {!compact && <p>{group}</p>}
            {navigation.filter((entry) => entry.group === group).map(({ path: href, label, icon: Icon, soon }) => (
              <Link key={href} href={href} aria-label={label} title={compact ? label : undefined} aria-current={path === href ? "page" : undefined} className="nav-link" onClick={() => setModal(null)}>
                {path === href && <motion.span layoutId={mobile ? "mobileNavPill" : "activeNavPill"} className="nav-active" transition={spring} />}
                <motion.span whileTap={{ rotate: -12, scale: 1.1 }} transition={spring}><Icon size={17} /></motion.span>
                {!compact && <><span>{label}</span>{soon && <small className="nav-soon">Soon</small>}</>}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="sidebar-footer">
        <Dropdown.Root>
          <Dropdown.Trigger className="profile-trigger" aria-label="Workspace menu">
            <span className="avatar profile-avatar">KC</span>
            {!compact && <><span><strong>Krishna</strong><small>Personal workspace</small></span><ChevronsUpDown size={15} className="ml-auto" /></>}
          </Dropdown.Trigger>
          <Dropdown.Portal><Dropdown.Content className="menu" side="top" align="start" sideOffset={8}>
            <Dropdown.Item asChild><Link href="/settings"><Settings size={16} /> Settings</Link></Dropdown.Item>
            <Dropdown.Item onSelect={() => setModal("billing")}><CreditCard size={16} /> Billing <small className="nav-soon">Soon</small></Dropdown.Item>
          </Dropdown.Content></Dropdown.Portal>
        </Dropdown.Root>
      </div>
    </>
  );
}

export default function Sidebar() {
  const { collapsed, modal, setModal } = useWorkspace();
  return (
    <>
      <motion.aside className={`sidebar desktop-sidebar ${collapsed ? "sidebar-compact" : ""}`} initial={false} animate={{ width: collapsed ? 72 : 240 }} transition={spring}>
        <SidebarContent compact={collapsed} />
      </motion.aside>
      <Dialog.Root open={modal === "navigation"} onOpenChange={(open) => setModal(open ? "navigation" : null)}>
        <AnimatePresence>
          {modal === "navigation" && (
            <Dialog.Portal forceMount>
              <Dialog.Overlay asChild forceMount><motion.div className="backdrop" variants={overlay} initial="hidden" animate="visible" exit="exit" /></Dialog.Overlay>
              <Dialog.Content asChild forceMount>
                <motion.aside className="sidebar mobile-sidebar" initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={spring}>
                  <Dialog.Title className="sr-only">Navigation</Dialog.Title>
                  <Dialog.Description className="sr-only">VoiceForge workspace pages</Dialog.Description>
                  <SidebarContent mobile />
                </motion.aside>
              </Dialog.Content>
            </Dialog.Portal>
          )}
        </AnimatePresence>
      </Dialog.Root>
    </>
  );
}
