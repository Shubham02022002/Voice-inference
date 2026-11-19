const phases = [
  ["baseline", "CPU baseline", "Full-WAV responses from the first Kokoro worker.", "Request latency, success rate, and generated audio per second."],
  ["streaming", "Streaming", "Start playback while later chunks are generated.", "Time to first playable audio, gaps between chunks, and total latency."],
  ["queueing", "Queueing", "Test what happens when several listeners request speech at once.", "P95 latency, successful requests, rejection rate, and queue wait."],
  ["batching", "Batching", "Test compatible requests together if the model supports batching.", "Throughput, P95 latency, and the time spent waiting for a batch."],
  ["caching", "Conditioning cache", "Measure whether reusable voice conditioning saves work.", "Cache hit rate, warm latency, and memory cost."],
  ["precision", "GPU precision", "Compare supported precision settings on the same GPU.", "Peak VRAM, latency, throughput, and listening quality."],
  ["chunking", "Adaptive chunking", "Compare chunk sizes under different workloads.", "Time to first playable audio, playback gaps, and boundary quality."],
  ["observability", "Reproducibility", "Capture repeated trials and the configuration used for each run.", "Trial variation, run configuration, and cost per audio minute."],
];

const phaseNav = document.querySelector("#phase-nav");
const title = document.querySelector("#phase-title");
const scope = document.querySelector("#phase-scope");
const status = document.querySelector("#phase-status");
const measurements = document.querySelector("#measurements");
let active;
let latestRequest;

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function chart(container, values, unit) {
  const graph = element("div", undefined, "chart");
  const max = Math.max(0, ...values.map(([, value]) => value ?? 0));
  for (const [label, value] of values) {
    const row = element("div");
    const caption = element("div", undefined, "bar-label");
    caption.append(element("span", label), element("strong", value === null ? "No data" : `${value.toFixed(2)}${unit}`));
    const track = element("div", undefined, "track");
    track.setAttribute("aria-hidden", "true");
    const bar = element("span", undefined, "bar");
    bar.style.width = `${max ? (value ?? 0) / max * 100 : 0}%`;
    track.append(bar);
    row.append(caption, track);
    graph.append(row);
  }
  container.replaceChildren(graph);
}

function metricPicker(metrics, draw) {
  const label = element("label", "Metric");
  label.htmlFor = "benchmark-metric";
  const picker = element("select", undefined, "metric-control");
  picker.id = label.htmlFor;
  for (const metric of metrics) picker.append(element("option", metric));
  const graph = element("div");
  const update = () => draw(graph, picker.selectedIndex);
  picker.addEventListener("change", update);
  measurements.replaceChildren(label, picker, graph);
  update();
}

function baseline(reports) {
  const metrics = [
    ["P50 full-response latency", " s", (run) => run.p50_seconds],
    ["P95 full-response latency", " s", (run) => run.p95_seconds],
    ["Successful requests", "%", (run) => 100 * run.successes / (run.successes + run.failures)],
    ["Audio throughput", " audio s/s", (run) => run.audio_seconds_per_wall_second],
  ];
  metricPicker(metrics.map(([name]) => name), (graph, index) => {
    const [, unit, value] = metrics[index];
    chart(graph, reports.map((run) => [
      `Concurrency ${run.concurrency} · ${run.successes}/${run.successes + run.failures} succeeded`, value(run),
    ]), unit);
  });
  measurements.append(
    element("p", "Shared Linux CPU · Kokoro 0.9.4 · af_heart · mixed prompt lengths", "hint"),
    element("p", "The concurrent run rejected five of six requests. Its latency comes from the one successful request, so these runs describe load behavior and cannot establish a speedup.", "hint"),
  );
}

function comparison(report) {
  const valid = (value) => Number.isFinite(value) && value >= 0;
  if (typeof report.setup !== "string" || !Array.isArray(report.metrics) || !report.metrics.length ||
      !report.metrics.every((metric) => typeof metric.name === "string" && typeof metric.unit === "string" &&
        valid(metric.before) && valid(metric.after) && ["lower", "higher"].includes(metric.better))) {
    throw new Error("Invalid benchmark report");
  }
  metricPicker(report.metrics.map(({ name }) => name), (graph, index) => {
    const { before, after, unit, better } = report.metrics[index];
    chart(graph, [["Before", before], ["After", after]], unit);
    const change = after - before;
    const delta = before > 0 ? Math.abs(change / before * 100).toFixed(1) + "%" : Math.abs(change).toFixed(2) + unit;
    const direction = change < 0 ? "lower" : "higher";
    const interpretation = direction === better ? "improved" : "regressed";
    graph.append(element("p", change === 0 ? "No measured change." : `${delta} ${direction} after the change · ${interpretation}.`, "hint"));
  });
  measurements.append(element("p", report.setup, "hint"));
  if (report.notes) measurements.append(element("p", report.notes, "hint"));
}

async function openPhase(phase, button) {
  const [id, name, description, metrics] = phase;
  const request = Symbol();
  latestRequest = request;
  active?.removeAttribute("aria-current");
  active = button;
  active.setAttribute("aria-current", "true");
  title.textContent = name;
  scope.textContent = description;
  status.textContent = "Loading";
  measurements.replaceChildren();

  try {
    const response = await fetch(`/v1/benchmarks/${id}`);
    if (response.status === 404 && id !== "baseline") {
      if (latestRequest !== request) return;
      status.textContent = "Awaiting data";
      measurements.append(
        element("p", "No results published for this phase yet."),
        element("p", `Measures: ${metrics}`, "hint"),
      );
      return;
    }
    if (!response.ok) throw new Error("Benchmark request failed");
    const data = await response.json();
    if (latestRequest !== request) return;
    if (id === "baseline") baseline(data);
    else comparison(data);
    status.textContent = id === "baseline" ? "CPU smoke test" : "Measured";
  } catch {
    if (latestRequest !== request) return;
    status.textContent = "Unavailable";
    measurements.replaceChildren(element("p", "Benchmark results could not be loaded."));
  }
}

for (const phase of phases) {
  const button = element("button", phase[1]);
  button.type = "button";
  button.addEventListener("click", () => openPhase(phase, button));
  phaseNav.append(button);
}
openPhase(phases[0], phaseNav.firstElementChild);
