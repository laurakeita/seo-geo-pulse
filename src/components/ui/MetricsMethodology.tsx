"use client";

interface MethodologyRow {
  metric: string;
  category: "API value" | "Dashboard calculation" | "AI-derived" | "Demo data" | "Unavailable";
  detail: string;
}

const CATEGORY_STYLE: Record<MethodologyRow["category"], string> = {
  "API value": "border-emerald-200 text-emerald-700 bg-emerald-50",
  "Dashboard calculation": "border-indigo-200 text-indigo-700 bg-indigo-50",
  "AI-derived": "border-violet-200 text-violet-700 bg-violet-50",
  "Demo data": "border-gray-200 text-gray-500 bg-gray-50",
  Unavailable: "border-amber-200 text-amber-700 bg-amber-50",
};

const ORGANIC_ROWS: MethodologyRow[] = [
  { metric: "Impressions / Clicks / Avg. CTR (KPI cards)", category: "Demo data", detail: "Static demo dataset. Not computed from a live source in this prototype." },
  { metric: "Avg. position (KPI card)", category: "Demo data", detail: "A fixed demo value — not an average of the Top queries table below." },
  { metric: "Position (Top queries, live)", category: "API value", detail: "DataForSEO SERP API's rank_absolute for the organic result matching your domain." },
  { metric: "Position (Top queries, demo)", category: "Demo data", detail: "Static per-query demo value, shown until you fetch live rankings." },
  { metric: "Clicks / Impressions / CTR (per query & per page)", category: "Demo data", detail: "Sample clicks and impressions; CTR is calculated as clicks ÷ impressions (shown as \"—\" if impressions is 0). Traffic metrics use sample data to protect client confidentiality — this is not a live Search Console connection." },
  { metric: "Compare periods (Impressions / Clicks / CTR, query & page examples)", category: "Demo data", detail: "Impressions and clicks for the selected date range are summed from the demo traffic trend; query/page-level examples are a seeded, labeled-demo estimate (no real per-day breakdown exists per query/page in this prototype). CTR is total clicks ÷ total impressions for the period; CTR change is shown in percentage points, not a relative percent." },
];

const PROMPT_ROWS: MethodologyRow[] = [
  { metric: "Answer text", category: "API value", detail: "The LLM's verbatim answer, returned as-is by DataForSEO's LLM Responses API for the selected model." },
  { metric: "Model used / web search used", category: "API value", detail: "Read back from each response — not assumed from the request." },
  { metric: "Citations", category: "API value", detail: "The response's annotations array (title + URL), when the model's web search returned any." },
  { metric: "Prompt Mention Rate / Observed mention rate", category: "Dashboard calculation", detail: "Successfully analyzed responses that contain the brand/competitor name (case-insensitive, counted once per response) ÷ all successfully analyzed responses for that scope. A failed request is excluded from both sides, not counted as a non-mention. With Runs per question set above 1, each repeat sends the identical question and settings again; the rate is observed across those repeats, not predicted from one answer." },
  { metric: "Runs per question", category: "Dashboard calculation", detail: "1 or 5 repeats of the exact same question/settings per (platform, question) pair, to see answer-to-answer variance. 5 repeats is a small sample — useful for spotting variance, not a statistically robust estimate." },
  { metric: "Where competitors appeared", category: "Dashboard calculation", detail: "Filters to answers where a competitor name matched and the focal brand did not. Name matching only — not a judgment about whether the answer actually recommends anything." },
  { metric: "History / trend / Compare with previous run", category: "Dashboard calculation", detail: "Computed from your own saved runs, stored in this browser (localStorage), not a server database." },
];

const BENCHMARK_ROWS: MethodologyRow[] = [
  { metric: "Mentions (current snapshot)", category: "API value", detail: "DataForSEO LLM Mentions / Multi-Target Metrics API, unmodified count for the selected platform." },
  { metric: "Share of voice (current snapshot)", category: "Dashboard calculation", detail: "This brand's mentions ÷ combined mentions of every brand in the selected set, on the selected platform. Relative to the names you typed in, not total category volume." },
  { metric: "Unavailable vs. zero", category: "Dashboard calculation", detail: "\"Unavailable\" = the provider returned no entry at all for that name, or the combined mentions across the whole brand set was zero (no usable denominator). A measured 0 means the name was checked, had a valid denominator, and simply had no mentions." },
  { metric: "Top citation domains returned for this benchmark", category: "API value", detail: "DataForSEO LLM Mentions API's sources_domain field, top 8 by mentions. Scope: the whole comparison set in one call (every brand and competitor you've entered, combined) — not specific to any single brand." },
  { metric: "Historical trend / Compare periods", category: "API value", detail: "DataForSEO LLM Mentions Historical API, monthly aggregates per brand name, starting 2025-08-01. Share of voice per month is still a dashboard calculation from those raw counts." },
  { metric: "View example questions and answers", category: "API value", detail: "DataForSEO's Search Mentions API — individual question/answer/citation records, a different endpoint from the mentions counts above. Matches the benchmark's platform, market, language and brand set where that endpoint supports them; shows a clear empty state otherwise." },
];

