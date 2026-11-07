"use client";

import { useMemo, useRef, useState } from "react";
import type { Citation, PromptResponseResult, ResponsePlatform } from "@/lib/types";

const PLATFORM_LABEL: Record<ResponsePlatform, string> = {
  chat_gpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  perplexity: "Perplexity",
};

// Whether this platform's endpoint accepts a geo-targeting parameter at all —
// confirmed against DataForSEO's docs on 2026-11-07. Gemini has none; a
// Taiwan scenario for Gemini only ever comes from the prompt text itself.
const PLATFORM_SUPPORTS_GEO: Record<ResponsePlatform, boolean> = {
  chat_gpt: true,
  claude: true,
  perplexity: true,
  gemini: false,
};

const ALL_PLATFORMS: ResponsePlatform[] = ["chat_gpt", "claude", "gemini", "perplexity"];

const DEFAULT_PROMPTS = ["我想找一款兩千元以內、適合混合性肌膚的菸鹼醯胺精華，有推薦的品牌嗎？"];

let nextPromptId = 1;

export default function PromptMonitorSection({
  brandName,
  competitors,
  useLiveData,
}: {
  brandName: string;
  competitors: string[];
  useLiveData: boolean;
}) {
  const [prompts, setPrompts] = useState<{ id: number; text: string }[]>(() =>
    DEFAULT_PROMPTS.map((text) => ({ id: nextPromptId++, text })),
  );
  const [draftPrompt, setDraftPrompt] = useState("");
  const [platforms, setPlatforms] = useState<Set<ResponsePlatform>>(new Set(ALL_PLATFORMS));
  const [webSearch, setWebSearch] = useState(true);
  const [geoCode, setGeoCode] = useState("TW");
  const [results, setResults] = useState<PromptResponseResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const requestIdRef = useRef(0);

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

  async function run() {
    const myRequestId = ++requestIdRef.current;
    const promptTexts = prompts.map((p) => p.text).filter(Boolean);
    const selectedPlatforms = Array.from(platforms);
    if (promptTexts.length === 0 || selectedPlatforms.length === 0) return;

    setLoading(true);
    setError(null);
    setResults(null); // clear stale results from a previous run immediately
    setExpanded(null);

    try {
      const res = await fetch("/api/geo/prompt-monitor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand: brandName,
          competitors,
          prompts: promptTexts,
          platforms: selectedPlatforms,
          webSearch,
          webSearchCountryIsoCode: geoCode || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "DataForSEO request failed");
      if (myRequestId !== requestIdRef.current) return; // superseded by a newer run
      setResults(json.results);
    } catch (err) {
      if (myRequestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : "DataForSEO request failed");
    } finally {
      if (myRequestId === requestIdRef.current) setLoading(false);
    }
  }

  const names = useMemo(() => [brandName, ...competitors].filter(Boolean), [brandName, competitors]);

  // Brand (row) x platform (col) comparison: x analyzed-and-mentioning / y analyzed, per platform.
  const comparison = useMemo(() => {
    if (!results) return null;
    const byPlatform = new Map<ResponsePlatform, PromptResponseResult[]>();
    for (const p of ALL_PLATFORMS) byPlatform.set(p, []);
    for (const r of results) byPlatform.get(r.platform)?.push(r);

    const platformStats = ALL_PLATFORMS.filter((p) => platforms.has(p)).map((platform) => {
      const all = byPlatform.get(platform) ?? [];
      const analyzed = all.filter((r) => r.status === "ok" || r.status === "empty");
      const errored = all.filter((r) => r.status === "error");
      const rows = names.map((name) => {
        const mentioning = analyzed.filter((r) => r.mentionedBrands.includes(name));
        return { name, count: mentioning.length, total: analyzed.length };
      });
      return { platform, requested: all.length, analyzed: analyzed.length, errored: errored.length, rows };
    });
    return platformStats;
  }, [results, names, platforms]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">Prompt-based competitor monitoring</h3>
        <p className="text-xs text-gray-400 mt-1">
          Send the same brand-neutral questions to each selected AI platform and see which brands come up in the
          answers — not whether the provider&apos;s own dataset already mentions you.
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-xs text-gray-500 block">Prompts (up to 5, sent exactly as written)</label>
        {prompts.map((p) => (
          <div key={p.id} className="flex items-start gap-2">
            <textarea
              value={p.text}
              onChange={(e) =>
                setPrompts((prev) => prev.map((pr) => (pr.id === p.id ? { ...pr, text: e.target.value } : pr)))
              }
              rows={2}
              className="flex-1 text-xs text-gray-800 border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-indigo-400"
            />
            <button
              onClick={() => removePrompt(p.id)}
              className="text-xs text-gray-400 hover:text-red-500 transition px-1"
              aria-label="Remove this prompt"
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
              placeholder="e.g. 推薦幾款適合敏感肌的防曬乳"
              className="flex-1 text-xs border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-indigo-400"
            />
            <button
              onClick={addPrompt}
              className="text-xs px-3 py-1.5 rounded-md border border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600 transition"
            >
              Add prompt
            </button>
          </div>
        )}
      </div>

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
          <p className="text-[11px] text-amber-600 w-full">† no API geo parameter — see note below</p>
        )}
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          <input type="checkbox" checked={webSearch} onChange={(e) => setWebSearch(e.target.checked)} className="h-3.5 w-3.5 accent-indigo-600" />
          Web search
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          Geo (ISO code)
          <input
            value={geoCode}
            onChange={(e) => setGeoCode(e.target.value.toUpperCase().slice(0, 2))}
            disabled={!webSearch}
            className="w-12 text-xs border border-gray-200 rounded-md px-1.5 py-1 focus:outline-none focus:border-indigo-400 disabled:opacity-50"
          />
        </label>
      </div>
      <p className="text-[11px] text-gray-400 -mt-2">
        Geo only works as an API-enforced setting for ChatGPT, Claude and Perplexity — DataForSEO&apos;s Gemini endpoint has
        no geo parameter. A Taiwan scenario for Gemini only comes from writing it into the prompt itself; that&apos;s a test
        scenario, not an enforced location.
      </p>

      <button
        onClick={run}
        disabled={loading || prompts.length === 0 || platforms.size === 0}
        className="text-xs px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-50"
      >
        {loading ? "Running prompts across platforms…" : "Run prompts"}
      </button>
      {error && <span className="ml-2 text-xs text-red-500">{error}</span>}
      {!useLiveData && (
        <p className="text-[11px] text-amber-600">
          &ldquo;Use live DataForSEO data&rdquo; is off above — this still calls the real API when you click Run; the toggle
          only affects the other tabs.
        </p>
      )}

      {comparison && (
        <div className="space-y-5 pt-2">
          {comparison.map(({ platform, requested, analyzed, errored, rows }) => (
            <div key={platform} className="border border-gray-100 rounded-lg p-3">
              <div className="flex items-center justify-between flex-wrap gap-1 mb-2">
                <span className="text-xs font-semibold text-gray-800">{PLATFORM_LABEL[platform]}</span>
                <span className="text-[11px] text-gray-400">
                  {requested} requested · {analyzed} analyzed{errored > 0 ? ` · ${errored} failed` : ""}
                </span>
              </div>
              {analyzed === 0 ? (
                <p className="text-xs text-gray-400">
                  {errored > 0 ? "All requests to this platform failed — see details below." : "No prompts were sent to this platform."}
                </p>
              ) : (
                <table className="w-full text-xs">
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.name} className="border-b border-gray-50 last:border-0">
                        <td className="py-1.5 text-gray-700">{r.name}</td>
                        <td className="py-1.5 text-right text-gray-900 font-medium whitespace-nowrap">
                          {r.count}/{r.total} · {r.total > 0 ? Math.round((r.count / r.total) * 100) : 0}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
          <p className="text-[11px] text-gray-400">
            Each cell is mentions ÷ successfully analyzed responses for that platform — denominators differ by
            platform when a request fails or returns no usable content. A 0 means the brand was checked and not
            found, not that data is missing.
          </p>

          <div>
            <h4 className="text-xs font-semibold text-gray-700 mb-2">Inspect individual responses</h4>
            <div className="space-y-1.5">
              {results!.map((r, i) => {
                const key = `${r.platform}-${i}`;
                const isOpen = expanded === key;
                return (
                  <div key={key} className="border border-gray-100 rounded-md">
                    <button
                      onClick={() => setExpanded(isOpen ? null : key)}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
                    >
                      <span className="text-[11px] text-gray-700 truncate flex-1">
                        <span className="font-medium">{PLATFORM_LABEL[r.platform]}</span> — {r.prompt}
                      </span>
                      <StatusBadge status={r.status} />
                    </button>
                    {isOpen && (
                      <div className="px-3 pb-3 space-y-2 text-xs">
                        {r.status === "error" && <p className="text-red-500">{r.error}</p>}
                        {r.status === "empty" && <p className="text-gray-400">Request succeeded; the response had no usable text.</p>}
                        {r.modelName && (
                          <p className="text-gray-400">
                            Model: <span className="font-mono">{r.modelName}</span>
                            {r.webSearchUsed !== null && ` · web search ${r.webSearchUsed ? "used" : "not used"}`}
                          </p>
                        )}
                        {r.responseText && (
                          <p className="text-gray-700 whitespace-pre-wrap bg-gray-50 border border-gray-100 rounded-md p-2">
                            {r.responseText}
                          </p>
                        )}
                        {r.mentionedBrands.length > 0 && (
                          <p className="text-gray-600">Mentioned: {r.mentionedBrands.join(", ")}</p>
                        )}
                        {r.citations.length > 0 && (
                          <div>
                            <p className="text-gray-500 mb-1">Citations:</p>
                            <ul className="list-disc list-inside text-gray-600">
                              {r.citations.map((c: Citation) => (
                                <li key={c.url}>
                                  <a href={c.url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                                    {c.title}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
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
