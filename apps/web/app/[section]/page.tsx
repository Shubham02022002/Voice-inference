import { notFound } from "next/navigation";
import Benchmarks from "../../components/benchmarks";
import RecordsTable from "../../components/records-table";
import SettingsPage from "../../components/settings-page";
import SpeechStudio from "../../components/speech-studio";
import UploadWorkflow from "../../components/upload-workflow";
import VoiceLibrary from "../../components/voice-library";

const pages: Record<string, () => React.JSX.Element> = {
  "text-to-speech": () => <SpeechStudio />,
  "speech-to-text": () => <UploadWorkflow />,
  dubbing: () => <UploadWorkflow dubbing />,
  projects: () => <RecordsTable />,
  history: () => <RecordsTable history />,
  voices: () => <VoiceLibrary personal />,
  "voice-library": () => <VoiceLibrary />,
  "api-keys": () => <SettingsPage keysPage />,
  settings: () => <SettingsPage />,
  benchmarks: () => <Benchmarks />,
};

export function generateStaticParams() {
  return Object.keys(pages).map((section) => ({ section }));
}

export const dynamicParams = false;

export default async function Section({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const Page = pages[section];
  if (!Page) notFound();
  return <Page />;
}
