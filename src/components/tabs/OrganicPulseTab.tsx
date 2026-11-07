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
import type { OrganicPulseData } from "@/lib/types";

function pct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
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

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Impressions" value={data.kpis.impressions.toLocaleString()} delta={data.kpis.impressionsDelta} />
        <KpiCard label="Clicks" value={data.kpis.clicks.toLocaleString()} delta={data.kpis.clicksDelta} />
        <KpiCard
          label="Avg. position"
          value={data.kpis.avgPosition.toFixed(1)}
          delta={data.kpis.avgPositionDelta}
          invertGood
          deltaFormat="absolute"
        />
        <KpiCard label="Avg. CTR" value={pct(data.kpis.avgCtr)} delta={data.kpis.avgCtrDelta} />
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

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 overflow-x-auto">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Top queries</h3>
        <table className="w-full text-xs min-w-[520px]">
          <thead>
            <tr className="text-left text-gray-400 border-b border-gray-100">
              <th className="py-2 font-medium">Query</th>
              <th className="py-2 font-medium text-right">Clicks</th>
              <th className="py-2 font-medium text-right">Impressions</th>
              <th className="py-2 font-medium text-right">CTR</th>
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
                  <td className="py-2 text-right text-gray-600">{q.clicks.toLocaleString()}</td>
                  <td className="py-2 text-right text-gray-600">{q.impressions.toLocaleString()}</td>
                  <td className="py-2 text-right text-gray-600">{pct(q.ctr)}</td>
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
                      <span className="ml-1 text-[9px] px-1.5 py-0.5 rounded-full border border-emerald-200 text-emerald-600 bg-emerald-50">
                        live
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
          {hasLivePositions
            ? "Position marked “live” is real. Clicks/impressions/CTR are still demo data — see “How these metrics are calculated” below."
            : "All fields below are demo data until you fetch live rankings above — see “How these metrics are calculated” below."}
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 overflow-x-auto">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Top pages</h3>
        <table className="w-full text-xs min-w-[420px]">
          <thead>
            <tr className="text-left text-gray-400 border-b border-gray-100">
              <th className="py-2 font-medium">Page</th>
              <th className="py-2 font-medium text-right">Clicks</th>
              <th className="py-2 font-medium text-right">Impressions</th>
              <th className="py-2 font-medium text-right">CTR</th>
            </tr>
          </thead>
          <tbody>
            {data.topPages.map((p) => (
              <tr key={p.url} className="border-b border-gray-50 last:border-0">
                <td className="py-2 text-gray-800 font-mono">{p.url}</td>
                <td className="py-2 text-right text-gray-600">{p.clicks.toLocaleString()}</td>
                <td className="py-2 text-right text-gray-600">{p.impressions.toLocaleString()}</td>
                <td className="py-2 text-right text-gray-600">{pct(p.ctr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <MetricsMethodology scope="organic" />
    </div>
  );
}
