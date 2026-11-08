"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import MetricsMethodology from "@/components/ui/MetricsMethodology";
import type { BenchmarkMonthPoint, BenchmarkResult } from "@/lib/types";

type PlatformFilter = "chat_gpt" | "google" | "all";
const PLATFORM_LABEL: Record<PlatformFilter, string> = {
  chat_gpt: "ChatGPT",
  google: "Google AI Overview",
  all: "All supported platforms",
};
const EARLIEST_DATE = "2025-08-01";

interface LocationOption {
  locationCode: number;
  locationName: string;
  languages: { languageCode: string; languageName: string; platforms: ("chat_gpt" | "google")[] }[];
}

const FALLBACK_LOCATIONS: LocationOption[] = [
  { locationCode: 2840, locationName: "United States", languages: [{ languageCode: "en", languageName: "English", platforms: ["chat_gpt", "google"] }] },
  { locationCode: 2158, locationName: "Taiwan", languages: [{ languageCode: "zh-TW", languageName: "Chinese (Traditional)", platforms: ["google"] }] },
];

function hashSeed(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return h;
}

function demoBenchmark(brand: string, competitors: string[], platform: PlatformFilter, market: string, language: string): BenchmarkResult {
  const names = [brand, ...competitors].filter(Boolean);
  const base: Record<string, number> = {};
  names.forEach((n, i) => {
    const seed = hashSeed(n + platform + market);
    base[n] = i === 0 ? 0.15 + (seed % 20) / 100 : 0.3 + (seed % 50) / 100;
  });
  const total = Object.values(base).reduce((s, v) => s + v, 0);
  return {
    platform,
    market,
    language,
    brands: names.map((n) => ({ brand: n, isYou: n === brand, mentions: Math.round(base[n] * 500), mentionShare: base[n] / total })),
    citationDomains: [
      { title: "reddit.com", url: "https://reddit.com" },
      { title: "byrdie.com", url: "https://byrdie.com" },
    ],
  };
}

function monthLabel(y: number, m: number) {
  return new Date(y, m - 1, 1).toLocaleString("en-US", { year: "numeric", month: "short" });
}

