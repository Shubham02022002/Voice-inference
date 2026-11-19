"use client";

import * as Switch from "@radix-ui/react-switch";
import * as Tabs from "@radix-ui/react-tabs";
import { motion } from "framer-motion";
import { Copy, Eye, EyeOff, KeyRound, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { spring } from "../lib/motion";
import { useStoredState, useWorkspace } from "../lib/workspace";
import { Button, EmptyState, IconButton, SectionHeading } from "./ui";

type DemoKey = { id: string; label: string; value: string };

export default function SettingsPage({ keysPage = false }: { keysPage?: boolean }) {
  const { theme, setTheme, notify } = useWorkspace();
  const [tab, setTab] = useState(keysPage ? "keys" : "general");
  const [autoplay, setAutoplay] = useStoredState("demo-autoplay", false);
  const [keys, setKeys] = useStoredState<DemoKey[]>("demo-keys", [{ id: "demo", label: "Example integration", value: "vf_demo_example_workspace_key" }]);

  return <>
    <SectionHeading title={keysPage ? "API Keys" : "Settings"} description={keysPage ? "Manage example credentials for the demo workspace." : "Personalize your local workspace."} />
    <Tabs.Root className="settings-layout" value={tab} onValueChange={setTab} orientation="vertical">
      <Tabs.List className="panel settings-tabs" aria-label="Workspace settings">
        {[["general", "General"], ["keys", "API Keys"]].map(([value, label]) => <Tabs.Trigger key={value} value={value}>
          {tab === value && <motion.span layoutId="settings-active" className="settings-active" transition={spring} />}<span>{label}</span>
        </Tabs.Trigger>)}
      </Tabs.List>
      <Tabs.Content value="general" className="panel settings-content">
        <h2>Appearance</h2>
        <SettingSwitch label="Dark theme" description="Use the dark workspace palette." checked={theme === "dark"} change={(value) => setTheme(value ? "dark" : "light")} />
        <SettingSwitch label="Autoplay previews" description="Example preference for integrations. This demo stores the setting locally." checked={autoplay} change={setAutoplay} />
      </Tabs.Content>
      <Tabs.Content value="keys" className="panel settings-content">
        <div className="panel-heading"><div><h2>Demo credentials</h2><p>Example values for the UI. These keys grant no access.</p></div><Button className="primary" onClick={() => {
          const id = crypto.randomUUID();
          setKeys((current) => [{ id, label: "Demo integration", value: `vf_demo_${id}` }, ...current]);
          notify("Demo key created");
        }}><Plus size={16} /> New key</Button></div>
        {keys.map((key) => <KeyRow key={key.id} entry={key} remove={() => { setKeys((current) => current.filter(({ id }) => id !== key.id)); notify("Demo key removed"); }} />)}
        {!keys.length && <EmptyState icon={<KeyRound size={24} />} title="No demo keys" description="Create an example key to try this interface." />}
      </Tabs.Content>
    </Tabs.Root>
  </>;
}

function SettingSwitch({ label, description, checked, change }: { label: string; description: string; checked: boolean; change: (value: boolean) => void }) {
  return <div className="setting-row"><div><strong>{label}</strong><p>{description}</p></div><Switch.Root aria-label={label} checked={checked} onCheckedChange={change} className="setting-switch">
    <Switch.Thumb asChild><motion.span className="switch-thumb" animate={{ x: checked ? 16 : 0 }} transition={spring} /></Switch.Thumb>
  </Switch.Root></div>;
}

function KeyRow({ entry, remove }: { entry: DemoKey; remove: () => void }) {
  const { notify } = useWorkspace();
  const [visible, setVisible] = useState(false);
  return <div className="key-row"><KeyRound size={18} /><div className="key-value"><strong>{entry.label}</strong><motion.code animate={{ filter: visible ? "blur(0px)" : "blur(2px)" }} transition={{ duration: .16 }}>{visible ? entry.value : "vf_demo_••••••••••••"}</motion.code></div>
    <IconButton label={visible ? "Hide demo key" : "Reveal demo key"} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</IconButton>
    <IconButton label="Copy demo key" onClick={() => navigator.clipboard.writeText(entry.value).then(() => notify("Demo key copied")).catch(() => notify("Clipboard unavailable"))}><Copy size={17} /></IconButton>
    <IconButton label="Delete demo key" onClick={remove}><Trash2 size={17} /></IconButton>
  </div>;
}
