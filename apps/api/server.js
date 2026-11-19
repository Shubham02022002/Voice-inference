import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import express from "express";

const app = express();
const worker = process.env.INFERENCE_URL || "http://127.0.0.1:8000";
const port = Number(process.env.PORT || 3000);

app.use((request, response, next) => {
  request.id = randomUUID();
  response.set("X-Request-ID", request.id);
  next();
});
app.use(express.json({ limit: "16kb" }));

function fail(request, response, status, message) {
  return response.status(status).json({ error: message, request_id: request.id });
}

app.post("/v1/speech", async (request, response) => {
  const { text, voice_id: voice = "af_heart" } = request.body ?? {};
  if (typeof text !== "string" || !text.trim() || [...text].length > 2000) {
    return fail(request, response, 400, "Text must contain 1–2000 characters.");
  }
  if (typeof voice !== "string" || !/^a[fm]_[a-z]+$/.test(voice)) {
    return fail(request, response, 400, "Use an American English voice ID such as af_heart.");
  }

  const timeout = AbortSignal.timeout(60_000);
  try {
    const upstream = await fetch(new URL("/synthesize", worker), {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Request-ID": request.id },
      body: JSON.stringify({ text, voice_id: voice }),
      signal: timeout,
    });
    if (!upstream.ok) {
      const details = await upstream.json().catch(() => ({}));
      return fail(request, response, upstream.status, details.error || "Inference worker failed.");
    }
    response.type("audio/wav").send(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    const status = timeout.aborted ? 504 : 502;
    return fail(request, response, status, status === 504 ? "Inference timed out." : "Inference worker is unavailable.");
  }
});

const experiments = new URL("../../experiments/", import.meta.url);

app.get("/v1/benchmarks/:phase", async (request, response) => {
  const { phase } = request.params;
  if (phase === "baseline") {
    const reports = await Promise.all([1, 2].map(async (concurrency) => {
      const path = new URL(`00_baseline/cpu-smoke-c${concurrency}.json`, experiments);
      return JSON.parse(await readFile(path, "utf8"));
    }));
    return response.json(reports);
  }
  if (!/^[a-z]+$/.test(phase)) return fail(request, response, 404, "Benchmark phase not found.");
  try {
    const path = new URL(`dashboard/${phase}.json`, experiments);
    return response.json(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (error.code === "ENOENT") return fail(request, response, 404, "No measurements published.");
    throw error;
  }
});

app.use(express.static(fileURLToPath(new URL("./public", import.meta.url))));
app.use((request, response) => fail(request, response, 404, "Route not found."));
app.use((error, request, response, next) => {
  if (response.headersSent) return next(error);
  if (error.type === "entity.too.large") return fail(request, response, 413, "Request is too large.");
  if (error.type === "entity.parse.failed") return fail(request, response, 400, "Invalid JSON request.");
  return fail(request, response, 500, "Unexpected gateway error.");
});

app.listen(port, "127.0.0.1", () => console.log(`VoiceForge listening on http://127.0.0.1:${port}`));
