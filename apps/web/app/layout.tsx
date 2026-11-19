import type { Metadata } from "next";
import type { ReactNode } from "react";
import PageShell from "../components/page-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "VoiceForge Studio",
  description: "Generate speech and analyze VoiceForge inference benchmarks.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en" suppressHydrationWarning><body>
    <a className="skip-link" href="#main-content">Skip to workspace</a>
    <PageShell>{children}</PageShell>
  </body></html>;
}
