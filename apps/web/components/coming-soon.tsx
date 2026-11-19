import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { SectionHeading } from "./ui";

export default function ComingSoon({ title, description, icon: Icon }: { title: string; description: string; icon: LucideIcon }) {
  return <>
    <SectionHeading title={title} description="Coming soon" />
    <section className="panel forthcoming">
      <Icon size={22} aria-hidden="true" />
      <h2>{title} is coming soon</h2>
      <p>{description}</p>
      <Link className="text-link" href="/text-to-speech">Open Text to Speech</Link>
    </section>
  </>;
}
