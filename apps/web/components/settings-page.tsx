"use client";

import * as Switch from "@radix-ui/react-switch";
import { motion } from "framer-motion";
import { spring } from "../lib/motion";
import { useWorkspace } from "../lib/workspace";
import { SectionHeading } from "./ui";

export default function SettingsPage() {
  const { theme, setTheme } = useWorkspace();
  const dark = theme === "dark";
  return <>
    <SectionHeading title="Settings" description="Preferences for this browser." />
    <div className="panel settings-content">
      <h2>Appearance</h2>
      <div className="setting-row">
        <div><strong>Dark theme</strong><p>Use the dark workspace palette.</p></div>
        <Switch.Root aria-label="Dark theme" checked={dark} onCheckedChange={(value) => setTheme(value ? "dark" : "light")} className="setting-switch">
          <Switch.Thumb asChild><motion.span className="switch-thumb" animate={{ x: dark ? 16 : 0 }} transition={spring} /></Switch.Thumb>
        </Switch.Root>
      </div>
    </div>
  </>;
}
