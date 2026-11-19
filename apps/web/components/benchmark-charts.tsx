"use client";

import { useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type Series = { key: string; label: string; color: string };
type Row = Record<string, string | number | null>;
type ChartProps = {
  title: string;
  description: string;
  data: Row[];
  series: Series[];
  unit?: string;
  kind?: "bar" | "line" | "stacked";
};

export const chartColors = {
  accent: "var(--accent)",
  neutral: "var(--chart-neutral)",
  rejected: "var(--chart-rejected)",
};

function ChartLegend({ series }: { series: Series[] }) {
  return <ul className="chart-legend" aria-label="Chart legend">
    {series.map(({ key, label, color }) => <li key={key}><span style={{ backgroundColor: color }} />{label}</li>)}
  </ul>;
}

export function ReportCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className="panel report-card">
    <header><h2>{title}</h2><p>{description}</p></header>
    {children}
  </section>;
}

export default function BenchmarkChart({ title, description, data, series, unit = "", kind = "bar" }: ChartProps) {
  const reduce = useReducedMotion();
  const axes = [
    <CartesianGrid key="grid" vertical={false} stroke="var(--border-subtle)" />,
    <XAxis key="x" dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "var(--text-muted)" }} />,
    <YAxis key="y" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "var(--text-muted)" }} width={48} tickFormatter={(value) => `${value}${unit}`} allowDecimals={kind !== "stacked"} />,
    <Tooltip key="tooltip" formatter={(value) => typeof value === "number" ? `${Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value)}${unit}` : value}
      cursor={{ fill: "var(--bg-hover)" }}
      contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)", borderRadius: 8, fontSize: 12 }} />
  ];
  return <ReportCard title={title} description={description}>
    <ChartLegend series={series} />
    <div className="benchmark-chart">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        {kind === "line" ? (
          <LineChart data={data} margin={{ top: 8, right: 14, bottom: 2, left: 1 }}>
            {axes}
            {series.map(({ key, label, color }) => <Line key={key} dataKey={key} name={label} stroke={color} strokeWidth={2} dot={{ r: 3, fill: color }} isAnimationActive={!reduce} />)}
          </LineChart>
        ) : (
          <BarChart data={data} margin={{ top: 8, right: 12, bottom: 2, left: 1 }} barGap={5}>
            {axes}
            {series.map(({ key, label, color }) => <Bar key={key} dataKey={key} name={label} fill={color} maxBarSize={36} radius={[3, 3, 0, 0]} stackId={kind === "stacked" ? "requests" : undefined} isAnimationActive={!reduce} />)}
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  </ReportCard>;
}