function MethodologyTable({ rows }: { rows: MethodologyRow[] }) {
  return (
    <table className="w-full text-xs min-w-[520px]">
      <thead>
        <tr className="text-left text-gray-400 border-b border-gray-100">
          <th className="py-2 font-medium">Metric</th>
          <th className="py-2 font-medium">Category</th>
          <th className="py-2 font-medium">How it&apos;s calculated</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.metric} className="border-b border-gray-50 last:border-0 align-top">
            <td className="py-2 text-gray-800 whitespace-nowrap">{r.metric}</td>
            <td className="py-2">
              <span className={`text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap ${CATEGORY_STYLE[r.category]}`}>
                {r.category}
              </span>
            </td>
            <td className="py-2 text-gray-600">{r.detail}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type Scope = "organic" | "prompts" | "benchmark";

export default function MetricsMethodology({ scope }: { scope: Scope }) {
  const rows = scope === "organic" ? ORGANIC_ROWS : scope === "prompts" ? PROMPT_ROWS : BENCHMARK_ROWS;
  return (
    <details className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <summary className="text-sm font-semibold text-gray-900 px-4 py-3 cursor-pointer select-none">
        How these metrics are calculated
      </summary>
      <div className="px-4 pb-4 space-y-3 overflow-x-auto">
        <MethodologyTable rows={rows} />

        {scope === "prompts" && (
          <>
            <div className="text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-lg p-3">
              <p className="font-medium text-gray-800 mb-1">Example — Prompt Mention Rate</p>
              <p>
                Five requests were sent. Four returned usable answers, and two mentioned the brand, so the mention
                rate is <strong>2/4 (50%)</strong>. The one request that failed is excluded from the denominator
                entirely, rather than being treated as a response that didn&apos;t mention the brand.
              </p>
            </div>
            <div className="text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-lg p-3">
              <p className="font-medium text-gray-800 mb-1">Prompt Mention Rate vs. Share of Voice</p>
              <p>
                Prompt Mention Rate measures how often a brand appeared in your test responses. Share of Voice
                measures its share of mentions in the selected benchmark dataset and brand set.
              </p>
            </div>
            <p className="text-[11px] text-gray-400">
              Platform coverage for Prompt Monitoring: all four platforms — ChatGPT, Claude, Gemini and Perplexity —
              are supported by DataForSEO&apos;s LLM Responses API. Geo-targeting is an API-enforced parameter for
              ChatGPT, Claude and Perplexity only; Gemini&apos;s endpoint has no such parameter, so a market named in
              the question for Gemini only ever comes from the question text itself.
            </p>
          </>
        )}

        {scope === "benchmark" && (
          <>
            <div className="text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-lg p-3">
              <p className="font-medium text-gray-800 mb-1">Worked example — share of voice</p>
              <p>
                Brand A has 30 mentions and Brand B has 70. Brand A&rsquo;s share of voice is 30% within this
                comparison set (30 ÷ (30 + 70) = 30%; Brand B is 70%). Add or remove names above and the denominator
                changes with them — share of voice is always relative to the names you&rsquo;ve typed in, not total
                category volume.
              </p>
            </div>
            <p className="text-[11px] text-gray-400">
              Platform coverage: ChatGPT and Google AI Overview are the only platforms the Mentions / Multi-Target
              Metrics and Historical endpoints support — confirmed against DataForSEO&rsquo;s own documentation and
              live responses. ChatGPT&rsquo;s dataset specifically is scoped to the United States and English only.
              Gemini and Perplexity are not available on this endpoint at all — that gap is exactly why Prompt
              Monitoring (a different endpoint) is the primary tool for those platforms; see the case study for the
              full tradeoff.
            </p>
          </>
        )}
      </div>
    </details>
  );
}
