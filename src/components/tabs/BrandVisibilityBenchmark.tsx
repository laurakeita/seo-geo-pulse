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

// Month-range math for the Historical trend / Compare controls. The
// Historical API only returns monthly aggregates, so every date control here
// picks whole months rather than arbitrary days.
interface MonthVal {
  year: number;
  month: number; // 1-12
}
const EARLIEST_MONTH: MonthVal = { year: 2025, month: 8 }; // matches the API route's EARLIEST_DATE
function monthIndex(m: MonthVal): number {
  return m.year * 12 + m.month;
}
function addMonths(m: MonthVal, delta: number): MonthVal {
  const idx = m.year * 12 + (m.month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}
function clampMonth(m: MonthVal, min: MonthVal, max: MonthVal): MonthVal {
  if (monthIndex(m) < monthIndex(min)) return min;
  if (monthIndex(m) > monthIndex(max)) return max;
  return m;
}
function monthRangeLength(from: MonthVal, to: MonthVal): number {
  return monthIndex(to) - monthIndex(from) + 1;
}
function monthKey(m: MonthVal): string {
  return `${m.year}-${String(m.month).padStart(2, "0")}`;
}
function parseMonthKey(s: string): MonthVal {
  const [y, mo] = s.split("-").map(Number);
  return { year: y, month: mo };
}
function monthToDateFrom(m: MonthVal): string {
  return `${monthKey(m)}-01`;
}
function monthToDateTo(m: MonthVal): string {
  const lastDay = new Date(m.year, m.month, 0).getDate();
  return `${monthKey(m)}-${String(lastDay).padStart(2, "0")}`;
}
// The immediately preceding, non-overlapping range of the same length.
function previousPeriod(from: MonthVal, to: MonthVal): { from: MonthVal; to: MonthVal } {
  const len = monthRangeLength(from, to);
  const newTo = addMonths(from, -1);
  const newFrom = addMonths(newTo, -(len - 1));
  return { from: newFrom, to: newTo };
}
function lastCompleteMonth(): MonthVal {
  const d = new Date();
  const idx = d.getFullYear() * 12 + d.getMonth() - 1; // the calendar month before the current (in-progress) one
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}
const MAX_MONTH = lastCompleteMonth();
function monthOptionsBetween(min: MonthVal, max: MonthVal): MonthVal[] {
  const opts: MonthVal[] = [];
  for (let cur = min; monthIndex(cur) <= monthIndex(max); cur = addMonths(cur, 1)) opts.push(cur);
  return opts;
}

function MonthSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: MonthVal;
  onChange: (m: MonthVal) => void;
}) {
  const options = useMemo(() => monthOptionsBetween(EARLIEST_MONTH, MAX_MONTH), []);
  return (
    <div>
      <label className="text-[11px] text-gray-600 block mb-1">{label}</label>
      <select
        value={monthKey(value)}
        onChange={(e) => onChange(parseMonthKey(e.target.value))}
        className="text-xs border border-gray-200 rounded-md px-2 py-1.5 text-gray-800 focus:outline-none focus:border-indigo-400"
      >
        {options.map((m) => (
          <option key={monthKey(m)} value={monthKey(m)}>
            {monthLabel(m.year, m.month)}
          </option>
        ))}
      </select>
    </div>
  );
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

  // "Date range" = Period A, always fetched. Defaults to the latest three
  // complete months available (clamped to not precede EARLIEST_MONTH).
  const DEFAULT_TO_MONTH = MAX_MONTH;
  const DEFAULT_FROM_MONTH = clampMonth(addMonths(MAX_MONTH, -2), EARLIEST_MONTH, MAX_MONTH);
  const [fromMonth, setFromMonth] = useState<MonthVal>(DEFAULT_FROM_MONTH);
  const [toMonth, setToMonth] = useState<MonthVal>(DEFAULT_TO_MONTH);
  const [compareMode, setCompareMode] = useState<"off" | "previous" | "custom">("off");
  const defaultCompare = previousPeriod(DEFAULT_FROM_MONTH, DEFAULT_TO_MONTH);
  const [compareFromMonth, setCompareFromMonth] = useState<MonthVal>(defaultCompare.from);
  const [compareToMonth, setCompareToMonth] = useState<MonthVal>(defaultCompare.to);

  function handleFromChange(m: MonthVal) {
    setFromMonth(m);
    if (monthIndex(m) > monthIndex(toMonth)) setToMonth(m);
  }
  function handleToChange(m: MonthVal) {
    setToMonth(m);
    if (monthIndex(m) < monthIndex(fromMonth)) setFromMonth(m);
  }
  function handleCompareFromChange(m: MonthVal) {
    setCompareFromMonth(m);
    if (monthIndex(m) > monthIndex(compareToMonth)) setCompareToMonth(m);
  }
  function handleCompareToChange(m: MonthVal) {
    setCompareToMonth(m);
    if (monthIndex(m) < monthIndex(compareFromMonth)) setCompareFromMonth(m);
  }

  // Period B — only meaningful when compareMode !== "off". For "previous" it
  // is derived from Period A on every render rather than stored, so it can
  // never drift out of sync with the Date range controls.
  const activeCompareRange = compareMode === "previous" ? previousPeriod(fromMonth, toMonth) : { from: compareFromMonth, to: compareToMonth };

  const [trend, setTrend] = useState<BenchmarkMonthPoint[] | null>(null); // Period A timeline
  const [comparePeriod, setComparePeriod] = useState<BenchmarkMonthPoint[] | null>(null); // Period B timeline
  const [applying, setApplying] = useState(false);
  const [dateControlsError, setDateControlsError] = useState<string | null>(null);
  const applyRequestIdRef = useRef(0);

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

  async function fetchTimelineFor(from: MonthVal, to: MonthVal): Promise<BenchmarkMonthPoint[]> {
    const dFrom = monthToDateFrom(from);
    const dTo = monthToDateTo(to);
    if (!useLiveData) {
      await new Promise((r) => setTimeout(r, 300));
      const names = [brand, ...competitors].filter(Boolean);
      const months: BenchmarkMonthPoint[] = [];
      for (let m = from; monthIndex(m) <= monthIndex(to); m = addMonths(m, 1)) {
        months.push({
          year: m.year,
          month: m.month,
          brands: names.map((n) => ({ brand: n, mentions: Math.round(100 + (hashSeed(n + m.month) % 300)) })),
        });
      }
      return months;
    }
    const res = await fetch("/api/geo/benchmark-history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brand,
        competitors,
        dateFrom: dFrom,
        dateTo: dTo,
        platform: effectivePlatform === "all" ? undefined : effectivePlatform,
        locationCode,
        languageCode,
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "DataForSEO request failed");
    return json.timeline;
  }

  // One Apply action updates the trend and, when Compare with isn't "Off",
  // the period comparison — brand set, platform, market and language stay
  // identical for both periods since they all read from the same state above.
  async function applyDateControls() {
    const myId = ++applyRequestIdRef.current;
    setApplying(true);
    setDateControlsError(null);
    try {
      const timelineA = await fetchTimelineFor(fromMonth, toMonth);
      if (myId !== applyRequestIdRef.current) return;
      setTrend(timelineA);
      if (compareMode === "off") {
        setComparePeriod(null);
      } else {
        const range = compareMode === "previous" ? previousPeriod(fromMonth, toMonth) : { from: compareFromMonth, to: compareToMonth };
        const timelineB = await fetchTimelineFor(range.from, range.to);
        if (myId !== applyRequestIdRef.current) return;
        setComparePeriod(timelineB);
      }
    } catch (err) {
      if (myId !== applyRequestIdRef.current) return;
      setDateControlsError(err instanceof Error ? err.message : "DataForSEO request failed");
    } finally {
      if (myId === applyRequestIdRef.current) setApplying(false);
    }
  }

  // Keeps "unavailable" (no API entry for a name / zero denominator) distinct
  // from a measured 0, for both the per-brand totals and the resulting share.
  function periodTotals(points: BenchmarkMonthPoint[]) {
    const names = [brand, ...competitors].filter(Boolean);
    const totals: Record<string, number> = {};
    const hasData: Record<string, boolean> = {};
    names.forEach((n) => {
      totals[n] = 0;
      hasData[n] = false;
    });
    for (const month of points) {
      for (const b of month.brands) {
        if (totals[b.brand] === undefined) continue;
        if (b.mentions !== null) {
          totals[b.brand] += b.mentions;
          hasData[b.brand] = true;
        }
      }
    }
    const sum = names.reduce((s, n) => s + (hasData[n] ? totals[n] : 0), 0);
    return names.map((n) => ({
      brand: n,
      mentions: hasData[n] ? totals[n] : null,
      share: !hasData[n] || sum === 0 ? null : totals[n] / sum,
    }));
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
        <p className="text-[11px] text-gray-500">
          Viewing: {PLATFORM_LABEL[effectivePlatform]} · {selectedLocation?.locationName} · {selectedLanguage?.languageName}
        </p>
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
          <table className="w-full text-xs [&_th]:px-2 [&_td]:px-2 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0 [&_th:last-child]:pr-0 [&_td:last-child]:pr-0">
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
                    {b.mentionShare === null ? "Unavailable" : `${Math.round(b.mentionShare * 100)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-gray-500">
            Share of voice = this brand&apos;s mentions ÷ combined mentions of every name in the brand set above, on
            the selected platform. &ldquo;Unavailable&rdquo; means either the provider returned no entry for that
            name (coverage gap) or the combined mentions across the whole set was zero (no usable denominator) —
            both distinct from a measured 0, which means the name was checked and found to have no mentions.
          </p>

          {result.citationDomains.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-700 mb-1">Top citation domains returned for this benchmark</h4>
              <p className="text-[11px] text-gray-400 mb-1.5">
                Aggregated across every brand in the comparison set above combined, not specific to any single name.
              </p>
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
          <p className="text-[11px] text-gray-500 mt-1">Monthly visibility data from DataForSEO.</p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-end gap-2">
            <MonthSelect label="From" value={fromMonth} onChange={handleFromChange} />
            <MonthSelect label="To" value={toMonth} onChange={handleToChange} />
          </div>
          <div>
            <label className="text-[11px] text-gray-600 block mb-1">Compare with</label>
            <select
              value={compareMode}
              onChange={(e) => setCompareMode(e.target.value as "off" | "previous" | "custom")}
              className="text-xs border border-gray-200 rounded-md px-2 py-1.5 text-gray-800 focus:outline-none focus:border-indigo-400"
            >
              <option value="off">Off</option>
              <option value="previous">Previous period</option>
              <option value="custom">Custom range</option>
            </select>
          </div>
          {compareMode === "custom" && (
            <div className="flex items-end gap-2">
              <MonthSelect label="Compare from" value={compareFromMonth} onChange={handleCompareFromChange} />
              <MonthSelect label="Compare to" value={compareToMonth} onChange={handleCompareToChange} />
            </div>
          )}
          <button
            onClick={applyDateControls}
            disabled={applying}
            className="text-xs px-4 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-50"
          >
            {applying ? "Applying…" : "Apply"}
          </button>
        </div>
        {dateControlsError && <p className="text-xs text-red-500">{dateControlsError}</p>}
        {compareMode === "custom" && monthRangeLength(fromMonth, toMonth) !== monthRangeLength(compareFromMonth, compareToMonth) && (
          <p className="text-[11px] text-amber-600">
            Date range covers {monthRangeLength(fromMonth, toMonth)} month{monthRangeLength(fromMonth, toMonth) === 1 ? "" : "s"};
            the compare range covers {monthRangeLength(compareFromMonth, compareToMonth)} month
            {monthRangeLength(compareFromMonth, compareToMonth) === 1 ? "" : "s"} — raw totals cover different
            durations, so compare shares, not totals.
          </p>
        )}

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

        {comparePeriod && (
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <h4 className="text-xs font-semibold text-gray-800">Period comparison</h4>
            <p className="text-[11px] text-gray-500">
              {monthLabel(fromMonth.year, fromMonth.month)}–{monthLabel(toMonth.year, toMonth.month)} vs.{" "}
              {monthLabel(activeCompareRange.from.year, activeCompareRange.from.month)}–
              {monthLabel(activeCompareRange.to.year, activeCompareRange.to.month)}. Brand set, platform, market and
              language are the same for both periods.
            </p>
            <table className="w-full text-xs [&_th]:px-2 [&_td]:px-2 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0 [&_th:last-child]:pr-0 [&_td:last-child]:pr-0">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-100">
                  <th className="py-1.5 font-medium">Brand</th>
                  <th className="py-1.5 font-medium text-right">
                    {monthLabel(fromMonth.year, fromMonth.month)}–{monthLabel(toMonth.year, toMonth.month)}
                  </th>
                  <th className="py-1.5 font-medium text-right">
                    {monthLabel(activeCompareRange.from.year, activeCompareRange.from.month)}–
                    {monthLabel(activeCompareRange.to.year, activeCompareRange.to.month)}
                  </th>
                </tr>
              </thead>
              <tbody>
                {periodTotals(trend ?? []).map((rowA) => {
                  const rowB = periodTotals(comparePeriod).find((r) => r.brand === rowA.brand);
                  return (
                    <tr key={rowA.brand} className="border-b border-gray-50 last:border-0">
                      <td className="py-1.5 text-gray-700">{rowA.brand}</td>
                      <td className="py-1.5 text-right text-gray-600">{rowA.share === null ? "Unavailable" : `${Math.round(rowA.share * 100)}%`}</td>
                      <td className="py-1.5 text-right text-gray-600">
                        {!rowB || rowB.share === null ? "Unavailable" : `${Math.round(rowB.share * 100)}%`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <MetricsMethodology scope="benchmark" />
    </div>
  );
}
