"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { demoGenerations, type Generation, type Project } from "./data";

type Theme = "light" | "dark";
type Toast = { id: string; title: string; detail?: string };
type Workspace = {
  theme: Theme; setTheme: (theme: Theme) => void;
  collapsed: boolean; setCollapsed: (value: boolean) => void;
  modal: string | null; setModal: (value: string | null) => void;
  favorites: string[]; toggleFavorite: (id: string) => void;
  names: Record<string, string>; renameVoice: (id: string, name: string) => void;
  projects: Project[]; setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  generations: Generation[]; setGenerations: React.Dispatch<React.SetStateAction<Generation[]>>;
  toasts: Toast[]; notify: (title: string, detail?: string) => void; dismiss: (id: string) => void;
};

const WorkspaceContext = createContext<Workspace | null>(null);

export function useStoredState<T>(key: string, fallback: T) {
  const [value, setValue] = useState(fallback);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`voiceforge:${key}`);
      if (stored !== null) setValue(JSON.parse(stored));
    } catch {
      // The workspace still works when storage is unavailable.
    }
    setLoaded(true);
  }, [key]);
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(`voiceforge:${key}`, JSON.stringify(value)); } catch {}
  }, [key, value, loaded]);
  return [value, setValue] as const;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useStoredState<Theme>("theme", "light");
  const [collapsed, setCollapsed] = useStoredState("sidebar", false);
  const [favorites, setFavorites] = useStoredState<string[]>("favorites", []);
  const [names, setNames] = useStoredState<Record<string, string>>("voice-names", {});
  const [projects, setProjects] = useStoredState<Project[]>("projects", []);
  const [generations, setGenerations] = useStoredState("generations", demoGenerations);
  const [modal, setModal] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  function dismiss(id: string) {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }

  function notify(title: string, detail?: string) {
    const id = crypto.randomUUID();
    setToasts((current) => [...current, { id, title, detail }].slice(-4));
    window.setTimeout(() => dismiss(id), 4500);
  }

  function toggleFavorite(id: string) {
    setFavorites((current) => current.includes(id) ? current.filter((voice) => voice !== id) : [...current, id]);
  }

  function renameVoice(id: string, name: string) {
    setNames((current) => ({ ...current, [id]: name }));
    notify("Voice renamed");
  }

  return (
    <WorkspaceContext.Provider value={{
      theme, setTheme, collapsed, setCollapsed, modal, setModal, favorites, toggleFavorite,
      names, renameVoice, projects, setProjects, generations, setGenerations, toasts, notify, dismiss,
    }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const workspace = useContext(WorkspaceContext);
  if (!workspace) throw new Error("WorkspaceProvider is required.");
  return workspace;
}
