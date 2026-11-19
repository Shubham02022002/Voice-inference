import { AudioLines, AudioWaveform, FolderOpen, History, House, KeyRound, LibraryBig, Mic, Settings, Video, ChartNoAxesCombined } from "lucide-react";

export const navigation = [
  { path: "/", label: "Dashboard", icon: House, group: "Workspace" },
  { path: "/text-to-speech", label: "Text to Speech", icon: AudioLines, group: "Workspace" },
  { path: "/speech-to-text", label: "Speech to Text", icon: Mic, group: "Workspace" },
  { path: "/dubbing", label: "Dubbing", icon: Video, group: "Workspace" },
  { path: "/projects", label: "Projects", icon: FolderOpen, group: "Workspace" },
  { path: "/history", label: "History", icon: History, group: "Workspace" },
  { path: "/voices", label: "Voices", icon: AudioWaveform, group: "Manage" },
  { path: "/voice-library", label: "Voice Library", icon: LibraryBig, group: "Manage" },
  { path: "/benchmarks", label: "Benchmarks", icon: ChartNoAxesCombined, group: "Manage" },
  { path: "/api-keys", label: "API Keys", icon: KeyRound, group: "Manage" },
  { path: "/settings", label: "Settings", icon: Settings, group: "Manage" },
];

export type Voice = { id: string; name: string; style: string; accent: string; color: string; own?: boolean };
export const voices: Voice[] = [
  { id: "af_heart", name: "Heart", style: "Warm narration", accent: "US English", color: "mint", own: true },
  { id: "af_bella", name: "Bella", style: "Conversational", accent: "US English", color: "peach", own: true },
  { id: "am_michael", name: "Michael", style: "Clear and grounded", accent: "US English", color: "violet" },
  { id: "af_nicole", name: "Nicole", style: "Soft and intimate", accent: "US English", color: "yellow" },
  { id: "am_adam", name: "Adam", style: "Deep narration", accent: "US English", color: "blue" },
  { id: "af_sarah", name: "Sarah", style: "Bright storytelling", accent: "US English", color: "peach" },
];

export type Generation = { id: string; title: string; voice: string; duration: number; date: string; audio?: string; demo?: boolean };
export const demoGenerations: Generation[] = [
  { id: "demo-intro", title: "Welcome to VoiceForge", voice: "Heart", duration: 2.3, date: "2026-11-19T10:30:00Z", audio: "/audio/welcome.mp3", demo: true },
];

export type Project = { id: string; title: string; type: string; updated: string };
export const demoProjects: Project[] = [
  { id: "launch", title: "Product launch narration", type: "Text to Speech", updated: "2026-11-19" },
  { id: "field", title: "Field notes episode 04", type: "Speech to Text", updated: "2026-11-17" },
  { id: "onboard", title: "Onboarding walkthrough", type: "Dubbing", updated: "2026-11-14" },
];

export const usage = [
  { day: "Nov 1", characters: 700 }, { day: "Nov 4", characters: 1300 },
  { day: "Nov 7", characters: 1100 }, { day: "Nov 10", characters: 2500 },
  { day: "Nov 13", characters: 1900 }, { day: "Nov 16", characters: 3200 },
  { day: "Nov 19", characters: 2850 },
];
export const formatDuration = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds) % 60).padStart(2, "0")}`;
