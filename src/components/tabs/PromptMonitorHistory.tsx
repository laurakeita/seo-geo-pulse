"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ResponsePlatform, TestRun, TestRunSettings } from "@/lib/types";
import { writeRunHistory } from "@/lib/storage";

const PLATFORM_LABEL: Record<ResponsePlatform, string> = {
  chat_gpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  perplexity: "Perplexity",
};

function settingsIdentity(s: TestRunSettings): string {
  // What makes two runs "the same test" for trend-charting purposes. Market/
  // language/search settings are tracked but changing them is flagged in the
  // 2-run compare rather than splitting the trend group — only the question
  // set, brand set and platform set define the group.
  return JSON.stringify({
    prompts: [...s.prompts].sort(),
    brand: s.brand,
    competitors: [...s.competitors].sort(),
    platforms: [...s.platforms].sort(),
  });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function okKey(platform: string, prompt: string) {
  return `${platform}::${prompt}`;
}

function focalBrandRate(run: TestRun): { count: number; total: number } {
  const ok = run.results.filter((r) => r.status === "ok");
  const mentioning = ok.filter((r) => r.mentionedBrands.includes(run.settings.brand));
  return { count: mentioning.length, total: ok.length };
}

export default function PromptMonitorHistory({
  history,
  onHistoryChange,
}: {
  history: TestRun[];
  onHistoryChange: (next: TestRun[]) => void;
}) {
  const [mode, setMode] = useState<"live" | "demo">("live");
  const [runAId, setRunAId] = useState<string>("");
  const [runBId, setRunBId] = useState<string>("");

  const visibleHistory = useMemo(
    () => history.filter((r) => r.mode === mode).sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    [history, mode],
  );

  function clearHistory() {
    if (!window.confirm("Clear all run history stored in this browser? This can't be undone.")) return;
    writeRunHistory([]);
    onHistoryChange([]);
  }

  function quickCompareLatest() {
    if (visibleHistory.length < 2) return;
    setRunBId(visibleHistory[0].id);
    setRunAId(visibleHistory[1].id);
  }

  const runA = history.find((r) => r.id === runAId) ?? null;
  const runB = history.find((r) => r.id === runBId) ?? null;

  const matchedPairs = useMemo(() => {
    if (!runA || !runB) return [];
    const aOk = new Set(runA.results.filter((r) => r.status === "ok").map((r) => okKey(r.platform, r.prompt)));
    const seen = new Set<string>();
    const pairs: { platform: string; prompt: string }[] = [];
    for (const r of runB.results) {
      if (r.status !== "ok") continue;
      const key = okKey(r.platform, r.prompt);
      if (aOk.has(key) && !seen.has(key)) {
        seen.add(key);
        pairs.push({ platform: r.platform, prompt: r.prompt });
      }
    }
    return pairs;
  }, [runA, runB]);

  const settingsDiffs = useMemo(() => {
    if (!runA || !runB) return [];
    const diffs: string[] = [];
    const a = runA.settings;
    const b = runB.settings;
    if (JSON.stringify([...a.prompts].sort()) !== JSON.stringify([...b.prompts].sort())) diffs.push("question wording");
    if (a.brand !== b.brand) diffs.push("focal brand");
    if (JSON.stringify([...a.competitors].sort()) !== JSON.stringify([...b.competitors].sort())) diffs.push("competitor set");
    if (JSON.stringify([...a.platforms].sort()) !== JSON.stringify([...b.platforms].sort())) diffs.push("platform selection");
    if (a.market !== b.market) diffs.push("market");
    if (a.language !== b.language) diffs.push("language");
    if (a.webSearch !== b.webSearch || a.webSearchCountryIsoCode !== b.webSearchCountryIsoCode) diffs.push("search settings");
    const modelsA = new Set(runA.results.map((r) => r.modelName).filter(Boolean));
    const modelsB = new Set(runB.results.map((r) => r.modelName).filter(Boolean));
    if (JSON.stringify([...modelsA].sort()) !== JSON.stringify([...modelsB].sort())) diffs.push("model used");
    return diffs;
  }, [runA, runB]);

  const brandComparison = useMemo(() => {
    if (!runA || !runB) return null;
    const names = [...new Set([runA.settings.brand, ...runA.settings.competitors, runB.settings.brand, ...runB.settings.competitors])];
    const mentionedAt = (run: TestRun, platform: string, prompt: string, name: string) => {
      const r = run.results.find((x) => x.platform === platform && x.prompt === prompt && x.status === "ok");
      return r ? r.mentionedBrands.includes(name) : false;
    };
    return names.map((name) => {
      let countA = 0;
      let countB = 0;
      for (const pair of matchedPairs) {
        if (mentionedAt(runA, pair.platform, pair.prompt, name)) countA++;
        if (mentionedAt(runB, pair.platform, pair.prompt, name)) countB++;
      }
      const total = matchedPairs.length;
      let change: "appeared" | "disappeared" | "stayed present" | "stayed absent" | null = null;
      if (total === 1) {
        if (countA === 0 && countB === 1) change = "appeared";
        else if (countA === 1 && countB === 0) change = "disappeared";
        else if (countA === 1 && countB === 1) change = "stayed present";
        else change = "stayed absent";
      }
      return { name, countA, countB, total, change };
    });
  }, [runA, runB, matchedPairs]);

  // Trend: runs that share the same question/brand/platform identity as the
  // most recent run in the selected mode, oldest first, starting with the
  // very first saved run for that identity.
  const trend = useMemo(() => {
    if (visibleHistory.length === 0) return [];
    const identity = settingsIdentity(visibleHistory[0].settings);
    return visibleHistory
      .filter((r) => settingsIdentity(r.settings) === identity)
      .slice()
      .reverse()
      .map((r) => {
        const { count, total } = focalBrandRate(r);
        return {
          date: formatDate(r.timestamp).split(",")[0],
          rate: total > 0 ? Math.round((count / total) * 100) : null,
          n: total,
          brand: r.settings.brand,
        };
      });
  }, [visibleHistory]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">History</h3>
          <p className="text-xs text-gray-500 mt-1">
            History is saved in this browser — not shared across devices, and not sent to any server (
            {history.filter((r) => r.mode === "live").length} live, {history.filter((r) => r.mode === "demo").length} demo
            run{history.filter((r) => r.mode === "demo").length === 1 ? "" : "s"} saved here).
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Comparing two runs matches the same prompt/platform pairs that returned usable answers in both runs, and
            shows the matched sample size.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-md border border-gray-200 overflow-hidden text-xs">
            <button
              onClick={() => setMode("live")}
              className={`px-2.5 py-1 ${mode === "live" ? "bg-indigo-600 text-white" : "text-gray-500"}`}
            >
              Live
            </button>
            <button
              onClick={() => setMode("demo")}
              className={`px-2.5 py-1 ${mode === "demo" ? "bg-indigo-600 text-white" : "text-gray-500"}`}
            >
              Demo
            </button>
          </div>
          {history.length > 0 && (
            <button onClick={clearHistory} className="text-xs text-red-500 hover:underline">
              Clear history
            </button>
          )}
        </div>
      </div>

      {visibleHistory.length === 0 ? (
        <p className="text-xs text-gray-400">No {mode} runs saved yet. Run a test above to start a history.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[480px] [&_th]:px-2 [&_td]:px-2 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0 [&_th:last-child]:pr-0 [&_td:last-child]:pr-0">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-100">
                  <th className="py-2 font-medium">Run</th>
                  <th className="py-2 font-medium">Saved test</th>
                  <th className="py-2 font-medium">Platforms</th>
                  <th className="py-2 font-medium text-right">Focal brand rate</th>
                  <th className="py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {visibleHistory.slice(0, 15).map((r) => {
                  const { count, total } = focalBrandRate(r);
                  return (
                    <tr key={r.id} className="border-b border-gray-50 last:border-0">
                      <td className="py-1.5 text-gray-700 whitespace-nowrap">{formatDate(r.timestamp)}</td>
                      <td className="py-1.5 text-gray-600">{r.savedTestName ?? "—"}</td>
                      <td className="py-1.5 text-gray-600">{r.settings.platforms.map((p) => PLATFORM_LABEL[p]).join(", ")}</td>
                      <td className="py-1.5 text-right text-gray-900">
                        {total > 0 ? `${count}/${total} · ${Math.round((count / total) * 100)}%` : "—"}
                      </td>
                      <td className="py-1.5 text-right">
                        <button
                          onClick={() => {
                            setRunBId(r.id);
                          }}
                          className="text-indigo-600 hover:underline"
                        >
                          Compare
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {trend.length >= 2 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-700 mb-2">
                Trend — {trend[0].brand}, runs with matching questions/brands/platforms
              </h4>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend} margin={{ left: 0, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} unit="%" domain={[0, 100]} />
                    <Tooltip formatter={(v, _n, p) => [`${v}% (n=${p.payload.n})`, "Mention rate"]} />
                    <Line type="monotone" dataKey="rate" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[11px] text-gray-400 mt-1">Sample size (n) shown in the tooltip — small samples swing easily.</p>
            </div>
          )}

          <div className="border-t border-gray-100 pt-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h4 className="text-xs font-semibold text-gray-700">Compare with previous run</h4>
              <button onClick={quickCompareLatest} className="text-xs text-indigo-600 hover:underline">
                Compare latest two →
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <select value={runAId} onChange={(e) => setRunAId(e.target.value)} className="text-xs border border-gray-200 rounded-md px-2 py-1.5 flex-1 min-w-[160px]">
                <option value="">Run A (earlier)</option>
                {visibleHistory.map((r) => (
                  <option key={r.id} value={r.id}>
                    {formatDate(r.timestamp)}
                  </option>
                ))}
              </select>
              <select value={runBId} onChange={(e) => setRunBId(e.target.value)} className="text-xs border border-gray-200 rounded-md px-2 py-1.5 flex-1 min-w-[160px]">
                <option value="">Run B (later)</option>
                {visibleHistory.map((r) => (
                  <option key={r.id} value={r.id}>
                    {formatDate(r.timestamp)}
                  </option>
                ))}
              </select>
            </div>

            {runA && runB && (
              <div className="space-y-3">
                {settingsDiffs.length > 0 && (
                  <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                    These runs differ in: {settingsDiffs.join(", ")}. The comparison below still uses only matching
                    prompt/platform pairs, but treat the result with that in mind.
                  </p>
                )}
                {matchedPairs.length === 0 ? (
                  <p className="text-xs text-gray-400">
                    Comparison unavailable — no prompt/platform pair succeeded in both runs.
                  </p>
                ) : (
                  <>
                    <table className="w-full text-xs [&_th]:px-2 [&_td]:px-2 [&_th:first-child]:pl-0 [&_td:first-child]:pl-0 [&_th:last-child]:pr-0 [&_td:last-child]:pr-0">
                      <thead>
                        <tr className="text-left text-gray-400 border-b border-gray-100">
                          <th className="py-1.5 font-medium">Brand</th>
                          <th className="py-1.5 font-medium text-right">{formatDate(runA.timestamp).split(",")[0]}</th>
                          <th className="py-1.5 font-medium text-right">{formatDate(runB.timestamp).split(",")[0]}</th>
                          <th className="py-1.5 font-medium text-right">Change</th>
                        </tr>
                      </thead>
                      <tbody>
                        {brandComparison?.map((row) => (
                          <tr key={row.name} className="border-b border-gray-50 last:border-0">
                            <td className="py-1.5 text-gray-700">{row.name}</td>
                            <td className="py-1.5 text-right text-gray-600">
                              {row.countA}/{row.total}
                            </td>
                            <td className="py-1.5 text-right text-gray-600">
                              {row.countB}/{row.total}
                            </td>
                            <td
                              className={`py-1.5 text-right font-medium ${
                                row.countB > row.countA ? "text-emerald-600" : row.countB < row.countA ? "text-red-500" : "text-gray-400"
                              }`}
                            >
                              {row.change
                                ? row.change
                                : `${row.countB > row.countA ? "▲" : row.countB < row.countA ? "▼" : "—"} ${Math.abs(row.countB - row.countA)}`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="text-[11px] text-gray-400">
                      Matched sample: {matchedPairs.length} prompt/platform pair{matchedPairs.length === 1 ? "" : "s"} that
                      succeeded in both runs. Original per-run counts can differ from this if other pairs failed in
                      only one of the two runs.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
