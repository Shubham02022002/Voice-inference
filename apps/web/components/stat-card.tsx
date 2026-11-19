"use client";

import { animate, useMotionValue, useMotionValueEvent, useReducedMotion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";

export default function StatCard({ label, number, detail, icon: Icon }: { label: string; number: number; detail: string; icon: LucideIcon }) {
  const value = useMotionValue(0);
  const [display, setDisplay] = useState(0);
  const reduce = useReducedMotion();
  useMotionValueEvent(value, "change", setDisplay);
  useEffect(() => {
    if (reduce) { value.set(number); return; }
    const tween = animate(value, number, { duration: .85, ease: "easeOut" });
    return () => tween.stop();
  }, [number, reduce, value]);
  return <article className="panel stat-card">
    <div><span>{label}</span><span className="stat-icon"><Icon size={17} /></span></div>
    <strong>{Math.round(display).toLocaleString("en-US")}</strong>
    <small>{detail}</small>
  </article>;
}
