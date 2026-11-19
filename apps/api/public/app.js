const form = document.querySelector("form");
const text = document.querySelector("#text");
const voice = document.querySelector("#voice");
const button = form.querySelector("button");
const status = document.querySelector("#status");
const result = document.querySelector("#result");
const player = result.querySelector("audio");
const download = result.querySelector("a");
let audioUrl;

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!text.value.trim()) {
    status.textContent = "Enter some text to synthesize.";
    text.focus();
    return;
  }

  button.disabled = true;
  status.textContent = "Generating audio…";
  try {
    const response = await fetch("/v1/speech", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.value, voice_id: voice.value }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || "Audio generation failed.");
    }
    const nextUrl = URL.createObjectURL(await response.blob());
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioUrl = nextUrl;
    player.src = audioUrl;
    download.href = audioUrl;
    result.hidden = false;
    status.textContent = "Audio ready.";
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