export default function BrandVisibilityBenchmark({
  brandName,
  competitors: initialCompetitors,
  useLiveData,
}: {
  brandName: string;
  competitors: string[];
  useLiveData: boolean;
}) {
  const [brand, setBrand] = useState(brandName);
  const [competitorsInput, setCompetitorsInput] = useState(initialCompetitors.join(", "));
  const competitors = competitorsInput.split(",").map((c) => c.trim()).filter(Boolean);
  const [platform, setPlatform] = useState<PlatformFilter>("all");

  // Market/language — free reference data, so this loads regardless of the
  // live/demo toggle. Defaults to United States/English, the only pairing
  // with both platforms; everything else (including real, verified Taiwan /
  // Traditional Chinese coverage) is Google-only.
  const [locations, setLocations] = useState<LocationOption[]>(FALLBACK_LOCATIONS);
  const [locationsError, setLocationsError] = useState<string | null>(null);
  const [locationCode, setLocationCode] = useState(2840);
  const [languageCode, setLanguageCode] = useState("en");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/geo/benchmark-locations")
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.error) {
          setLocationsError(json.error);
          return;
        }
        const sorted = [...json.locations].sort((a, b) =>
          a.locationName === "United States" ? -1 : b.locationName === "United States" ? 1 : a.locationName.localeCompare(b.locationName),
        );
        setLocations(sorted);
      })
      .catch((err) => {
        if (!cancelled) setLocationsError(err instanceof Error ? err.message : "Could not load the market/language list");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedLocation = locations.find((l) => l.locationCode === locationCode) ?? locations[0];
  const selectedLanguage = selectedLocation?.languages.find((l) => l.languageCode === languageCode) ?? selectedLocation?.languages[0];
  const availablePlatforms = useMemo<PlatformFilter[]>(() => {
    const base = selectedLanguage?.platforms ?? ["google"];
    return base.length === 2 ? ["all", "chat_gpt", "google"] : (base as PlatformFilter[]);
  }, [selectedLanguage]);
  // Never actually fetch/display a platform the current market/language
  // doesn't support — clamped at the point of use rather than "corrected" via
  // an effect, so there's no stale render where `platform` briefly disagrees
  // with what's selectable.
  const effectivePlatform: PlatformFilter = availablePlatforms.includes(platform) ? platform : availablePlatforms[0];

  function selectLocation(code: number) {
    setLocationCode(code);
    const loc = locations.find((l) => l.locationCode === code);
    const firstLanguage = loc?.languages[0];
    setLanguageCode(firstLanguage?.languageCode ?? "en");
    const platforms = firstLanguage?.platforms ?? ["google"];
    setPlatform(platforms.length === 2 ? "all" : platforms[0]);
  }

  function selectLanguage(code: string) {
    setLanguageCode(code);
    const lang = selectedLocation?.languages.find((l) => l.languageCode === code);
    const platforms = lang?.platforms ?? ["google"];
    setPlatform(platforms.length === 2 ? "all" : platforms[0]);
  }

  const [result, setResult] = useState<BenchmarkResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const today = new Date().toISOString().slice(0, 10);
  const defaultFrom = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    const iso = d.toISOString().slice(0, 10);
    return iso < EARLIEST_DATE ? EARLIEST_DATE : iso;
  })();
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo, setDateTo] = useState(today);
  const [periodAFrom, setPeriodAFrom] = useState(EARLIEST_DATE);
  const [periodATo, setPeriodATo] = useState(defaultFrom);
  const [periodBFrom, setPeriodBFrom] = useState(defaultFrom);
  const [periodBTo, setPeriodBTo] = useState(today);

  const [trend, setTrend] = useState<BenchmarkMonthPoint[] | null>(null);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendError, setTrendError] = useState<string | null>(null);
  const trendRequestIdRef = useRef(0);

  const [periods, setPeriods] = useState<{ a: BenchmarkMonthPoint[]; b: BenchmarkMonthPoint[] } | null>(null);
  const [periodsLoading, setPeriodsLoading] = useState(false);
  const [periodsError, setPeriodsError] = useState<string | null>(null);

  async function fetchBenchmark() {
    const myId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    setResult(null);
    const marketName = selectedLocation?.locationName ?? "United States";
    const languageName = selectedLanguage?.languageName ?? "English";
    if (!useLiveData) {
      await new Promise((r) => setTimeout(r, 400));
      if (myId !== requestIdRef.current) return;
      setResult(demoBenchmark(brand, competitors, effectivePlatform, marketName, languageName));
      setLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/geo/benchmark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand,
          competitors,
          platform: effectivePlatform === "all" ? undefined : effectivePlatform,
          locationCode,
          languageCode,
          locationName: marketName,
          languageName,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "DataForSEO request failed");
      if (myId !== requestIdRef.current) return;
      setResult(json);
    } catch (err) {
      if (myId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : "DataForSEO request failed");
    } finally {
      if (myId === requestIdRef.current) setLoading(false);
    }
  }

  async function fetchTrend() {
    const myId = ++trendRequestIdRef.current;
    setTrendLoading(true);
    setTrendError(null);
    setTrend(null);
    if (!useLiveData) {
      await new Promise((r) => setTimeout(r, 400));
      if (myId !== trendRequestIdRef.current) return;
      const names = [brand, ...competitors].filter(Boolean);
      const months: BenchmarkMonthPoint[] = [];
      const start = new Date(dateFrom);
      const end = new Date(dateTo);
      for (let d = new Date(start); d <= end; d.setMonth(d.getMonth() + 1)) {
        months.push({
          year: d.getFullYear(),
          month: d.getMonth() + 1,
          brands: names.map((n) => ({ brand: n, mentions: Math.round(100 + (hashSeed(n + d.getMonth()) % 300)) })),
        });
      }
      setTrend(months);
      setTrendLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/geo/benchmark-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand, competitors, dateFrom, dateTo, platform: effectivePlatform === "all" ? undefined : effectivePlatform, locationCode, languageCode }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "DataForSEO request failed");
      if (myId !== trendRequestIdRef.current) return;
      setTrend(json.timeline);
    } catch (err) {
      if (myId !== trendRequestIdRef.current) return;
      setTrendError(err instanceof Error ? err.message : "DataForSEO request failed");
    } finally {
      if (myId === trendRequestIdRef.current) setTrendLoading(false);
    }
  }

  async function fetchPeriodsCompare() {
    setPeriodsLoading(true);
    setPeriodsError(null);
    setPeriods(null);
    if (!useLiveData) {
      await new Promise((r) => setTimeout(r, 400));
      const names = [brand, ...competitors].filter(Boolean);
      const mk = (seedExtra: string) => [
        { year: 2026, month: 1, brands: names.map((n) => ({ brand: n, mentions: Math.round(100 + (hashSeed(n + seedExtra) % 300)) })) },
      ];
      setPeriods({ a: mk("A"), b: mk("B") });
      setPeriodsLoading(false);
      return;
    }
    try {
      const [resA, resB] = await Promise.all([
        fetch("/api/geo/benchmark-history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brand, competitors, dateFrom: periodAFrom, dateTo: periodATo, platform: effectivePlatform === "all" ? undefined : effectivePlatform, locationCode, languageCode }),
        }).then((r) => r.json()),
        fetch("/api/geo/benchmark-history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brand, competitors, dateFrom: periodBFrom, dateTo: periodBTo, platform: effectivePlatform === "all" ? undefined : effectivePlatform, locationCode, languageCode }),
        }).then((r) => r.json()),
      ]);
      if (resA.error) throw new Error(resA.error);
      if (resB.error) throw new Error(resB.error);
      setPeriods({ a: resA.timeline, b: resB.timeline });
    } catch (err) {
      setPeriodsError(err instanceof Error ? err.message : "DataForSEO request failed");
    } finally {
      setPeriodsLoading(false);
    }
  }

  function periodTotals(points: BenchmarkMonthPoint[]) {
    const names = [brand, ...competitors].filter(Boolean);
    const totals: Record<string, number> = {};
    names.forEach((n) => (totals[n] = 0));
    for (const month of points) {
      for (const b of month.brands) {
        if (totals[b.brand] !== undefined && b.mentions !== null) totals[b.brand] += b.mentions;
      }
    }
    const sum = Object.values(totals).reduce((s, v) => s + v, 0);
    return names.map((n) => ({ brand: n, mentions: totals[n], share: sum > 0 ? totals[n] / sum : 0 }));
  }

  const trendChartData = trend?.map((m) => {
    const sum = m.brands.reduce((s, b) => s + (b.mentions ?? 0), 0);
    const focal = m.brands.find((b) => b.brand === brand);
    return {
      date: monthLabel(m.year, m.month),
      share: sum > 0 && focal?.mentions != null ? Math.round(((focal.mentions ?? 0) / sum) * 100) : null,
    };
  });

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Brand Visibility Benchmark</h3>
          <p className="text-xs text-gray-400 mt-1">
            Provider-dataset mentions — how often names already appear across DataForSEO&apos;s collected AI-search
            data, independent of any specific question. Different from Prompt Monitoring, which tests questions you
            write yourself.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Focal brand</label>
            <input value={brand} onChange={(e) => setBrand(e.target.value)} className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-indigo-400" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Competitors (comma separated)</label>
            <input value={competitorsInput} onChange={(e) => setCompetitorsInput(e.target.value)} className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-indigo-400" />
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Market</label>
            <select
              value={locationCode}
              onChange={(e) => selectLocation(Number(e.target.value))}
              className="text-xs border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-indigo-400 min-w-[140px]"
            >
              {locations.map((l) => (
                <option key={l.locationCode} value={l.locationCode}>{l.locationName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Language</label>
            <select
              value={languageCode}
              onChange={(e) => selectLanguage(e.target.value)}
              className="text-xs border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-indigo-400 min-w-[140px]"
            >
              {(selectedLocation?.languages ?? []).map((l) => (
                <option key={l.languageCode} value={l.languageCode}>{l.languageName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Platform</label>
            <select value={effectivePlatform} onChange={(e) => setPlatform(e.target.value as PlatformFilter)} className="text-xs border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-indigo-400">
              {availablePlatforms.map((p) => (
                <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>
              ))}
            </select>
          </div>
        </div>
        {selectedLanguage && selectedLanguage.platforms.length === 1 && (
          <p className="text-[11px] text-amber-600">
            ChatGPT has no coverage for {selectedLocation?.locationName} / {selectedLanguage.languageName} on this
            endpoint — only Google AI Overview is available here. United States / English is the only pairing with
            both.
          </p>
        )}
        {locationsError && (
          <p className="text-[11px] text-red-500">
            Could not load the live market/language list ({locationsError}) — showing a fallback with only United
            States and Taiwan.
          </p>
        )}

        <button onClick={fetchBenchmark} disabled={loading} className="text-xs px-4 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-50">
          {loading ? "Fetching…" : useLiveData ? "Fetch benchmark (live)" : "Fetch benchmark (interactive demo)"}
        </button>
        {error && <span className="ml-2 text-xs text-red-500">{error}</span>}
      </div>

      {result && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-4">
          {!useLiveData && (
            <span className="text-[10px] px-2 py-0.5 rounded-full border border-amber-200 text-amber-700 bg-amber-50 font-medium">
              Interactive demo — sample data, not a real DataForSEO response
            </span>
          )}
          <div className="flex items-center justify-between flex-wrap gap-1">
            <h4 className="text-xs font-semibold text-gray-800">Mentions &amp; share of voice</h4>
            <span className="text-[11px] text-gray-400">
              {PLATFORM_LABEL[result.platform as PlatformFilter]} · {result.market} · {result.language}
            </span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-100">
                <th className="py-1.5 font-medium">Brand</th>
                <th className="py-1.5 font-medium text-right">Mentions</th>
                <th className="py-1.5 font-medium text-right">Share of voice</th>
              </tr>
            </thead>
            <tbody>
              {result.brands.map((b) => (
                <tr key={b.brand} className={`border-b border-gray-50 last:border-0 ${b.isYou ? "bg-indigo-50/60" : ""}`}>
                  <td className="py-1.5 text-gray-700">{b.brand}</td>
                  <td className="py-1.5 text-right text-gray-600">{b.mentions === null ? "Unavailable" : b.mentions.toLocaleString("en-US")}</td>
                  <td className="py-1.5 text-right text-gray-900 font-medium">
                    {b.mentionShare === null ? "—" : `${Math.round(b.mentionShare * 100)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-gray-400">
            Share of voice = this brand&apos;s mentions ÷ combined mentions of every name in the brand set above, on
            the selected platform. &ldquo;Unavailable&rdquo; means the provider returned no entry for that name
            (coverage gap), distinct from a measured 0.
          </p>

          {result.citationDomains.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-700 mb-1">Common citation domains in the dataset</h4>
              <ul className="text-xs text-gray-600 list-disc list-inside">
                {result.citationDomains.map((c) => (
                  <li key={c.url}>{c.title}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-4">
        <div>
          <h4 className="text-xs font-semibold text-gray-800">Historical trend</h4>
          <p className="text-[11px] text-gray-400 mt-1">
            DataForSEO LLM Mentions Historical API — data starts {EARLIEST_DATE}. Separate dataset from Prompt
            Monitoring&apos;s run history below (that&apos;s your own saved question runs; this is the provider&apos;s
            monthly aggregate).
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="text-[11px] text-gray-500 block mb-1">From</label>
            <input type="date" min={EARLIEST_DATE} max={dateTo} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="text-xs border border-gray-200 rounded-md px-2 py-1.5" />
          </div>
          <div>
            <label className="text-[11px] text-gray-500 block mb-1">To</label>
            <input type="date" min={dateFrom} max={today} value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="text-xs border border-gray-200 rounded-md px-2 py-1.5" />
          </div>
          <button onClick={fetchTrend} disabled={trendLoading} className="text-xs px-3 py-1.5 rounded-md border border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600 transition disabled:opacity-50">
            {trendLoading ? "Loading…" : "Show trend"}
          </button>
          {trendError && <span className="text-xs text-red-500">{trendError}</span>}
        </div>

        {trendChartData && trendChartData.length > 0 && (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendChartData} margin={{ left: 0, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} unit="%" domain={[0, 100]} />
                <Tooltip formatter={(v) => (v === null ? ["Unavailable", "Share of voice"] : [`${v}%`, "Share of voice"])} />
                <Line type="monotone" dataKey="share" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        {trendChartData && trendChartData.every((p) => p.share === null) && (
          <p className="text-xs text-gray-400">No months in this range have the brand counts needed for a comparable share of voice.</p>
        )}

        <div className="border-t border-gray-100 pt-4 space-y-3">
          <h4 className="text-xs font-semibold text-gray-800">Compare periods</h4>
          <p className="text-[11px] text-gray-400">Brand set and filters stay fixed — only the date range changes between the two periods.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="border border-gray-100 rounded-md p-2.5">
              <p className="text-[11px] font-medium text-gray-600 mb-1.5">Period A</p>
              <div className="flex gap-2">
                <input type="date" min={EARLIEST_DATE} value={periodAFrom} onChange={(e) => setPeriodAFrom(e.target.value)} className="text-xs border border-gray-200 rounded-md px-2 py-1 flex-1" />
                <input type="date" value={periodATo} onChange={(e) => setPeriodATo(e.target.value)} className="text-xs border border-gray-200 rounded-md px-2 py-1 flex-1" />
              </div>
            </div>
            <div className="border border-gray-100 rounded-md p-2.5">
              <p className="text-[11px] font-medium text-gray-600 mb-1.5">Period B</p>
              <div className="flex gap-2">
                <input type="date" min={EARLIEST_DATE} value={periodBFrom} onChange={(e) => setPeriodBFrom(e.target.value)} className="text-xs border border-gray-200 rounded-md px-2 py-1 flex-1" />
                <input type="date" value={periodBTo} onChange={(e) => setPeriodBTo(e.target.value)} className="text-xs border border-gray-200 rounded-md px-2 py-1 flex-1" />
              </div>
            </div>
          </div>
          <button onClick={fetchPeriodsCompare} disabled={periodsLoading} className="text-xs px-3 py-1.5 rounded-md border border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600 transition disabled:opacity-50">
            {periodsLoading ? "Comparing…" : "Compare periods"}
          </button>
          {periodsError && <span className="ml-2 text-xs text-red-500">{periodsError}</span>}

          {periods && (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-100">
                  <th className="py-1.5 font-medium">Brand</th>
                  <th className="py-1.5 font-medium text-right">Period A share</th>
                  <th className="py-1.5 font-medium text-right">Period B share</th>
                </tr>
              </thead>
              <tbody>
                {periodTotals(periods.a).map((rowA) => {
                  const rowB = periodTotals(periods.b).find((r) => r.brand === rowA.brand);
                  return (
                    <tr key={rowA.brand} className="border-b border-gray-50 last:border-0">
                      <td className="py-1.5 text-gray-700">{rowA.brand}</td>
                      <td className="py-1.5 text-right text-gray-600">{Math.round(rowA.share * 100)}%</td>
                      <td className="py-1.5 text-right text-gray-600">{rowB ? Math.round(rowB.share * 100) : 0}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <MetricsMethodology scope="benchmark" />
    </div>
  );
}
