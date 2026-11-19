import "./globals.css";

export const metadata = {
  title: "VoiceForge Studio",
  description: "Generate speech and analyze VoiceForge inference benchmarks.",
};

export default function RootLayout({ children }) {
  return <html lang="en"><body>{children}</body></html>;
}
