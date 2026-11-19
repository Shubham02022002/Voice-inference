import SpeechStudio from "./speech-studio";
import Benchmarks from "./benchmarks";

export default function Dashboard() {
  return (
    <>
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="VoiceForge home">
          <span className="brand-mark" aria-hidden="true">▂▅▃▇▂</span> VoiceForge
        </a>
        <nav aria-label="Workspace">
          <a href="#studio"><span aria-hidden="true">◈</span> Speech studio</a>
          <a href="#benchmarks"><span aria-hidden="true">▥</span> Benchmarks</a>
        </nav>
      </aside>
      <main>
        <SpeechStudio />
        <Benchmarks />
      </main>
    </>
  );
}
