"use client";

import { useRef, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import KpiCard from "@/components/ui/KpiCard";
import DataSourceBadge from "@/components/ui/DataSourceBadge";
import MetricsMethodology from "@/components/ui/MetricsMethodology";
import type { OrganicPulseData, TrendPoint } from "@/lib/types";

function pct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

// CTR is always derived from clicks/impressions at render time (not read
// from a separately-stored field) so it can never drift from the two
// numbers it's displayed next to; zero impressions has no meaningful rate.
function ctrDisplay(clicks: number, impressions: number): string {
  if (impressions === 0) return "—";
  return pct(clicks / impressions);
}

function DemoDataTag() {
  return (
    <span className="ml-1 text-[9px] font-normal px-1 py-0.5 rounded-full border border-gray-200 text-gray-400 align-middle whitespace-nowrap">
      Demo data
    </span>
  );
}

// Same deterministic-hash pattern used elsewhere in this app for demo data —
// reproducible across renders, not random.
function hashSeed(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return h;
}
function addDays(date: string, delta: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
function daysBetween(from: string, to: string): number {
  return Math.round((new Date(to + "T00:00:00Z").getTime() - new Date(from + "T00:00:00Z").getTime()) / 86400000) + 1;
}
// The immediately preceding, non-overlapping range of the same length.
function previousDateRange(from: string, to: string): { from: string; to: string } {
  const len = daysBetween(from, to);
  const newTo = addDays(from, -1);
  const newFrom = addDays(newTo, -(len - 1));
  return { from: newFrom, to: newTo };
}
function sumRange(trend: TrendPoint[], from: string, to: string) {
  let clicks = 0;
  let impressions = 0;
  for (const p of trend) {
    if (p.date >= from && p.date <= to) {
      clicks += p.clicks;
      impressions += p.impressions;
    }
  }
  return { clicks, impressions };
}

interface PeriodRow {
  label: string;
  clicks: number;
  impressions: number;
}
interface PeriodSummary {
  from: string;
  to: string;
  clicks: number;
  impressions: number;
  queries: PeriodRow[];
  pages: PeriodRow[];
}

// Query/page-level clicks & impressions have no real per-day breakdown in
// this demo dataset (only the site-wide trend does), so a period's per-query/
// page values are a seeded, labeled-as-demo scale of each row's known total
// by the selected range's share of the full mock date range — honest about
// being synthetic, not a claim of real daily granularity.
function scaleForPeriod(base: number, seedKey: string, periodDays: number, totalDays: number): number {
  const seed = hashSeed(seedKey);
  const variance = 0.85 + (seed % 30) / 100; // 0.85-1.14
  return Math.max(0, Math.round(base * (periodDays / totalDays) * variance));
}

function buildPeriodSummary(data: OrganicPulseData, from: string, to: string): PeriodSummary {
  const { clicks, impressions } = sumRange(data.trend, from, to);
  const trendStart = data.trend[0]?.date ?? from;
  const trendEnd = data.trend[data.trend.length - 1]?.date ?? to;
  const totalDays = Math.max(1, daysBetween(trendStart, trendEnd));
  const periodDays = daysBetween(from, to);
  return {
    from,
    to,
    clicks,
    impressions,
    queries: data.topQueries.map((q) => ({
      label: q.query,
      clicks: scaleForPeriod(q.clicks, `${q.query}|${from}|${to}`, periodDays, totalDays),
      impressions: scaleForPeriod(q.impressions, `${q.query}|imp|${from}|${to}`, periodDays, totalDays),
    })),
    pages: data.topPages.map((p) => ({
      label: p.url,
      clicks: scaleForPeriod(p.clicks, `${p.url}|${from}|${to}`, periodDays, totalDays),
      impressions: scaleForPeriod(p.impressions, `${p.url}|imp|${from}|${to}`, periodDays, totalDays),
    })),
  };
}

function formatDateShort(d: string) {
  return new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
function pctChange(a: number, b: number): string {
  if (a === 0) return b === 0 ? "0%" : "n/a";
  const d = ((b - a) / a) * 100;
  return `${d > 0 ? "+" : ""}${d.toFixed(1)}%`;
}
function ctrPpChange(aClicks: number, aImpr: number, bClicks: number, bImpr: number): string {
  if (aImpr === 0 || bImpr === 0) return "—";
  const d = (bClicks / bImpr - aClicks / aImpr) * 100;
  return `${d > 0 ? "+" : ""}${d.toFixed(1)}pp`;
}

export default function OrganicPulseTab({
  data,
  site,
  focusKeywords = [],
  useLiveData = false,
}: {
  data: OrganicPulseData;
  site?: string;
  focusKeywords?: string[];
  useLiveData?: boolean;
}) {
  const chartData = data.trend.filter((_, i) => i % 3 === 0); // thin out for readability
  const isFocused = (query: string) => focusKeywords.some((k) => query.toLowerCase().includes(k.toLowerCase()));

  interface LivePosition {
    position: number | null;
    status: "found" | "not_found" | "error";
    error?: string;
  }

  const [livePositions, setLivePositions] = useState<Record<string, LivePosition>>({});
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  // Period comparison — entirely demo data (client-side, synchronous; no
  // network call). Defaults to the last 14 days of the trend, matching the
  // KPI cards' own "vs prior period" window above.
  const trendMin = data.trend[0]?.date ?? "";
  const trendMax = data.trend[data.trend.length - 1]?.date ?? "";
  const defaultPeriodFrom = trendMax ? addDays(trendMax, -13) : trendMin;
  const [periodFrom, setPeriodFrom] = useState(defaultPeriodFrom < trendMin ? trendMin : defaultPeriodFrom);
  const [periodTo, setPeriodTo] = useState(trendMax);
  const [periodCompareMode, setPeriodCompareMode] = useState<"off" | "previous" | "custom">("off");
  const defaultPrevious = trendMax ? previousDateRange(defaultPeriodFrom, trendMax) : { from: trendMin, to: trendMin };
  const [customPeriodFrom, setCustomPeriodFrom] = useState(defaultPrevious.from < trendMin ? trendMin : defaultPrevious.from);
  const [customPeriodTo, setCustomPeriodTo] = useState(defaultPrevious.to);
  const [periodResult, setPeriodResult] = useState<{ a: PeriodSummary; b: PeriodSummary | null } | null>(null);

  function handlePeriodFromChange(v: string) {
    setPeriodFrom(v);
    if (v > periodTo) setPeriodTo(v);
  }
  function handlePeriodToChange(v: string) {
    setPeriodTo(v);
    if (v < periodFrom) setPeriodFrom(v);
  }
  function handleCustomFromChange(v: string) {
    setCustomPeriodFrom(v);
    if (v > customPeriodTo) setCustomPeriodTo(v);
  }
  function handleCustomToChange(v: string) {
    setCustomPeriodTo(v);
    if (v < customPeriodFrom) setCustomPeriodFrom(v);
  }

  const activePeriodCompareRange =
    periodCompareMode === "previous" ? previousDateRange(periodFrom, periodTo) : { from: customPeriodFrom, to: customPeriodTo };

  function applyPeriodCompare() {
    const a = buildPeriodSummary(data, periodFrom, periodTo);
    if (periodCompareMode === "off") {
      setPeriodResult({ a, b: null });
      return;
    }
    const range = periodCompareMode === "previous" ? previousDateRange(periodFrom, periodTo) : { from: customPeriodFrom, to: customPeriodTo };
    const b = buildPeriodSummary(data, range.from, range.to);
    setPeriodResult({ a, b });
  }

  const periodLenA = daysBetween(periodFrom, periodTo);
  const periodLenB = daysBetween(activePeriodCompareRange.from, activePeriodCompareRange.to);

  async function fetchLivePositions() {
    const myRequestId = ++requestIdRef.current;
    setLiveLoading(true);
    setLiveError(null);
    setLivePositions({}); // clear stale results from a previous domain/keyword set immediately
    try {
      const res = await fetch("/api/geo/organic-position", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: site || data.site, keywords: data.topQueries.map((q) => q.query) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "DataForSEO request failed");
      if (myRequestId !== requestIdRef.current) return; // a newer request superseded this one
      const map: Record<string, LivePosition> = {};
      for (const p of json.positions as { keyword: string; position: number | null; status: LivePosition["status"]; error?: string }[]) {
        map[p.keyword] = { position: p.position, status: p.status, error: p.error };
      }
      setLivePositions(map);
    } catch (err) {
      if (myRequestId !== requestIdRef.current) return;
      setLiveError(err instanceof Error ? err.message : "DataForSEO request failed");
    } finally {
      if (myRequestId === requestIdRef.current) setLiveLoading(false);
    }
  }

  const hasLivePositions = Object.keys(livePositions).length > 0;
  const liveErrorCount = Object.values(livePositions).filter((p) => p.status === "error").length;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-sm font-semibold text-gray-900">{site || data.site}</h2>
        <DataSourceBadge source={data.source} />
        <span className="text-xs text-gray-400 sm:ml-auto">{data.dateRange}</span>
      </div>

      {useLiveData && (
        <div className="flex items-center gap-2">
          <button
            onClick={fetchLivePositions}
            disabled={liveLoading}
            className="text-xs px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-50"
          >
            {liveLoading ? "Fetching rankings from DataForSEO…" : "Fetch live rankings"}
          </button>
          {liveError && <span className="text-xs text-red-500">{liveError} — showing demo positions instead.</span>}
          {hasLivePositions && !liveError && liveErrorCount === 0 && (
            <span className="text-xs text-emerald-600">Live positions loaded.</span>
          )}
          {hasLivePositions && !liveError && liveErrorCount > 0 && (
            <span className="text-xs text-amber-600">
              Live positions loaded, but {liveErrorCount} of {Object.keys(livePositions).length} keyword requests failed.
            </span>
          )}
        </div>
      )}

      {focusKeywords.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-gray-400">Tracked keywords:</span>
          {focusKeywords.map((k) => (
            <span
              key={k}
              className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100"
            >
              {k}
            </span>
          ))}
        </div>
      )}

      <p className="text-[11px] text-gray-500">Traffic metrics use sample data to protect client confidentiality.</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Impressions" value={data.kpis.impressions.toLocaleString("en-US")} delta={data.kpis.impressionsDelta} badge="Demo data" />
        <KpiCard label="Clicks" value={data.kpis.clicks.toLocaleString("en-US")} delta={data.kpis.clicksDelta} badge="Demo data" />
        <KpiCard
          label="Avg. position"
          value={data.kpis.avgPosition.toFixed(1)}
          delta={data.kpis.avgPositionDelta}
          invertGood
          deltaFormat="absolute"
          badge="Demo data"
        />
        <KpiCard label="Avg. CTR" value={pct(data.kpis.avgCtr)} delta={data.kpis.avgCtrDelta} badge="Demo data" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Traffic trend</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={30} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="clicks" name="Clicks" stroke="#6366f1" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="impressions" name="Impressions" stroke="#a5b4fc" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Compare periods</h3>
          <p className="text-[11px] text-gray-500 mt-1">Traffic metrics use sample data to protect client confidentiality.</p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-end gap-2">
            <div>
              <label className="text-[11px] text-gray-600 block mb-1">From</label>
              <input
                type="date"
                min={trendMin}
                max={periodTo}
                value={periodFrom}
                onChange={(e) => handlePeriodFromChange(e.target.value)}
                className="text-gray-900 text-xs border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
            </div>
            <div>
              <label className="text-[11px] text-gray-600 block mb-1">To</label>
              <input
                type="date"
                min={periodFrom}
                max={trendMax}
                value={periodTo}
                onChange={(e) => handlePeriodToChange(e.target.value)}
                className="text-gray-900 text-xs border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
            </div>
          </div>
          <div>
            <label className="text-[11px] text-gray-600 block mb-1">Compare with</label>
            <select
              value={periodCompareMode}
              onChange={(e) => setPeriodCompareMode(e.target.value as "off" | "previous" | "custom")}
              className="text-gray-900 text-xs border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            >
              <option value="off">Off</option>
              <option value="previous">Previous period</option>
              <option value="custom">Custom range</option>
            </select>
          </div>
          {periodCompareMode === "custom" && (
            <div className="flex items-end gap-2">
              <div>
                <label className="text-[11px] text-gray-600 block mb-1">Compare from</label>
                <input
                  type="date"
                  min={trendMin}
                  max={customPeriodTo}
                  value={customPeriodFrom}
                  onChange={(e) => handleCustomFromChange(e.target.value)}
                  className="text-gray-900 text-xs border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
              <div>
                <label className="text-[11px] text-gray-600 block mb-1">Compare to</label>
                <input
                  type="date"
                  min={customPeriodFrom}
                  max={trendMax}
                  value={customPeriodTo}
                  onChange={(e) => handleCustomToChange(e.target.value)}
                  className="text-gray-900 text-xs border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                />
              </div>
            </div>
          )}
          <button
            onClick={applyPeriodCompare}
            className="text-xs px-4 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition"
          >
            Apply
          </button>
        </div>
        {periodCompareMode === "custom" && periodLenA !== periodLenB && (
          <p className="text-[11px] text-amber-600">
            Date range covers {periodLenA} day{periodLenA === 1 ? "" : "s"}; the compare range covers {periodLenB} day
            {periodLenB === 1 ? "" : "s"} — raw totals cover different durations, so compare rates, not totals.
          </p>
        )}

        {periodResult && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="border border-gray-100 rounded-md p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Impressions</span>
                  <DemoDataTag />
                </div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-lg font-semibold text-gray-900">{periodResult.a.impressions.toLocaleString("en-US")}</span>
                  {periodResult.b && (
                    <>
                      <span className="text-xs text-gray-400">→</span>
                      <span className="text-sm text-gray-700">{periodResult.b.impressions.toLocaleString("en-US")}</span>
                      <span
                        className={`text-xs font-medium ${periodResult.b.impressions >= periodResult.a.impressions ? "text-emerald-600" : "text-red-500"}`}
                      >
                        {pctChange(periodResult.a.impressions, periodResult.b.impressions)}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="border border-gray-100 rounded-md p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Clicks</span>
                  <DemoDataTag />
                </div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-lg font-semibold text-gray-900">{periodResult.a.clicks.toLocaleString("en-US")}</span>
                  {periodResult.b && (
                    <>
                      <span className="text-xs text-gray-400">→</span>
                      <span className="text-sm text-gray-700">{periodResult.b.clicks.toLocaleString("en-US")}</span>
                      <span
                        className={`text-xs font-medium ${periodResult.b.clicks >= periodResult.a.clicks ? "text-emerald-600" : "text-red-500"}`}
                      >
                        {pctChange(periodResult.a.clicks, periodResult.b.clicks)}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="border border-gray-100 rounded-md p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">CTR (total clicks ÷ total impressions)</span>
                  <DemoDataTag />
                </div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-lg font-semibold text-gray-900">{ctrDisplay(periodResult.a.clicks, periodResult.a.impressions)}</span>
                  {periodResult.b && (
                    <>
                      <span className="text-xs text-gray-400">→</span>
                      <span className="text-sm text-gray-700">{ctrDisplay(periodResult.b.clicks, periodResult.b.impressions)}</span>
                      <span className="text-xs font-medium text-gray-600">
                        {ctrPpChange(periodResult.a.clicks, periodResult.a.impressions, periodResult.b.clicks, periodResult.b.impressions)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <p className="text-[11px] text-gray-500">
              {formatDateShort(periodResult.a.from)}–{formatDateShort(periodResult.a.to)}
              {periodResult.b && <> vs. {formatDateShort(periodResult.b.from)}–{formatDateShort(periodResult.b.to)}</>}
            </p>

            <div className="overflow-x-auto">
              <h4 className="text-xs font-semibold text-gray-700 mb-2">Top queries — example comparison<DemoDataTag /></h4>
              <table className="w-full text-xs min-w-[480px] [&_th]:px-2 [&_td]:px-2 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0 [&_th:last-child]:pr-0 [&_td:last-child]:pr-0">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-100">
                    <th className="py-1.5 font-medium">Query</th>
                    <th className="py-1.5 font-medium text-right">Clicks</th>
                    <th className="py-1.5 font-medium text-right">Impressions</th>
                    <th className="py-1.5 font-medium text-right">CTR</th>
                  </tr>
                </thead>
                <tbody>
                  {periodResult.a.queries.map((qa, i) => {
                    const qb = periodResult.b?.queries[i];
                    return (
                      <tr key={qa.label} className="border-b border-gray-50 last:border-0">
                        <td className="py-1.5 text-gray-700">{qa.label}</td>
                        <td className="py-1.5 text-right text-gray-600">
                          {qa.clicks.toLocaleString("en-US")}
                          {qb && <span className="text-gray-400"> → {qb.clicks.toLocaleString("en-US")}</span>}
                        </td>
                        <td className="py-1.5 text-right text-gray-600">
                          {qa.impressions.toLocaleString("en-US")}
                          {qb && <span className="text-gray-400"> → {qb.impressions.toLocaleString("en-US")}</span>}
                        </td>
                        <td className="py-1.5 text-right text-gray-600">
                          {ctrDisplay(qa.clicks, qa.impressions)}
                          {qb && <span className="text-gray-400"> → {ctrDisplay(qb.clicks, qb.impressions)}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto">
              <h4 className="text-xs font-semibold text-gray-700 mb-2">Top pages — example comparison<DemoDataTag /></h4>
              <table className="w-full text-xs min-w-[420px] [&_th]:px-2 [&_td]:px-2 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0 [&_th:last-child]:pr-0 [&_td:last-child]:pr-0">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-100">
                    <th className="py-1.5 font-medium">Page</th>
                    <th className="py-1.5 font-medium text-right">Clicks</th>
                    <th className="py-1.5 font-medium text-right">Impressions</th>
                    <th className="py-1.5 font-medium text-right">CTR</th>
                  </tr>
                </thead>
                <tbody>
                  {periodResult.a.pages.map((pa, i) => {
                    const pb = periodResult.b?.pages[i];
                    return (
                      <tr key={pa.label} className="border-b border-gray-50 last:border-0">
                        <td className="py-1.5 text-gray-800 font-mono">{pa.label}</td>
                        <td className="py-1.5 text-right text-gray-600">
                          {pa.clicks.toLocaleString("en-US")}
                          {pb && <span className="text-gray-400"> → {pb.clicks.toLocaleString("en-US")}</span>}
                        </td>
                        <td className="py-1.5 text-right text-gray-600">
                          {pa.impressions.toLocaleString("en-US")}
                          {pb && <span className="text-gray-400"> → {pb.impressions.toLocaleString("en-US")}</span>}
                        </td>
                        <td className="py-1.5 text-right text-gray-600">
                          {ctrDisplay(pa.clicks, pa.impressions)}
                          {pb && <span className="text-gray-400"> → {ctrDisplay(pb.clicks, pb.impressions)}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 overflow-x-auto">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Top queries</h3>
        <table className="w-full text-xs min-w-[520px] [&_th]:px-2 [&_td]:px-2 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0 [&_th:last-child]:pr-0 [&_td:last-child]:pr-0">
          <thead>
            <tr className="text-left text-gray-400 border-b border-gray-100">
              <th className="py-2 font-medium">Query</th>
              <th className="py-2 font-medium text-right">Clicks<DemoDataTag /></th>
              <th className="py-2 font-medium text-right">Impressions<DemoDataTag /></th>
              <th className="py-2 font-medium text-right">CTR<DemoDataTag /></th>
              <th className="py-2 font-medium text-right">Position</th>
              <th className="py-2 font-medium text-right">Change</th>
            </tr>
          </thead>
          <tbody>
            {data.topQueries.map((q) => {
              const live = livePositions[q.query];
              const hasLive = live !== undefined;
              return (
                <tr
                  key={q.query}
                  className={`border-b border-gray-50 last:border-0 ${isFocused(q.query) ? "bg-indigo-50/60" : ""}`}
                >
                  <td className="py-2 text-gray-800">{q.query}</td>
                  <td className="py-2 text-right text-gray-600">{q.clicks.toLocaleString("en-US")}</td>
                  <td className="py-2 text-right text-gray-600">{q.impressions.toLocaleString("en-US")}</td>
                  <td className="py-2 text-right text-gray-600">{ctrDisplay(q.clicks, q.impressions)}</td>
                  <td className="py-2 text-right text-gray-600">
                    {hasLive ? (
                      live.status === "error" ? (
                        <span className="text-red-500" title={live.error}>request failed</span>
                      ) : live.status === "not_found" ? (
                        "not found"
                      ) : (
                        live.position
                      )
                    ) : (
                      q.position.toFixed(1)
                    )}
                    {hasLive && live.status !== "error" && (
                      <span className="ml-1 text-[9px] px-1.5 py-0.5 rounded-full border border-emerald-200 text-emerald-600 bg-emerald-50 whitespace-nowrap">
                        SERP position for this check
                      </span>
                    )}
                    {hasLive && live.status === "error" && (
                      <span className="ml-1 text-[9px] px-1.5 py-0.5 rounded-full border border-red-200 text-red-500 bg-red-50">
                        error
                      </span>
                    )}
                  </td>
                  <td className={`py-2 text-right ${q.positionChange < 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {hasLive ? "—" : `${q.positionChange < 0 ? "▲" : "▼"} ${Math.abs(q.positionChange).toFixed(1)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-[11px] text-gray-400 mt-2">
          Traffic metrics use sample data to protect client confidentiality.{" "}
          {hasLivePositions
            ? "The “SERP position for this check” badge above is the one real, live field in this table — distinct from the demo “Avg. position” KPI card higher up."
            : "Fetch live rankings above to see a real “SERP position for this check” badge next to Position."}
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 overflow-x-auto">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Top pages</h3>
        <table className="w-full text-xs min-w-[420px] [&_th]:px-2 [&_td]:px-2 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0 [&_th:last-child]:pr-0 [&_td:last-child]:pr-0">
          <thead>
            <tr className="text-left text-gray-400 border-b border-gray-100">
              <th className="py-2 font-medium">Page</th>
              <th className="py-2 font-medium text-right">Clicks<DemoDataTag /></th>
              <th className="py-2 font-medium text-right">Impressions<DemoDataTag /></th>
              <th className="py-2 font-medium text-right">CTR<DemoDataTag /></th>
            </tr>
          </thead>
          <tbody>
            {data.topPages.map((p) => (
              <tr key={p.url} className="border-b border-gray-50 last:border-0">
                <td className="py-2 text-gray-800 font-mono">{p.url}</td>
                <td className="py-2 text-right text-gray-600">{p.clicks.toLocaleString("en-US")}</td>
                <td className="py-2 text-right text-gray-600">{p.impressions.toLocaleString("en-US")}</td>
                <td className="py-2 text-right text-gray-600">{ctrDisplay(p.clicks, p.impressions)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[11px] text-gray-400 mt-2">Traffic metrics use sample data to protect client confidentiality.</p>
      </div>

      <MetricsMethodology scope="organic" />
    </div>
  );
}
