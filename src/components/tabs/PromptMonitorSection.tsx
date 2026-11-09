"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Citation, PromptResponseResult, ResponsePlatform, SavedTest, TestRun, TestRunSettings } from "@/lib/types";
import { appendRunHistory, loadRunHistory, loadSavedTests, writeSavedTests } from "@/lib/storage";
import MetricsMethodology from "@/components/ui/MetricsMethodology";
import PromptMonitorHistory from "@/components/tabs/PromptMonitorHistory";

const PLATFORM_LABEL: Record<ResponsePlatform, string> = {
  chat_gpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  perplexity: "Perplexity",
};

// Whether this platform's endpoint accepts a geo-targeting parameter at all —
// confirmed against DataForSEO's docs. Gemini has none; a market named in the
// prompt text for Gemini is a test scenario, never an enforced location.
const PLATFORM_SUPPORTS_GEO: Record<ResponsePlatform, boolean> = {
  chat_gpt: true,
  claude: true,
  perplexity: true,
  gemini: false,
};

const ALL_PLATFORMS: ResponsePlatform[] = ["chat_gpt", "claude", "gemini", "perplexity"];

const DEFAULT_PROMPT = "Which niacinamide serums under NT$2,000 would you recommend for combination skin in Taiwan?";
const TRADITIONAL_CHINESE_PROMPT = "我想找一款兩千元以內、適合混合性肌膚的菸鹼醯胺精華，有推薦的品牌嗎？";

