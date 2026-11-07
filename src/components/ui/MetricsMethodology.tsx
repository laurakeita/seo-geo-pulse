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
  { metric: "Clicks / Impressions / CTR (per query & per page)", category: "Unavailable", detail: "Requires a connected Google Search Console account — not wired up in this prototype." },
];

const AI_ROWS: MethodologyRow[] = [
  { metric: "Prompt response text (Prompt Monitoring)", category: "API value", detail: "The LLM's verbatim answer, returned as-is by DataForSEO's LLM Responses API for the selected model." },
  { metric: "Prompt Mention Rate (Prompt Monitoring)", category: "Dashboard calculation", detail: "Per platform: successfully analyzed responses that contain the brand/competitor name (case-insensitive, counted once per response) ÷ all successfully analyzed responses for that platform. A failed request is excluded from both sides, not counted as a non-mention." },
  { metric: "Model used / web search used (Prompt Monitoring)", category: "API value", detail: "Read back from each response — not assumed from the request." },
  { metric: "Citations (Prompt Monitoring)", category: "API value", detail: "The response's annotations array (title + URL), when the model's web search returned any." },
  { metric: "Platform mention rate (Visibility, live)", category: "Dashboard calculation", detail: "This target's mentions on that platform ÷ combined mentions of every brand/competitor name entered, on that platform. From DataForSEO's LLM Mentions API." },
  { metric: "Platform mention rate (Visibility, demo)", category: "Demo data", detail: "Deterministic simulated jitter around a baseline rate, with a small boost per tracked query." },
  { metric: "AI search volume (Queries panel)", category: "API value", detail: "DataForSEO AI Keyword Data API, unmodified." },
  { metric: "Share of voice — single platform (live)", category: "API value", detail: "Same mention-share formula as above, requested pre-filtered to one platform via DataForSEO's platform parameter." },
  { metric: "Share of voice — combined (live or demo)", category: "Dashboard calculation", detail: "Simple average of the ChatGPT and Google AI Overview shares, weighted equally." },
  { metric: "Sentiment", category: "Demo data", detail: "Deterministic placeholder, not model-generated — DataForSEO's Mentions API has no sentiment field." },
  { metric: "Citation sources (live)", category: "API value", detail: "DataForSEO LLM Mentions API's sources_domain, top 8 by mentions." },
  { metric: "Citation sources (demo)", category: "Demo data", detail: "Static mock list." },
  { metric: "Opportunity Report / auto-insights", category: "Unavailable", detail: "Not built this round — recommendations weren't traceable to data. Tab hidden, not removed." },
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

export default function MetricsMethodology({ scope }: { scope: "organic" | "ai" }) {
  return (
    <details className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <summary className="text-sm font-semibold text-gray-900 px-4 py-3 cursor-pointer select-none">
        How these metrics are calculated
      </summary>
      <div className="px-4 pb-4 space-y-3 overflow-x-auto">
        <MethodologyTable rows={scope === "organic" ? ORGANIC_ROWS : AI_ROWS} />

        {scope === "ai" && (
          <>
            <div className="text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-lg p-3">
              <p className="font-medium text-gray-800 mb-1">Example — Prompt Mention Rate</p>
              <p>
                Suppose 5 prompts are sent to ChatGPT and 4 come back with usable text (1 request fails). If the
                brand name appears in 2 of those 4 responses, the dashboard shows <strong>2/4 responses · 50%</strong> for
                ChatGPT — not 2/5. The failed request is excluded from the denominator entirely, rather than being
                treated as a response that didn&apos;t mention the brand. This example illustrates the formula, not a
                verified live run — live Prompt Monitoring calls require DataForSEO account balance, and this round&apos;s
                verification was blocked by a negative balance (see the internal handoff note).
              </p>
            </div>
            <p className="text-[11px] text-gray-400">
              Platform coverage for Prompt Monitoring: all four platforms — ChatGPT, Claude, Gemini and Perplexity —
              are genuinely supported by DataForSEO&apos;s LLM Responses API, confirmed against each platform&apos;s{" "}
              <code>/models</code> endpoint (free to query, unlike a live run). Geo-targeting is an API-enforced
              parameter for ChatGPT, Claude and Perplexity only; Gemini&apos;s endpoint has no such parameter, so a
              Taiwan scenario for Gemini only ever comes from the prompt text itself.
            </p>
            <div className="text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-lg p-3">
              <p className="font-medium text-gray-800 mb-1">Worked example — share of voice</p>
              <p>
                Targets: GlowLab Skincare + The Ordinary. On ChatGPT, DataForSEO reports 440,150 total mentions
                across both names; GlowLab accounts for 9 of them → 9 ÷ 440,150 ≈ 0%. The Ordinary accounts for
                440,141 → ≈100%. That&rsquo;s expected: GlowLab is a fictional demo brand with no real mentions, while
                The Ordinary is a real, heavily-discussed one. Add or remove names in the settings bar above and the
                denominator changes with them — share of voice is always relative to the names you&rsquo;ve typed in,
                not total category volume.
              </p>
            </div>
            <p className="text-[11px] text-gray-400">
              Platform coverage for this Share of Voice formula specifically: ChatGPT and Google AI Overview are the
              only platforms the Mentions / Multi-Target Metrics endpoint supports — confirmed against DataForSEO&rsquo;s
              own documentation and live responses. That&rsquo;s a different endpoint from Prompt Monitoring above, which
              does cover Gemini and Perplexity; see the case study for why both were evaluated and why Prompt
              Monitoring became the primary live feature. Gemini/Perplexity in the Queries and Visibility sections
              elsewhere on this tab remain demo-only illustrations, unrelated to either live endpoint.
            </p>
          </>
        )}
      </div>
    </details>
  );
}
