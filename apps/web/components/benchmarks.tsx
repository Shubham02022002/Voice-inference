"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { SectionHeading } from "./ui";
import { spring } from "../lib/motion";

type Run = { concurrency: number; successes: number; failures: number; p50_seconds: number | null; p95_seconds: number | null; audio_seconds_per_wall_second: number };
type Metric = { name: string; unit: string; before: number; after: number; better: "lower" | "higher" };
type Report = { setup: string; notes?: string; metrics: Metric[] };
type Result = { id: string; status: string; data?: Run[] | Report };
type Selection = { selected: number; onSelect: (value: number) => void };

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

const baselineMetrics = [
  { name: "P50 full-response latency", unit: " s", value: (run: Run) => run.p50_seconds },
  { name: "P95 full-response latency", unit: " s", value: (run: Run) => run.p95_seconds },
  { name: "Successful requests", unit: "%", value: (run: Run) => 100 * run.successes / (run.successes + run.failures) },
  { name: "Audio throughput", unit: " audio s/s", value: (run: Run) => run.audio_seconds_per_wall_second },
];

function Chart({ values, unit }: { values: [string, number | null][]; unit: string }) {
  const max = Math.max(0, ...values.map(([, value]) => value ?? 0));

  return (
    <div className="chart">
      {values.map(([label, value]) => (
        <div key={label}>
          <div className="bar-label">
            <span>{label}</span>
            <strong>{value == null ? "No data" : `${value.toFixed(2)}${unit}`}</strong>
          </div>
          <div className="track" aria-hidden="true">
            <motion.span className="bar" initial={{ width: 0 }} animate={{ width: `${max ? ((value ?? 0) / max) * 100 : 0}%` }} transition={spring} />
          </div>
        </div>
      ))}
    </div>
  );
}

function MetricPicker({ metrics, selected, onSelect }: Selection & { metrics: { name: string }[] }) {
  return (
    <>
      <label htmlFor="benchmark-metric">Metric</label>
      <select id="benchmark-metric" className="field metric-control" value={selected} onChange={(event) => onSelect(Number(event.target.value))}>
        {metrics.map(({ name }, index) => <option key={index} value={index}>{name}</option>)}
      </select>
    </>
  );
}

function Baseline({ runs, selected, onSelect }: Selection & { runs: Run[] }) {
  const { value, unit } = baselineMetrics[selected];
  const values = runs.map<[string, number | null]>((run) => [
    `Concurrency ${run.concurrency} · ${run.successes}/${run.successes + run.failures} succeeded`, value(run),
  ]);
  return (
    <>
      <MetricPicker metrics={baselineMetrics} selected={selected} onSelect={onSelect} />
      <Chart values={values} unit={unit} />
      <p className="hint">Shared Linux CPU · Kokoro 0.9.4 · af_heart · mixed prompt lengths</p>
      <p className="hint">The concurrent run rejected five of six requests. Its latency comes from the one successful request, so these runs describe load behavior and cannot establish a speedup.</p>
    </>
  );
}

function validComparison(report: Report) {
  const valid = (value: number) => Number.isFinite(value) && value >= 0;
  return typeof report?.setup === "string" && Array.isArray(report.metrics) && report.metrics.length > 0 &&
    report.metrics.every((metric) => typeof metric?.name === "string" && typeof metric.unit === "string" &&
      valid(metric.before) && valid(metric.after) && ["lower", "higher"].includes(metric.better));
}

function Comparison({ report, selected, onSelect }: Selection & { report: Report }) {
  const { before, after, unit, better } = report.metrics[selected];
  const change = after - before;
  const delta = before > 0 ? `${Math.abs(change / before * 100).toFixed(1)}%` : `${Math.abs(change).toFixed(2)}${unit}`;
  const direction = change < 0 ? "lower" : "higher";
  const interpretation = direction === better ? "improved" : "regressed";
  return (
    <>
      <MetricPicker metrics={report.metrics} selected={selected} onSelect={onSelect} />
      <Chart values={[["Before", before], ["After", after]]} unit={unit} />
      <p className="hint">{change === 0 ? "No measured change." : `${delta} ${direction} after the change · ${interpretation}.`}</p>
      <p className="hint">{report.setup}</p>
      {typeof report.notes === "string" && <p className="hint">{report.notes}</p>}
    </>
  );
}

export default function Benchmarks() {
  const [phaseIndex, openPhase] = useState(0);
  const [selected, selectMetric] = useState(0);
  const [report, setReport] = useState<Result | null>(null);
  const [id, name, description, metrics] = phases[phaseIndex];
  const current = report?.id === id ? report : null;

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const response = await fetch(`/v1/benchmarks/${id}`, { signal: controller.signal });
        if (response.status === 404 && id !== "baseline") {
          if (!controller.signal.aborted) setReport({ id, status: "Awaiting data" });
          return;
        }
        if (!response.ok) throw new Error("Benchmark request failed");
        const data = await response.json();
        if (id === "baseline" ? !Array.isArray(data) : !validComparison(data)) {
          throw new Error("Invalid benchmark data");
        }
        if (!controller.signal.aborted) {
          setReport({ id, data, status: id === "baseline" ? "CPU smoke test" : "Measured" });
        }
      } catch {
        if (!controller.signal.aborted) setReport({ id, status: "Unavailable" });
      }
    }

    load();
    return () => controller.abort();
  }, [id]);

  return (
    <section id="benchmarks" aria-label="Inference benchmarks">
      <SectionHeading title="Inference benchmarks" description="Track latency, capacity, and resource use as VoiceForge changes." />
      <div className="benchmark-layout">
        <nav className="panel phase-nav" aria-label="Benchmark phases">
          {phases.map(([phaseId, label], index) => (
            <button key={phaseId} type="button" aria-current={id === phaseId ? "true" : undefined} onClick={() => {
              if (index === phaseIndex) return;
              setReport(null);
              selectMetric(0);
              openPhase(index);
            }}>{label}</button>
          ))}
        </nav>
        <article className="panel analysis" aria-labelledby="phase-title">
          <div className="analysis-heading">
            <div><h3 id="phase-title">{name}</h3><p>{description}</p></div>
            <span className="badge" role="status">{current?.status ?? "Loading"}</span>
          </div>
          <div id="measurements">
            {!current && <div className="skeleton" aria-label="Loading benchmark report" />}
            {current?.data && (Array.isArray(current.data)
              ? <Baseline runs={current.data} selected={selected} onSelect={selectMetric} />
              : <Comparison report={current.data} selected={selected} onSelect={selectMetric} />)}
            {current?.status === "Awaiting data" && (
              <><p>No results published for this phase yet.</p><p className="hint">Measures: {metrics}</p></>
            )}
            {current?.status === "Unavailable" && <p>Benchmark results could not be loaded.</p>}
          </div>
        </article>
      </div>
    </section>
  );
}
