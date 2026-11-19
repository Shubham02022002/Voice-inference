"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { page, spring } from "../lib/motion";
import { useWorkspace, WorkspaceProvider } from "../lib/workspace";
import Sidebar from "./sidebar";
import Topbar from "./topbar";
import { CommandPalette, Modal, Toaster } from "./workspace-overlays";

function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { collapsed } = useWorkspace();
  return (
    <div className="workspace">
      <Sidebar />
      <motion.div className="workspace-content" initial={false} animate={{ "--sidebar-offset": collapsed ? "72px" : "240px" }} transition={spring}>
        <Topbar />
        <main id="main-content" className="page-container">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={path} variants={page} initial="hidden" animate="visible" exit="exit">{children}</motion.div>
          </AnimatePresence>
        </main>
      </motion.div>
      <CommandPalette />
      <Modal id="billing" title="Workspace plan" description="This local workspace uses demo credits and does not accept payments.">
        <div className="billing-panel"><strong>Studio demo</strong><span>50,000 example characters per month</span></div>
      </Modal>
      <Toaster />
    </div>
  );
}

export default function PageShell({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user"><Tooltip.Provider delayDuration={300}><WorkspaceProvider><Shell>{children}</Shell></WorkspaceProvider></Tooltip.Provider></MotionConfig>;
}
