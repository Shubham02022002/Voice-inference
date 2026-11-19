import { KeyRound, Mic, Video } from "lucide-react";
import { notFound } from "next/navigation";
import Benchmarks from "../../components/benchmarks";
import ComingSoon from "../../components/coming-soon";
import RecordsTable from "../../components/records-table";
import SettingsPage from "../../components/settings-page";
import SpeechStudio from "../../components/speech-studio";
import VoiceLibrary from "../../components/voice-library";

const pages: Record<string, () => React.JSX.Element> = {
  "text-to-speech": () => <SpeechStudio />,
  "speech-to-text": () => <ComingSoon title="Speech to Text" description="This workspace does not process audio uploads yet." icon={Mic} />,
  dubbing: () => <ComingSoon title="Dubbing" description="Video translation and dubbed audio are not available yet." icon={Video} />,
  projects: () => <RecordsTable />,
  history: () => <RecordsTable history />,
  voices: () => <VoiceLibrary personal />,
  "voice-library": () => <VoiceLibrary />,
  "api-keys": () => <ComingSoon title="API Keys" description="The local speech API runs without account credentials. Key management is planned." icon={KeyRound} />,
  settings: () => <SettingsPage />,
  benchmarks: () => <Benchmarks />,
};

export function generateStaticParams() {
  return Object.keys(pages).map((section) => ({ section }));
}

export const dynamicParams = false;

export default async function Section({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const Page = Object.hasOwn(pages, section) ? pages[section] : undefined;
  if (!Page) notFound();
  return <Page />;
}
