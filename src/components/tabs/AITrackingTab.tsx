"use client";

import { useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import DataSourceBadge from "@/components/ui/DataSourceBadge";
import MetricsMethodology from "@/components/ui/MetricsMethodology";
import PromptMonitorSection from "@/components/tabs/PromptMonitorSection";
import type { AIVisibilityData, CitationSource, Sentiment, TrackedQuery } from "@/lib/types";

const ALL_PLATFORMS = ["ChatGPT", "Gemini", "Perplexity", "Google AI Overview"] as const;
const ALL_REGIONS = ["Global", "US", "EU", "TW", "JP"] as const;

// Share-of-voice platform selector. Deliberately only the two platforms the
// LLM Mentions / Multi-Target Metrics endpoint actually supports (verified
// 2026-11-06) — that specific endpoint doesn't cover Gemini or Perplexity at
// all. The newer Prompt Monitoring section below uses a different DataForSEO
// endpoint (LLM Responses) that does support all four platforms — see that
// section and the case study for why the two endpoints were evaluated
// separately and why Prompt Monitoring became the primary live feature.
const SOV_PLATFORMS = [
  { key: "all", label: "All supported platforms" },
  { key: "chat_gpt", label: "ChatGPT" },
  { key: "google", label: "Google AI Overview" },
] as const;
type SovPlatformKey = (typeof SOV_PLATFORMS)[number]["key"];
type LiveApiPlatform = "chat_gpt" | "google";

const SECTIONS = [
  { key: "prompts", label: "Prompt Monitoring" },
  { key: "queries", label: "Queries" },
  { key: "visibility", label: "Visibility" },
  { key: "sov", label: "Share of Voice" },
  { key: "sentiment", label: "Sentiment" },
  { key: "citations", label: "Citations" },
] as const;
type SectionKey = (typeof SECTIONS)[number]["key"];

const sentimentColor: Record<Sentiment, string> = {
  positive: "text-emerald-600 bg-emerald-50 border-emerald-200",
  neutral: "text-gray-500 bg-gray-50 border-gray-200",
  negative: "text-red-600 bg-red-50 border-red-200",
};

function defaultQueries(brandName: string): TrackedQuery[] {
  return [
    {
      id: "q1",
      text: "What skincare brands do you recommend?",
      topic: "Category recommendation",
      region: "Global",
      platforms: ["ChatGPT", "Gemini", "Perplexity"],
      tags: ["awareness"],
    },
    {
      id: "q2",
      text: `What are reviews like for ${brandName}?`,
      topic: "Brand reputation",
      region: "US",
      platforms: ["ChatGPT", "Perplexity"],
      tags: ["reputation"],
    },
    {
      id: "q3",
      text: `How does ${brandName} compare to similar products?`,
      topic: "Competitive comparison",
      region: "Global",
      platforms: ["ChatGPT", "Gemini", "Google AI Overview"],
      tags: ["comparison"],
    },
  ];
}

// Deterministic string hash so the same inputs always produce the same
// simulated numbers (no true randomness — avoids values jumping around on
// unrelated re-renders, and avoids SSR/client hydration mismatches).
function hashSeed(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h;
}

function sentimentForQuery(text: string): Sentiment {
  const bucket = hashSeed(text) % 10;
  if (bucket < 6) return "positive";
  if (bucket < 9) return "neutral";
  return "negative";
}

let nextQueryId = 100;

interface LiveAiVisibilityResponse {
  platforms: { platform: string; mentionRate: number }[];
  competitors: {
    brand: string;
    platforms: { platform: string; mentionRate: number }[];
    mentionRate: number;
    isYou: boolean;
  }[];
  citations: { url: string; citedByPlatforms: string[] }[];
  keywordVolumes: { keyword: string; aiSearchVolume: number | null }[];
}

// Demo-mode stand-in for the two platforms the live SOV selector supports.
// Deterministic so switching platforms in demo mode doesn't jump around.
function demoPlatformRate(name: string, platform: LiveApiPlatform, baseRate: number): number {
  const jitter = ((hashSeed(`${name}|${platform}`) % 21) / 100) - 0.1; // ±10%
  return Math.min(0.95, Math.max(0.02, baseRate + jitter));
}

export default function AITrackingTab({
  data,
  brandName,
  useLiveData = false,
  competitors = [],
}: {
  data: AIVisibilityData;
  brandName: string;
  useLiveData?: boolean;
  competitors?: string[];
}) {
  const [section, setSection] = useState<SectionKey>("prompts");
  const [queries, setQueries] = useState<TrackedQuery[]>(() => defaultQueries(brandName));
  const [regionFilter, setRegionFilter] = useState<string>("All");
  const [draftText, setDraftText] = useState("");
  const [version, setVersion] = useState(0);
  const [liveResult, setLiveResult] = useState<LiveAiVisibilityResponse | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [sovPlatform, setSovPlatform] = useState<SovPlatformKey>("all");
  const requestIdRef = useRef(0);
  const hasFetchedLiveRef = useRef(false);

  async function fetchLiveData(platform: SovPlatformKey = sovPlatform) {
    const myRequestId = ++requestIdRef.current;
    hasFetchedLiveRef.current = true;
    setLiveLoading(true);
    setLiveError(null);
    setLiveResult(null); // clear stale results from a previous platform/brand selection immediately
    try {
      const res = await fetch("/api/geo/ai-visibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand: brandName,
          competitors,
          queryTexts: queries.map((q) => q.text),
          ...(platform !== "all" ? { platform } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "DataForSEO request failed");
      // A slower request for a platform the user has since switched away from
      // must not clobber a faster, more recent one.
      if (myRequestId !== requestIdRef.current) return;
      setLiveResult(json);
      setQueries((prev) =>
        prev.map((q) => {
          const match = json.keywordVolumes?.find((v: { keyword: string }) => v.keyword === q.text);
          return match ? { ...q, aiSearchVolume: match.aiSearchVolume } : q;
        }),
      );
    } catch (err) {
      if (myRequestId !== requestIdRef.current) return;
      setLiveError(err instanceof Error ? err.message : "DataForSEO request failed");
    } finally {
      if (myRequestId === requestIdRef.current) setLiveLoading(false);
    }
  }

  function changeSovPlatform(next: SovPlatformKey) {
    setSovPlatform(next);
    // Only live mode needs a fresh request scoped to the new platform; once the
    // user has fetched at least once, keep results in sync with the selector.
    if (useLiveData && hasFetchedLiveRef.current) {
      fetchLiveData(next);
    }
  }

  const visibleQueries = useMemo(
    () => (regionFilter === "All" ? queries : queries.filter((q) => q.region === regionFilter)),
    [queries, regionFilter],
  );

  function updateQuery(id: string, patch: Partial<TrackedQuery>) {
    setQueries((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }

  function togglePlatformOnQuery(id: string, platform: string) {
    setQueries((prev) =>
      prev.map((q) =>
        q.id === id
          ? {
              ...q,
              platforms: q.platforms.includes(platform)
                ? q.platforms.filter((p) => p !== platform)
                : [...q.platforms, platform],
            }
          : q,
      ),
    );
  }

  function removeQuery(id: string) {
    setQueries((prev) => prev.filter((q) => q.id !== id));
  }

  function addQuery() {
    const text = draftText.trim();
    if (!text) return;
    setQueries((prev) => [
      ...prev,
      { id: `q${nextQueryId++}`, text, topic: "New topic", region: "Global", platforms: ["ChatGPT"], tags: [] },
    ]);
    setDraftText("");
  }

  const platformsInScope = useMemo(() => {
    const set = new Set<string>();
    visibleQueries.forEach((q) => q.platforms.forEach((p) => set.add(p)));
    return ALL_PLATFORMS.filter((p) => set.has(p));
  }, [visibleQueries]);

  const simulatedPlatforms = useMemo(() => {
    if (liveResult) {
      return liveResult.platforms.map((p) => ({ ...p, sentiment: "neutral" as Sentiment }));
    }
    if (visibleQueries.length === 0 || platformsInScope.length === 0) return [];
    const seedBase = hashSeed(visibleQueries.map((q) => q.text).join("|"));
    return platformsInScope.map((name, i) => {
      const base = data.platforms.find((p) => p.platform === name);
      const jitter = (((seedBase + version * 17) >> (i * 5)) % 21) / 100 - 0.1; // ±10%
      const queryBoost = Math.min(visibleQueries.length * 0.02, 0.1);
      const rate = Math.min(0.95, Math.max(0.05, (base?.mentionRate ?? 0.3) + jitter + queryBoost));
      return { platform: name, mentionRate: rate, sentiment: base?.sentiment ?? "neutral" };
    });
  }, [liveResult, platformsInScope, visibleQueries, version, data.platforms]);

  const liveDisplayPlatformName = (key: string) => (key === "chat_gpt" ? "ChatGPT" : key === "google" ? "Google AI Overview" : key);

  // Single-platform bar chart (used when sovPlatform is "chat_gpt" or "google").
  const chartData = useMemo(() => {
    if (liveResult) {
      return liveResult.competitors.map((c) => ({
        name: c.brand,
        mentionRate: Math.round(c.mentionRate * 100),
        isYou: c.isYou,
      }));
    }
    const base =
      sovPlatform === "all"
        ? data.competitors
        : data.competitors.map((c) => ({ ...c, mentionRate: demoPlatformRate(c.brand, sovPlatform as LiveApiPlatform, c.mentionRate) }));
    const youRate = simulatedPlatforms.length
      ? simulatedPlatforms.reduce((s, p) => s + p.mentionRate, 0) / simulatedPlatforms.length
      : 0;
    return base.map((c) => ({
      name: c.brand,
      mentionRate: Math.round((c.isYou ? youRate : c.mentionRate) * 100),
      isYou: c.isYou,
    }));
  }, [liveResult, data.competitors, simulatedPlatforms, sovPlatform]);

  // Compact per-platform comparison table (used when sovPlatform is "all").
  const comparisonRows = useMemo(() => {
    const platformKeys: LiveApiPlatform[] = ["chat_gpt", "google"];
    if (liveResult) {
      return liveResult.competitors.map((c) => {
        const byPlatform = platformKeys.map((key) => ({
          key,
          rate: c.platforms.find((p) => p.platform === liveDisplayPlatformName(key))?.mentionRate ?? 0,
        }));
        const combined = byPlatform.reduce((s, p) => s + p.rate, 0) / byPlatform.length;
        return { name: c.brand, isYou: c.isYou, byPlatform, combined };
      });
    }
    return data.competitors.map((c) => {
      const byPlatform = platformKeys.map((key) => ({ key, rate: demoPlatformRate(c.brand, key, c.mentionRate) }));
      const combined = byPlatform.reduce((s, p) => s + p.rate, 0) / byPlatform.length;
      return { name: c.brand, isYou: c.isYou, byPlatform, combined };
    });
  }, [liveResult, data.competitors]);

  const effectiveCitations: CitationSource[] =
    liveResult && liveResult.citations.length > 0
      ? liveResult.citations.map((c) => ({ ...c, note: "" }))
      : data.citations;

  const sentimentBreakdown = useMemo(() => {
    const counts: Record<Sentiment, number> = { positive: 0, neutral: 0, negative: 0 };
    visibleQueries.forEach((q) => {
      counts[sentimentForQuery(q.text + version)] += 1;
    });
    const total = visibleQueries.length || 1;
    return (["positive", "neutral", "negative"] as Sentiment[]).map((s) => ({
      sentiment: s,
      count: counts[s],
      pct: counts[s] / total,
    }));
  }, [visibleQueries, version]);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-sm font-semibold text-gray-900">{brandName} — AI Tracking</h2>
        <DataSourceBadge source={liveResult ? "live" : data.source} />
        <span className="text-xs text-gray-400 sm:ml-auto">{data.period}</span>
      </div>

      <p className="text-xs text-gray-400">
        Modeled on how tools like WorkDuo structure GEO/AEO tracking: set up queries with a topic, region, platforms
        and tags, then read the results across Visibility, Share of Voice, Sentiment and Citations.{" "}
        {liveResult ? "Showing live DataForSEO data where available." : "All numbers below are simulated demo data."}{" "}
        See “How these metrics are calculated” at the bottom of this tab for what&apos;s live vs. simulated, field by field.
      </p>

      {useLiveData && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchLiveData()}
            disabled={liveLoading}
            className="text-xs px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-50"
          >
            {liveLoading ? "Fetching from DataForSEO…" : "Fetch live data"}
          </button>
          {liveError && <span className="text-xs text-red-500">{liveError} — showing demo data instead.</span>}
          {liveResult && !liveError && <span className="text-xs text-emerald-600">Live data loaded.</span>}
        </div>
      )}

      <div className="flex flex-wrap gap-1 border-b border-gray-200">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            className={`text-xs px-3 py-2 border-b-2 transition ${
              section === s.key
                ? "border-indigo-600 text-indigo-600 font-medium"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === "prompts" && (
        <PromptMonitorSection brandName={brandName} competitors={competitors} useLiveData={useLiveData} />
      )}

      {section === "queries" && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">Queries management</h3>
          <p className="text-xs text-gray-400">
            A query is a natural-language question — not a traditional keyword. Set its topic, region, platforms and
            tags, then it feeds the Visibility, Share of Voice and Sentiment sections.
          </p>

          <div className="space-y-3">
            {queries.map((q) => (
              <div key={q.id} className="border border-gray-100 rounded-lg p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <input
                    value={q.text}
                    onChange={(e) => updateQuery(q.id, { text: e.target.value })}
                    className="flex-1 text-xs text-gray-800 border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-indigo-400"
                  />
                  {typeof q.aiSearchVolume === "number" && (
                    <span className="text-[10px] px-2 py-1 rounded-full border border-indigo-100 text-indigo-500 bg-indigo-50 whitespace-nowrap">
                      AI search vol: {q.aiSearchVolume.toLocaleString()}
                    </span>
                  )}
                  <button
                    onClick={() => removeQuery(q.id)}
                    className="text-xs text-gray-400 hover:text-red-500 transition px-1"
                    aria-label="Remove this query"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <input
                    value={q.topic}
                    onChange={(e) => updateQuery(q.id, { topic: e.target.value })}
                    placeholder="Topic"
                    className="text-[11px] text-gray-600 border border-gray-200 rounded-md px-2 py-1 w-36 focus:outline-none focus:border-indigo-400"
                  />
                  <select
                    value={q.region}
                    onChange={(e) => updateQuery(q.id, { region: e.target.value })}
                    className="text-[11px] text-gray-600 border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:border-indigo-400"
                  >
                    {ALL_REGIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <input
                    value={q.tags.join(", ")}
                    onChange={(e) =>
                      updateQuery(q.id, { tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })
                    }
                    placeholder="tags, comma separated"
                    className="text-[11px] text-gray-600 border border-gray-200 rounded-md px-2 py-1 w-44 focus:outline-none focus:border-indigo-400"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_PLATFORMS.map((p) => (
                    <button
                      key={p}
                      onClick={() => togglePlatformOnQuery(q.id, p)}
                      className={`text-[10px] px-2 py-1 rounded-full border transition ${
                        q.platforms.includes(p)
                          ? "border-indigo-300 text-indigo-600 bg-indigo-50"
                          : "border-gray-200 text-gray-400 bg-white"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {queries.length === 0 && <p className="text-xs text-gray-400">No queries yet — add one below.</p>}
          </div>

          <div className="flex gap-2 pt-1">
            <input
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addQuery()}
              placeholder={`e.g. Is ${brandName} good for sensitive skin?`}
              className="flex-1 text-xs border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-indigo-400"
            />
            <button
              onClick={addQuery}
              className="text-xs px-3 py-1.5 rounded-md border border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600 transition"
            >
              Add query
            </button>
          </div>
        </div>
      )}

      {section === "visibility" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Region</label>
            <select
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value)}
              className="text-xs border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:border-indigo-400"
            >
              <option value="All">All regions</option>
              {ALL_REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {!useLiveData && (
              <button
                onClick={() => setVersion((v) => v + 1)}
                className="ml-auto text-xs px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition"
              >
                Regenerate demo results
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {simulatedPlatforms.length === 0 && (
              <p className="text-xs text-gray-400 col-span-full">
                {liveResult
                  ? "No live mention data returned for this brand/platform combination."
                  : "No queries match this region/platform combination — adjust Queries management or the region filter."}
              </p>
            )}
            {simulatedPlatforms.map((p) => (
              <div key={p.platform} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500">{p.platform}</span>
                  {!liveResult && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border ${sentimentColor[p.sentiment]}`}>
                      {p.sentiment}
                    </span>
                  )}
                </div>
                <div className="text-2xl font-semibold text-gray-900">{(p.mentionRate * 100).toFixed(0)}%</div>
                <div className="text-xs text-gray-400 mt-1">
                  {liveResult
                    ? "Live DataForSEO mention share for this platform"
                    : `Mention rate (simulated share of ${visibleQueries.length} tracked ${visibleQueries.length === 1 ? "query" : "queries"})`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {section === "sov" && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <h3 className="text-sm font-semibold text-gray-900">
              Share of voice vs. competitors — {SOV_PLATFORMS.find((p) => p.key === sovPlatform)?.label}
            </h3>
            <label className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Platform</span>
              <select
                value={sovPlatform}
                onChange={(e) => changeSovPlatform(e.target.value as SovPlatformKey)}
                disabled={liveLoading}
                className="text-xs border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:border-indigo-400 disabled:opacity-50"
              >
                {SOV_PLATFORMS.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {liveLoading && <p className="text-xs text-gray-400 mb-3">Fetching {SOV_PLATFORMS.find((p) => p.key === sovPlatform)?.label.toLowerCase()} data…</p>}

          {sovPlatform === "all" ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[420px]">
                <thead>
                  <tr className="text-left text-gray-400 border-b border-gray-100">
                    <th className="py-2 font-medium">Brand</th>
                    <th className="py-2 font-medium text-right">ChatGPT</th>
                    <th className="py-2 font-medium text-right">Google AI Overview</th>
                    <th className="py-2 font-medium text-right">Combined</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonRows.map((row) => (
                    <tr key={row.name} className={`border-b border-gray-50 last:border-0 ${row.isYou ? "bg-indigo-50/60" : ""}`}>
                      <td className="py-2 text-gray-800">{row.name}</td>
                      {row.byPlatform.map((p) => (
                        <td key={p.key} className="py-2 text-right text-gray-600">{(p.rate * 100).toFixed(0)}%</td>
                      ))}
                      <td className="py-2 text-right font-medium text-gray-900">{(row.combined * 100).toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11px] text-gray-400 mt-2">
                Combined is a simple average of the ChatGPT and Google AI Overview shares, weighted equally. A brand
                with no live mentions on a platform shows 0% for that platform — that&apos;s measured absence, not missing
                data.
              </p>
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" tick={{ fontSize: 11 }} unit="%" />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Bar dataKey="mentionRate" radius={[0, 4, 4, 0]}>
                    {chartData.map((entry) => (
                      <Cell key={entry.name} fill={entry.isYou ? "#6366f1" : "#c7d2fe"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="text-[11px] text-gray-400 mt-2">
            {liveResult
              ? `Live DataForSEO mention share (LLM Mentions API) across the tracked targets.${
                  sovPlatform !== "all" ? " Changing the platform here also rescopes the Visibility cards above — both read from the same live fetch." : ""
                }`
              : "Demo data. Toggle “Use live DataForSEO data” above and click “Fetch live data” for a real comparison."}
          </p>
        </div>
      )}

      {section === "sentiment" && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-900">Sentiment breakdown</h3>
          <p className="text-xs text-gray-400">
            Simulated sentiment of how {brandName} is described across {visibleQueries.length} tracked{" "}
            {visibleQueries.length === 1 ? "query" : "queries"}.
          </p>
          <div className="space-y-2">
            {sentimentBreakdown.map((s) => (
              <div key={s.sentiment} className="flex items-center gap-3">
                <span className={`text-[11px] w-16 px-2 py-0.5 rounded-full border text-center ${sentimentColor[s.sentiment]}`}>
                  {s.sentiment}
                </span>
                <div className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={`h-full ${
                      s.sentiment === "positive"
                        ? "bg-emerald-500"
                        : s.sentiment === "neutral"
                          ? "bg-gray-400"
                          : "bg-red-500"
                    }`}
                    style={{ width: `${s.pct * 100}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500 w-16 text-right">
                  {(s.pct * 100).toFixed(0)}% ({s.count})
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {section === "citations" && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 overflow-x-auto">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Citation sources</h3>
          <table className="w-full text-xs min-w-[480px]">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-100">
                <th className="py-2 font-medium">Source</th>
                <th className="py-2 font-medium">Cited by</th>
                <th className="py-2 font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {effectiveCitations.map((c) => (
                <tr key={c.url} className="border-b border-gray-50 last:border-0 align-top">
                  <td className="py-2 text-gray-800 font-mono">{c.url}</td>
                  <td className="py-2 text-gray-600">{c.citedByPlatforms.join(", ")}</td>
                  <td className="py-2 text-gray-500">{c.note || "—"}</td>
                </tr>
              ))}
              {effectiveCitations.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-3 text-gray-400">
                    No citation sources found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {liveResult && (
            <p className="text-[11px] text-gray-400 mt-2">Live DataForSEO citation domains (LLM Mentions API).</p>
          )}
        </div>
      )}

      <MetricsMethodology scope="ai" />
    </div>
  );
}