let nextPromptId = 1;
let nextId = 1;
function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${nextId++}`;
}

// Deterministic string hash — same approach used for demo data elsewhere on
// this tab, so results don't jump around on unrelated re-renders.
function hashSeed(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return h;
}

const SAMPLE_MODEL: Record<ResponsePlatform, string> = {
  chat_gpt: "gpt-4.1-mini",
  claude: "claude-haiku-4-5",
  gemini: "gemini-2.5-flash-lite",
  perplexity: "sonar",
};

// Fixture links so reviewers can see how citation rendering works without a
// live call — clearly labeled "Example sources" in the UI, never presented
// as real retrieved citations.
const SAMPLE_CITATIONS: Citation[] = [
  { title: "reddit.com/r/SkincareAddiction", url: "https://www.reddit.com/r/SkincareAddiction/" },
  { title: "byrdie.com — Best Niacinamide Serums", url: "https://www.byrdie.com/best-niacinamide-serums" },
];

// Canned, clearly-fictional responses for "Interactive demo" mode (no live
// API call, no cost) — not a real AI output.
function buildSampleResults(
  brand: string,
  competitors: string[],
  prompts: string[],
  platforms: ResponsePlatform[],
): PromptResponseResult[] {
  const names = [brand, ...competitors].filter(Boolean);
  const results: PromptResponseResult[] = [];
  for (const platform of platforms) {
    prompts.forEach((prompt, i) => {
      const seed = hashSeed(`${platform}|${prompt}|${i}`);
      const mentioned = names.filter((_, idx) => (seed >> idx) % 3 !== 0);
      const text =
        mentioned.length > 0
          ? `(Sample response) For a question like this, brands commonly mentioned include: ${mentioned.join(", ")}. Actual content would vary by platform, model, and live web-search results at the time.\n\nThings shoppers in this category usually compare:\n- Active ingredient concentration\n- Price per ml\n- Reviews from similar skin types`
          : `(Sample response) Answers to this kind of question typically list general buying criteria rather than naming one specific brand.`;
      // Varies deterministically so the demo shows both "has citations" and
      // "no citations" states, per the brief's ask to verify both render.
      const hasCitations = mentioned.length > 0 && seed % 2 === 0;
      results.push({
        platform,
        prompt,
        status: "ok",
        modelName: SAMPLE_MODEL[platform],
        webSearchUsed: true,
        responseText: text,
        mentionedBrands: mentioned,
        citations: hasCitations ? SAMPLE_CITATIONS : [],
      });
    });
  }
  return results;
}

export default function PromptMonitorSection({
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
  const competitors = useMemo(() => competitorsInput.split(",").map((c) => c.trim()).filter(Boolean), [competitorsInput]);

  const [prompts, setPrompts] = useState<{ id: number; text: string }[]>(() => [{ id: nextPromptId++, text: DEFAULT_PROMPT }]);
  const [draftPrompt, setDraftPrompt] = useState("");
  const [platforms, setPlatforms] = useState<Set<ResponsePlatform>>(new Set(ALL_PLATFORMS));
  const [market, setMarket] = useState("Taiwan");
  const [language, setLanguage] = useState("Traditional Chinese");
  const [webSearch, setWebSearch] = useState(true);
  const [geoCode, setGeoCode] = useState("TW");

  const [results, setResults] = useState<PromptResponseResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [onlyCompetitorAppearances, setOnlyCompetitorAppearances] = useState(false);
  const requestIdRef = useRef(0);

  const [savedTests, setSavedTests] = useState<SavedTest[]>([]);
  const [selectedSavedTestId, setSelectedSavedTestId] = useState<string>("");
  const [history, setHistory] = useState<TestRun[]>([]);
  const [savingTest, setSavingTest] = useState(false);
  const [newTestName, setNewTestName] = useState("");

  // localStorage doesn't exist during server rendering, so reading it has to
  // happen after mount — rendering empty state first keeps the client's
  // initial render matching the server's and avoids a hydration mismatch.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setSavedTests(loadSavedTests());
    setHistory(loadRunHistory());
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  function addPrompt() {
    const text = draftPrompt.trim();
    if (!text || prompts.length >= 5) return;
    setPrompts((prev) => [...prev, { id: nextPromptId++, text }]);
    setDraftPrompt("");
  }
  function removePrompt(id: number) {
    setPrompts((prev) => prev.filter((p) => p.id !== id));
  }
  function togglePlatform(p: ResponsePlatform) {
    setPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }
  function useTraditionalChinesePrompt() {
    setPrompts((prev) => (prev.length === 1 ? [{ ...prev[0], text: TRADITIONAL_CHINESE_PROMPT }] : prev));
    setMarket("Taiwan");
    setLanguage("Traditional Chinese");
    setGeoCode("TW");
  }

  function currentSettings(): TestRunSettings {
    return {
      prompts: prompts.map((p) => p.text).filter(Boolean),
      brand,
      competitors,
      platforms: Array.from(platforms),
      market,
      language,
      webSearch,
      webSearchCountryIsoCode: geoCode || undefined,
    };
  }

  function loadSavedTest(id: string) {
    setSelectedSavedTestId(id);
    if (!id) return;
    const t = savedTests.find((st) => st.id === id);
    if (!t) return;
    setPrompts(t.prompts.map((text) => ({ id: nextPromptId++, text })));
    setBrand(t.brand);
    setCompetitorsInput(t.competitors.join(", "));
    setPlatforms(new Set(t.platforms));
    setMarket(t.market);
    setLanguage(t.language);
    setWebSearch(t.webSearch);
    setGeoCode(t.webSearchCountryIsoCode ?? "");
  }

  function confirmSaveCurrentAsTest() {
    const name = newTestName.trim();
    if (!name) return;
    const settings = currentSettings();
    const test: SavedTest = { id: uid("test"), name, createdAt: new Date().toISOString(), ...settings };
    const next = [test, ...savedTests];
    setSavedTests(next);
    writeSavedTests(next);
    setSelectedSavedTestId(test.id);
    setNewTestName("");
    setSavingTest(false);
  }

  function deleteSavedTest(id: string) {
    const next = savedTests.filter((t) => t.id !== id);
    setSavedTests(next);
    writeSavedTests(next);
    if (selectedSavedTestId === id) setSelectedSavedTestId("");
  }

  async function run() {
    const myRequestId = ++requestIdRef.current;
    const settings = currentSettings();
    if (settings.prompts.length === 0 || settings.platforms.length === 0) return;

    setLoading(true);
    setError(null);
    setResults(null); // clear stale results from a previous run immediately
    setExpanded(null);

    const finish = (runResults: PromptResponseResult[], mode: "live" | "demo") => {
      if (myRequestId !== requestIdRef.current) return; // superseded by a newer run
      setResults(runResults);
      setLoading(false);
      const run: TestRun = {
        id: uid("run"),
        savedTestId: selectedSavedTestId || null,
        savedTestName: selectedSavedTestId ? savedTests.find((t) => t.id === selectedSavedTestId)?.name ?? null : null,
        timestamp: new Date().toISOString(),
        mode,
        settings,
        results: runResults,
      };
      setHistory(appendRunHistory(run));
    };

    // Interactive-demo mode: no live call, no cost — a visitor without "Use
    // live DataForSEO data" enabled only ever sees sample responses. This is
    // the only thing standing between a public link and an open billing tap.
    if (!useLiveData) {
      await new Promise((r) => setTimeout(r, 500)); // small delay so it doesn't feel instantaneous/fake
      finish(buildSampleResults(settings.brand, settings.competitors, settings.prompts, settings.platforms), "demo");
      return;
    }

    try {
      const res = await fetch("/api/geo/prompt-monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand: settings.brand,
          competitors: settings.competitors,
          prompts: settings.prompts,
          platforms: settings.platforms,
          webSearch: settings.webSearch,
          webSearchCountryIsoCode: settings.webSearchCountryIsoCode,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "DataForSEO request failed");
      if (myRequestId !== requestIdRef.current) return;
      finish(json.results, "live");
    } catch (err) {
      if (myRequestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : "DataForSEO request failed");
      setLoading(false);
    }
  }

  const names = useMemo(() => [brand, ...competitors].filter(Boolean), [brand, competitors]);

  // Per-platform coverage + per-brand mention rate: x analyzed-and-mentioning / y analyzed.
  const comparison = useMemo(() => {
    if (!results) return null;
    const byPlatform = new Map<ResponsePlatform, PromptResponseResult[]>();
    for (const p of ALL_PLATFORMS) byPlatform.set(p, []);
    for (const r of results) byPlatform.get(r.platform)?.push(r);

    return ALL_PLATFORMS.filter((p) => platforms.has(p)).map((platform) => {
      const all = byPlatform.get(platform) ?? [];
      // Only "ok" responses have text to check for a mention — "empty" means
      // the request succeeded but returned nothing usable, so it's excluded
      // from the ratio entirely rather than silently counted as a non-mention.
      const analyzed = all.filter((r) => r.status === "ok");
      const empty = all.filter((r) => r.status === "empty");
      const errored = all.filter((r) => r.status === "error");
      const rows = names.map((name) => {
        const mentioning = analyzed.filter((r) => r.mentionedBrands.includes(name));
        return { name, count: mentioning.length, total: analyzed.length };
      });
      const models = Array.from(new Set(all.map((r) => r.modelName).filter((m): m is string => Boolean(m))));
      return { platform, requested: all.length, analyzed: analyzed.length, empty: empty.length, errored: errored.length, rows, models };
    });
  }, [results, names, platforms]);

  // "Where competitors appeared" — prompt/platform pairs that mention a
  // competitor but not the focal brand.
  const competitorOnlyResults = useMemo(() => {
    if (!results) return [];
    return results.filter(
      (r) => r.status === "ok" && !r.mentionedBrands.includes(brand) && r.mentionedBrands.some((m) => competitors.includes(m)),
    );
  }, [results, brand, competitors]);

  // Groups the flat results list into one entry per question, each holding
  // its per-platform rows in original order — the "Where competitors
  // appeared" filter narrows this before grouping, so a question with no
  // matching rows simply doesn't produce a group.
  const questionGroups = useMemo(() => {
    const list = onlyCompetitorAppearances ? competitorOnlyResults : results ?? [];
    const order: string[] = [];
    const byPrompt = new Map<string, PromptResponseResult[]>();
    for (const r of list) {
      if (!byPrompt.has(r.prompt)) {
        byPrompt.set(r.prompt, []);
        order.push(r.prompt);
      }
      byPrompt.get(r.prompt)!.push(r);
    }
    return order.map((prompt) => ({ prompt, rows: byPrompt.get(prompt)! }));
  }, [results, onlyCompetitorAppearances, competitorOnlyResults]);

  // Compact headline: the focal brand's mention rate per platform, across
  // every question sent. The full per-brand/per-platform breakdown is still
  // computed in `comparison` above but no longer rendered as a table — the
  // formula itself lives in "How metrics are calculated."
  const headline = useMemo(() => {
    if (!comparison) return [];
    return comparison.map((c) => {
      const row = c.rows.find((r) => r.name === brand);
      return { platform: c.platform, count: row?.count ?? 0, total: c.analyzed };
    });
  }, [comparison, brand]);

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Prompt Monitoring</h3>
          <p className="text-xs text-gray-400 mt-1">
            Send a brand-neutral shopping question to each selected AI platform and see which brands come up in the
            answers — not whether a provider&apos;s own dataset already mentions you.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-xs text-gray-500">Saved tests</label>
          <select
            value={selectedSavedTestId}
            onChange={(e) => loadSavedTest(e.target.value)}
            className="text-gray-900 placeholder:text-gray-400 text-xs border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 min-w-[160px]"
          >
            <option value="">— Select a saved test —</option>
            {savedTests.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {!savingTest ? (
            <button
              onClick={() => {
                setNewTestName(`${brand} — ${market}`.trim());
                setSavingTest(true);
              }}
              className="text-xs px-3 py-1.5 rounded-md border border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600 transition"
            >
              Save current setup
            </button>
          ) : (
            <span className="flex items-center gap-1.5">
              <input
                value={newTestName}
                onChange={(e) => setNewTestName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmSaveCurrentAsTest();
                  if (e.key === "Escape") setSavingTest(false);
                }}
                placeholder="Name this saved test"
                autoFocus
                className="text-gray-900 placeholder:text-gray-400 text-xs border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 w-44"
              />
              <button onClick={confirmSaveCurrentAsTest} className="text-xs px-2.5 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition">
                Save
              </button>
              <button onClick={() => setSavingTest(false)} className="text-xs text-gray-400 hover:text-gray-600 px-1">
                Cancel
              </button>
            </span>
          )}
          {selectedSavedTestId && (
            <button
              onClick={() => deleteSavedTest(selectedSavedTestId)}
              className="text-xs px-3 py-1.5 rounded-md border border-gray-200 text-red-500 hover:border-red-300 transition"
            >
              Delete
            </button>
          )}
          <span className="text-[11px] text-gray-400 ml-auto">Saved tests are stored in this browser only.</span>
        </div>

        {/* Question field first, as the primary input */}
        <div className="space-y-2">
          <label className="text-xs text-gray-500 block">Question (up to 5, sent exactly as written)</label>
          {prompts.map((p) => (
            <div key={p.id} className="flex items-start gap-2">
              <textarea
                value={p.text}
                onChange={(e) =>
                  setPrompts((prev) => prev.map((pr) => (pr.id === p.id ? { ...pr, text: e.target.value } : pr)))
                }
                rows={2}
                className="flex-1 text-xs text-gray-800 border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
              <button
                onClick={() => removePrompt(p.id)}
                className="text-xs text-gray-400 hover:text-red-500 transition px-1"
                aria-label="Remove this question"
              >
                ✕
              </button>
            </div>
          ))}
          {prompts.length < 5 && (
            <div className="flex gap-2">
              <input
                value={draftPrompt}
                onChange={(e) => setDraftPrompt(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addPrompt()}
                placeholder="e.g. Recommend a few sunscreens for sensitive skin"
                className="text-gray-900 placeholder:text-gray-400 flex-1 text-xs border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
              />
              <button
                onClick={addPrompt}
                className="text-xs px-3 py-1.5 rounded-md border border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600 transition"
              >
                Add question
              </button>
            </div>
          )}
          <button onClick={useTraditionalChinesePrompt} className="text-[11px] text-indigo-600 hover:underline">
            Use a Traditional Chinese / Taiwan scenario instead →
          </button>
        </div>

        {/* Focal brand, competitors, platforms, market, language — in that order */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Focal brand</label>
            <input
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              className="text-gray-900 placeholder:text-gray-400 w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Competitors (comma separated)</label>
            <input
              value={competitorsInput}
              onChange={(e) => setCompetitorsInput(e.target.value)}
              className="text-gray-900 placeholder:text-gray-400 w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Market</label>
            <input
              value={market}
              onChange={(e) => setMarket(e.target.value)}
              placeholder="e.g. Taiwan"
              className="text-gray-900 placeholder:text-gray-400 w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Language</label>
            <input
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              placeholder="e.g. Traditional Chinese"
              className="text-gray-900 placeholder:text-gray-400 w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
        </div>
        <p className="text-[11px] text-gray-400 -mt-1">
          Market and language here describe the scenario in the question — they are not sent as API parameters unless
          the geo setting below is also enabled for a platform that supports it.
        </p>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-wrap gap-1.5">
            {ALL_PLATFORMS.map((p) => (
              <button
                key={p}
                onClick={() => togglePlatform(p)}
                className={`text-[11px] px-2.5 py-1 rounded-full border transition ${
                  platforms.has(p) ? "border-indigo-300 text-indigo-600 bg-indigo-50" : "border-gray-200 text-gray-400 bg-white"
                }`}
              >
                {PLATFORM_LABEL[p]}
                {webSearch && !PLATFORM_SUPPORTS_GEO[p] && <sup className="ml-0.5">†</sup>}
              </button>
            ))}
          </div>
          {webSearch && ALL_PLATFORMS.some((p) => platforms.has(p) && !PLATFORM_SUPPORTS_GEO[p]) && (
            <p className="text-[11px] text-amber-600 w-full">† no API geo parameter for this platform — see note below</p>
          )}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          <input type="checkbox" checked={webSearch} onChange={(e) => setWebSearch(e.target.checked)} className="h-3.5 w-3.5 accent-indigo-600" />
          Web search
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          Geo (ISO code, API-enforced where supported)
          <input
            value={geoCode}
            onChange={(e) => setGeoCode(e.target.value.toUpperCase().slice(0, 2))}
            disabled={!webSearch}
            className="text-gray-900 placeholder:text-gray-400 w-12 text-xs border border-gray-200 rounded-md px-1.5 py-1 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:opacity-50"
          />
        </label>
        <p className="text-[11px] text-gray-400 -mt-2">
          Geo only works as an API-enforced setting for ChatGPT, Claude and Perplexity — DataForSEO&apos;s Gemini
          endpoint has no geo parameter. A Taiwan scenario for Gemini only comes from writing it into the question
          itself; that&apos;s a test scenario, not an enforced location.
        </p>

        <button
          onClick={run}
          disabled={loading || prompts.length === 0 || platforms.size === 0}
          className="text-xs px-4 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-50"
        >
          {loading ? "Running…" : useLiveData ? "Run test (live)" : "Run test (interactive demo)"}
        </button>
        {error && <span className="ml-2 text-xs text-red-500">{error}</span>}
        {!useLiveData && (
          <p className="text-[11px] text-gray-400">
            Interactive demo — these are canned sample responses, not real AI output. Turn on &ldquo;Use live
            DataForSEO data&rdquo; above to send questions to the real APIs (billed per request).
          </p>
        )}
      </div>

      {comparison && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-4">
          {!useLiveData && (
            <span className="text-[10px] px-2 py-0.5 rounded-full border border-amber-200 text-amber-700 bg-amber-50 font-medium">
              Interactive demo — sample responses, not real AI output
            </span>
          )}

          <div>
            <h4 className="text-xs font-semibold text-gray-700 mb-2">Brand mention rate by platform</h4>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
              {headline.map((h) => (
                <div key={h.platform} className="flex items-center gap-1.5 text-xs">
                  <span className="font-medium text-gray-800">{PLATFORM_LABEL[h.platform]}</span>
                  {h.total > 0 ? (
                    <span className="text-gray-500">
                      {h.count}/{h.total} responses · {Math.round((h.count / h.total) * 100)}%
                    </span>
                  ) : (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-amber-200 text-amber-700 bg-amber-50 font-medium">
                      Unavailable
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {competitorOnlyResults.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 space-y-1">
              <label className="flex items-center gap-2 text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={onlyCompetitorAppearances}
                  onChange={(e) => setOnlyCompetitorAppearances(e.target.checked)}
                  className="h-3.5 w-3.5 accent-indigo-600"
                />
                Where competitors appeared ({competitorOnlyResults.length})
              </label>
              <p className="text-[11px] text-gray-500 pl-6">Shows answers that mention a tracked competitor but omit the focal brand.</p>
            </div>
          )}

          <div className="space-y-3">
            {questionGroups.map((g) => (
              <QuestionGroup
                key={g.prompt}
                prompt={g.prompt}
                rows={g.rows}
                useLiveData={useLiveData}
                expandedKey={expanded}
                onToggle={(key) => setExpanded((prev) => (prev === key ? null : key))}
              />
            ))}
            {questionGroups.length === 0 && (
              <p className="text-xs text-gray-400">No answers match this filter.</p>
            )}
          </div>
        </div>
      )}

      <MetricsMethodology scope="prompts" />

      <PromptMonitorHistory history={history} onHistoryChange={setHistory} />
    </div>
  );
}

function StatusBadge({ status }: { status: PromptResponseResult["status"] }) {
  const style =
    status === "ok"
      ? "border-emerald-200 text-emerald-600 bg-emerald-50"
      : status === "empty"
        ? "border-gray-200 text-gray-500 bg-gray-50"
        : "border-red-200 text-red-500 bg-red-50";
  return <span className={`text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap ${style}`}>{status}</span>;
}

// One question, shown once, with a compact platform row underneath for each
// platform that answered it.
function QuestionGroup({
  prompt,
  rows,
  useLiveData,
  expandedKey,
  onToggle,
}: {
  prompt: string;
  rows: PromptResponseResult[];
  useLiveData: boolean;
  expandedKey: string | null;
  onToggle: (key: string) => void;
}) {
  return (
    <div className="border border-gray-100 rounded-lg p-3">
      <p className="text-xs font-medium text-gray-800 mb-1.5">{prompt}</p>
      <div>
        {rows.map((r) => {
          const key = `${r.platform}::${prompt}`;
          return (
            <PlatformRow
              key={r.platform}
              r={r}
              useLiveData={useLiveData}
              isOpen={expandedKey === key}
              onToggle={() => onToggle(key)}
            />
          );
        })}
      </div>
    </div>
  );
}

// Model name + search status, condensed to one line. "Web search used" is
// only ever shown for a live answer where the API itself confirmed it —
// never inferred from the request settings.
function metadataLine(r: PromptResponseResult, useLiveData: boolean): string {
  const parts: string[] = [];
  if (!useLiveData) parts.push("Sample response");
  if (r.modelName) parts.push(`Model: ${r.modelName}`);
  if (useLiveData && r.webSearchUsed === true) parts.push("Web search used");
  return parts.join(" · ");
}

function PlatformRow({
  r,
  useLiveData,
  isOpen,
  onToggle,
}: {
  r: PromptResponseResult;
  useLiveData: boolean;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const canExpand = r.status === "ok" && Boolean(r.responseText);
  return (
    <div className="py-2 border-b border-gray-50 last:border-0">
      <div className="flex items-start justify-between gap-2 flex-wrap sm:flex-nowrap">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="text-xs font-medium text-gray-800 shrink-0">{PLATFORM_LABEL[r.platform]}</span>
          <StatusBadge status={r.status} />
          {r.status === "ok" && (
            <span className="text-[11px] text-gray-600">
              {r.mentionedBrands.length > 0 ? `Mentioned: ${r.mentionedBrands.join(", ")}` : "No tracked brand mentioned"}
            </span>
          )}
          {r.status === "empty" && <span className="text-[11px] text-gray-400">No usable text returned</span>}
          {r.status === "error" && <span className="text-[11px] text-red-500">{r.error}</span>}
        </div>
        {canExpand && (
          <button onClick={onToggle} className="text-[11px] text-indigo-600 hover:underline shrink-0">
            {isOpen ? "Hide answer" : "View answer"}
          </button>
        )}
      </div>
      {isOpen && canExpand && (
        <div className="mt-2 max-w-prose space-y-2">
          <p className="text-[11px] text-gray-400">{metadataLine(r, useLiveData)}</p>
          <div className="text-xs text-gray-700 bg-gray-50 border border-gray-100 rounded-md p-3">
            <FormattedAnswer text={r.responseText!} />
          </div>
          <CitationsBlock r={r} useLiveData={useLiveData} />
        </div>
      )}
    </div>
  );
}

// Lightweight paragraph/list rendering for plain-text and markdown-ish model
// output — no markdown library, just enough structure to read comfortably:
// blank-line-separated paragraphs, with "-"/"*" or "1." lines as lists.
function FormattedAnswer({ text }: { text: string }) {
  const blocks = text
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  return (
    <div className="space-y-2">
      {blocks.map((block, i) => {
        const lines = block
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean);
        const isBulletList = lines.length > 0 && lines.every((l) => /^[-*]\s+/.test(l));
        const isNumberedList = lines.length > 0 && lines.every((l) => /^\d+[.)]\s+/.test(l));
        if (isBulletList) {
          return (
            <ul key={i} className="list-disc list-inside space-y-0.5">
              {lines.map((l, j) => (
                <li key={j}>{l.replace(/^[-*]\s+/, "")}</li>
              ))}
            </ul>
          );
        }
        if (isNumberedList) {
          return (
            <ol key={i} className="list-decimal list-inside space-y-0.5">
              {lines.map((l, j) => (
                <li key={j}>{l.replace(/^\d+[.)]\s+/, "")}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <span key={j}>
                {l}
                {j < lines.length - 1 && <br />}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

// Citations have three different honest "nothing to show" states for a live
// answer (ran search but got none / search was off / API didn't confirm
// either way) — collapsing them into one generic message would misrepresent
// what actually happened. Demo answers use a separate, clearly-labeled
// fixture instead of pretending to have live citation data.
function CitationsBlock({ r, useLiveData }: { r: PromptResponseResult; useLiveData: boolean }) {
  if (!useLiveData) {
    if (r.citations.length === 0) return null;
    return (
      <div>
        <p className="text-[11px] text-gray-500 mb-0.5">Example sources</p>
        <p className="text-[10px] text-gray-400 mb-1">Fixture links for demo purposes — not retrieved from a live response.</p>
        <ul className="text-xs space-y-0.5">
          {r.citations.map((c) => (
            <li key={c.url}>
              <a href={c.url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                {c.title}
              </a>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (r.citations.length > 0) {
    return (
      <div>
        <p className="text-[11px] text-gray-500 mb-0.5">Citations</p>
        <ul className="text-xs space-y-0.5">
          {r.citations.map((c) => (
            <li key={c.url}>
              <a href={c.url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                {c.title}
              </a>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (r.webSearchUsed === true) return <p className="text-[11px] text-gray-400">No citations returned.</p>;
  if (r.webSearchUsed === false) return <p className="text-[11px] text-gray-400">Web search was off.</p>;
  return <p className="text-[11px] text-gray-400">Search status unavailable.</p>;
}
