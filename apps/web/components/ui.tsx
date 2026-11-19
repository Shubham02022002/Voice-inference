"use client";

import * as Tooltip from "@radix-ui/react-tooltip";
import { motion, useReducedMotion } from "framer-motion";
import type { ComponentProps, ReactNode } from "react";
import { press, spring } from "../lib/motion";

export function Button({ children, className = "", ...props }: ComponentProps<typeof motion.button>) {
  return <motion.button {...props} className={`button ${className}`} whileTap={press} whileHover={{ filter: "brightness(1.03)" }} transition={spring}>{children}</motion.button>;
}

export function IconButton({ label, children, ...props }: ComponentProps<typeof motion.button> & { label: string }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <motion.button type="button" {...props} aria-label={label} className={`icon-button ${props.className ?? ""}`} whileTap={press} transition={spring}>{children}</motion.button>
      </Tooltip.Trigger>
      <Tooltip.Portal><Tooltip.Content sideOffset={7} className="tooltip">{label}</Tooltip.Content></Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function SectionHeading({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <header className="section-heading"><div><h1>{title}</h1><p>{description}</p></div>{action}</header>;
}

export function EmptyState({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  const reduce = useReducedMotion();
  return <div className="empty-state"><motion.span className="empty-icon" animate={reduce ? undefined : { y: [0, -5, 0] }} transition={{ duration: 3, repeat: Infinity }}>{icon}</motion.span><h3>{title}</h3><p>{description}</p></div>;
}
