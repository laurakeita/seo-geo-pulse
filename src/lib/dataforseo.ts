// Server-only DataForSEO client. Never import this from a "use client" file —
// it reads DATAFORSEO_LOGIN/PASSWORD from process.env and must stay off the browser bundle.
//
// Endpoint paths must NOT have a trailing slash — DataForSEO returns a bare
// 40400 "Not Found" (no task created) if you add one.

import type { Citation, MentionExample, PromptResponseResult, ResponsePlatform } from "./types";

const BASE_URL = "https://api.dataforseo.com";

function authHeader(): string {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) {
    throw new Error("DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD not set in env");
  }
  return "Basic " + Buffer.from(`${login}:${password}`).toString("base64");
}

interface DataForSeoTask<T> {
  status_code: number;
  status_message: string;
  result: T[] | null;
}

async function postLive<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`DataForSEO HTTP ${res.status}`);
  }
  const json = await res.json();
  if (json.status_code && json.status_code !== 20000) {
    throw new Error(`DataForSEO error ${json.status_code}: ${json.status_message ?? "unknown"}`);
  }
  const task = json.tasks?.[0] as DataForSeoTask<unknown> | undefined;
  if (task && task.status_code !== 20000) {
    throw new Error(`DataForSEO task error ${task.status_code}: ${task.status_message}`);
  }
  return json as T;
}

// Reference/metadata endpoints (e.g. locations_and_languages) are GET, not
// POST — confirmed by testing both against this specific endpoint (POST
// returns task error 40502 "POST Data Is Empty").
async function getFree<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "GET",
    headers: { Authorization: authHeader() },
  });
  if (!res.ok) {
    throw new Error(`DataForSEO HTTP ${res.status}`);
  }
  const json = await res.json();
  if (json.status_code && json.status_code !== 20000) {
    throw new Error(`DataForSEO error ${json.status_code}: ${json.status_message ?? "unknown"}`);
  }
  return json as T;
}

interface AiMetricGroup {
  key: string;
  mentions: number;
  ai_search_volume: number;
}

interface AiVisibilityItem {
  key: string;
  platform?: AiMetricGroup[];
}

interface AiVisibilityResultEnvelope {
  items?: AiVisibilityItem[] | null;
  aggregated_metrics?: {
    platform?: AiMetricGroup[];
    sources_domain?: AiMetricGroup[];
  };
}

const PLATFORM_DISPLAY_NAMES: Record<string, string> = {
  google: "Google AI Overview",
  chat_gpt: "ChatGPT",
  gemini: "Gemini",
  perplexity: "Perplexity",
  claude: "Claude",
};

function displayPlatformName(key: string): string {
  return PLATFORM_DISPLAY_NAMES[key] ?? key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface AiVisibilityPlatformResult {
  platform: string;
  mentions: number; // raw count, straight from the API
  mentionRate: number; // 0-1, this target's share of mentions among all tracked targets on this platform
}

export interface AiVisibilityResult {
  byTarget: Record<string, AiVisibilityPlatformResult[]>; // key = target label (brand or competitor name)
  citations: { url: string; citedByPlatforms: string[] }[];
}

// The multi_target_metrics/live endpoint only supports these two platforms
// (confirmed against DataForSEO's own docs and live responses on 2026-11-06 —
// gemini/claude/perplexity are not available on this endpoint, despite being
// valid platform names elsewhere in DataForSEO's AI Optimization API). If the
// `platform` param is omitted, the API returns both combined.
export type AiVisibilityPlatformFilter = "chat_gpt" | "google";

// Free to query (confirmed cost: 0 live, 2026-11-08) — a reference list, not
// a billed task. Only the United States + English combination has both
// chat_gpt and google coverage; every other market/language pair here is
// google-only, including Taiwan + Traditional Chinese (verified: 2.5M+
// responses, google only). The UI uses this to keep the platform selector
// honest about what's actually available for the chosen market.
export interface MentionsLocation {
  locationCode: number;
  locationName: string;
  languages: { languageCode: string; languageName: string; platforms: AiVisibilityPlatformFilter[] }[];
}

export async function fetchMentionsLocationsAndLanguages(): Promise<MentionsLocation[]> {
  const json = await getFree<{
    tasks?: {
      result?: {
        location_code: number;
        location_name: string;
        available_languages?: { language_code: string; language_name: string; available_platforms?: string[] }[];
      }[];
    }[];
  }>("/v3/ai_optimization/llm_mentions/locations_and_languages");
  const result = json.tasks?.[0]?.result ?? [];
  return result.map((loc) => ({
    locationCode: loc.location_code,
    locationName: loc.location_name,
    languages: (loc.available_languages ?? []).map((l) => ({
      languageCode: l.language_code,
      languageName: l.language_name,
      platforms: (l.available_platforms ?? []).filter((p): p is AiVisibilityPlatformFilter => p === "chat_gpt" || p === "google"),
    })),
  }));
}

export async function fetchAiVisibility(
  brand: string,
  competitors: string[],
  platform?: AiVisibilityPlatformFilter,
  locationCode = 2840,
  languageCode = "en",
): Promise<AiVisibilityResult> {
  const targets = [brand, ...competitors].slice(0, 10).map((name) => ({
    key: name,
    target: [{ keyword: name }],
  }));

  const json = await postLive<{
    tasks?: { result?: AiVisibilityResultEnvelope[] }[];
  }>("/v3/ai_optimization/llm_mentions/multi_target_metrics/live", [
    {
      targets,
      location_code: locationCode,
      language_code: languageCode,
      limit: 100,
      ...(platform ? { platform } : {}),
    },
  ]);

  const result = json.tasks?.[0]?.result?.[0];
  const items = result?.items ?? [];

  const totalsByPlatform: Record<string, number> = {};
  for (const g of result?.aggregated_metrics?.platform ?? []) {
    totalsByPlatform[g.key] = g.mentions;
  }

  const byTarget: Record<string, AiVisibilityPlatformResult[]> = {};
  for (const item of items) {
    byTarget[item.key] = (item.platform ?? []).map((p) => ({
      platform: displayPlatformName(p.key),
      mentions: p.mentions,
      mentionRate: totalsByPlatform[p.key] ? p.mentions / totalsByPlatform[p.key] : 0,
    }));
  }

  const citations = (result?.aggregated_metrics?.sources_domain ?? [])
    .slice(0, 8)
    .map((d) => ({ url: d.key, citedByPlatforms: [] as string[] }));

  return { byTarget, citations };
}

// "View example questions and answers" drill-down — DataForSEO's Search
// Mentions API (distinct endpoint from multi_target_metrics above). Schema
// confirmed against DataForSEO's docs on 2026-11-09: POST
// /v3/ai_optimization/llm_mentions/search_mentions/live, target is up to 10
// {keyword|domain} entities, platform is "chat_gpt" | "google" | omitted
// (both), location_code/language_code same as the benchmark's. ChatGPT is
// constrained to United States + English on this endpoint too, same as
// multi_target_metrics — consistent with the UI already only ever offering
// chat_gpt when that market/language pair is selected.
interface SearchMentionSourceRaw {
  title?: string;
  url?: string;
  domain?: string;
}
interface SearchMentionItemRaw {
  platform?: string;
  question?: string;
  answer?: string;
  sources?: SearchMentionSourceRaw[] | null;
}

export async function fetchMentionExamples(
  brand: string,
  competitors: string[],
  platform?: AiVisibilityPlatformFilter,
  locationCode = 2840,
  languageCode = "en",
  limit = 5,
): Promise<MentionExample[]> {
  const target = [brand, ...competitors].filter(Boolean).slice(0, 10).map((name) => ({ keyword: name }));

  const json = await postLive<{
    tasks?: { result?: { items?: SearchMentionItemRaw[] }[] }[];
  }>("/v3/ai_optimization/llm_mentions/search_mentions/live", [
    {
      target,
      location_code: locationCode,
      language_code: languageCode,
      limit,
      ...(platform ? { platform } : {}),
    },
  ]);

  const items = json.tasks?.[0]?.result?.[0]?.items ?? [];
  return items.map((it) => ({
    platform: displayPlatformName(it.platform ?? ""),
    question: it.question ?? "",
    answer: it.answer ?? "",
    sources: (it.sources ?? [])
      .slice(0, 5)
      .map((s) => ({ title: s.title || s.domain || s.url || "source", url: s.url ?? "" }))
      .filter((s) => s.url),
  }));
}

export interface KeywordVolumeResult {
  keyword: string;
  aiSearchVolume: number | null;
}

export async function fetchAiKeywordVolume(
  keywords: string[],
  locationCode = 2840,
  languageCode = "en",
): Promise<KeywordVolumeResult[]> {
  if (keywords.length === 0) return [];

  const json = await postLive<{
    tasks?: { result?: { items?: { keyword: string; ai_search_volume?: number }[] }[] }[];
  }>("/v3/ai_optimization/ai_keyword_data/keywords_search_volume/live", [
    { keywords: keywords.slice(0, 1000), location_code: locationCode, language_code: languageCode },
  ]);

  const items = json.tasks?.[0]?.result?.[0]?.items ?? [];
  return items.map((it) => ({
    keyword: it.keyword,
    aiSearchVolume: typeof it.ai_search_volume === "number" ? it.ai_search_volume : null,
  }));
}

export interface OrganicPositionResult {
  keyword: string;
  position: number | null;
  // "found" = domain matched an organic result; "not_found" = request succeeded
  // but the domain isn't in the result set; "error" = the request itself failed.
  status: "found" | "not_found" | "error";
  error?: string;
}

interface OrganicItem {
  type: string;
  rank_absolute?: number;
  domain?: string;
  // Google now serves organic results through a "google.com/goto?url=..." click
  // tracker, so `domain` is always "google.com" — confirmed live on 2026-11-06,
  // reproduced for both a navigational query and a commercial one. The real
  // destination domain only survives in `breadcrumb` (e.g.
  // "https://www.paulaschoice.com › ingredient-spotlight"), so extract from
  // there and fall back to `domain` if a result ever lacks a breadcrumb.
  breadcrumb?: string;
}

function extractDomain(item: OrganicItem): string | undefined {
  const fromBreadcrumb = item.breadcrumb?.match(/^https?:\/\/([^/\s›]+)/)?.[1];
  const raw = fromBreadcrumb ?? item.domain;
  return raw?.replace(/^www\./, "");
}

export async function fetchOrganicPositions(
  domain: string,
  keywords: string[],
  locationCode = 2840,
  languageCode = "en",
): Promise<OrganicPositionResult[]> {
  const cleanDomain = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");

  const results = await Promise.all(
    keywords.map(async (keyword) => {
      try {
        const json = await postLive<{
          tasks?: { result?: { items?: OrganicItem[] | null }[] }[];
        }>("/v3/serp/google/organic/live/advanced", [
          { keyword, location_code: locationCode, language_code: languageCode, depth: 30 },
        ]);
        const items = json.tasks?.[0]?.result?.[0]?.items ?? [];
        const match = items.find((it) => it.type === "organic" && extractDomain(it)?.includes(cleanDomain));
        if (match) {
          return { keyword, position: match.rank_absolute ?? null, status: "found" as const };
        }
        return { keyword, position: null, status: "not_found" as const };
      } catch (err) {
        return {
          keyword,
          position: null,
          status: "error" as const,
          error: err instanceof Error ? err.message : "DataForSEO request failed",
        };
      }
    }),
  );
  return results;
}

// ---------------------------------------------------------------------------
// Prompt-based competitor monitoring (LLM Responses API)
//
// Each platform is a separate DataForSEO endpoint with its own request shape —
// confirmed live against /v3/ai_optimization/<platform>/llm_responses/models
// on 2026-11-07. Gemini's endpoint has no geo-targeting parameter (no
// web_search_country_iso_code field in its docs); ChatGPT, Claude and
// Perplexity all support one. Perplexity's /models response also has no
// task_post_supported flag — it's live-only, no async task queue.

const RESPONSE_PLATFORM_PATH: Record<ResponsePlatform, string> = {
  chat_gpt: "/v3/ai_optimization/chat_gpt/llm_responses/live",
  claude: "/v3/ai_optimization/claude/llm_responses/live",
  gemini: "/v3/ai_optimization/gemini/llm_responses/live",
  perplexity: "/v3/ai_optimization/perplexity/llm_responses/live",
};

// Cheapest non-reasoning (or lowest-tier) model per platform, chosen to keep a
// portfolio demo affordable. The model actually used is always read back from
// the response and shown in the UI, never assumed.
const RESPONSE_PLATFORM_DEFAULT_MODEL: Record<ResponsePlatform, string> = {
  chat_gpt: "gpt-4.1-mini",
  claude: "claude-haiku-4-5",
  gemini: "gemini-2.5-flash-lite",
  perplexity: "sonar",
};

// Whether this platform's endpoint accepts web_search_country_iso_code at all
// — i.e. whether "geo" here means an API-enforced setting, as opposed to just
// a scenario described in the prompt text itself.
export const RESPONSE_PLATFORM_SUPPORTS_GEO_PARAM: Record<ResponsePlatform, boolean> = {
  chat_gpt: true,
  claude: true,
  perplexity: true,
  gemini: false,
};

export const RESPONSE_PLATFORMS: ResponsePlatform[] = ["chat_gpt", "claude", "gemini", "perplexity"];

interface LlmResponseAnnotation {
  title?: string;
  url?: string;
}

interface LlmResponseSection {
  type?: string;
  text?: string;
  annotations?: LlmResponseAnnotation[] | null;
}

interface LlmResponseItem {
  type?: string; // 'message' | 'reasoning'
  sections?: LlmResponseSection[] | null;
}

interface LlmResponseResult {
  model_name?: string;
  web_search?: boolean;
  items?: LlmResponseItem[] | null;
}

function extractResponseTextAndCitations(result: LlmResponseResult | undefined): { text: string; citations: Citation[] } {
  const items = result?.items ?? [];
  const textParts: string[] = [];
  const citations: Citation[] = [];
  const seenUrls = new Set<string>();
  for (const item of items) {
    if (item.type !== "message") continue;
    for (const section of item.sections ?? []) {
      if (section.type !== "text") continue;
      if (section.text) textParts.push(section.text);
      for (const ann of section.annotations ?? []) {
        if (ann.url && !seenUrls.has(ann.url)) {
          seenUrls.add(ann.url);
          citations.push({ title: ann.title || ann.url, url: ann.url });
        }
      }
    }
  }
  return { text: textParts.join("\n\n"), citations };
}

// Case-insensitive substring match; counts each name once per response even
// if it appears multiple times, per the mention-rate definition this feeds.
export function detectBrandMentions(text: string, names: string[]): string[] {
  const lower = text.toLowerCase();
  return names.filter((name) => name.trim() && lower.includes(name.trim().toLowerCase()));
}

export interface PromptMonitorRequest {
  brand: string;
  competitors: string[];
  prompts: string[];
  platforms: ResponsePlatform[];
  webSearch: boolean;
  webSearchCountryIsoCode?: string;
  runsPerQuestion: number; // repeats per (platform, prompt) pair — reuses the same wording/settings each time
}

export async function fetchPromptMonitoring(req: PromptMonitorRequest): Promise<PromptResponseResult[]> {
  const names = [req.brand, ...req.competitors].filter(Boolean);
  const calls: Promise<PromptResponseResult>[] = [];
  const repeats = Math.max(1, req.runsPerQuestion);

  for (const platform of req.platforms) {
    for (const prompt of req.prompts) {
      for (let repeatIndex = 0; repeatIndex < repeats; repeatIndex++) {
        calls.push(
          (async (): Promise<PromptResponseResult> => {
            try {
              const body: Record<string, unknown> = {
                user_prompt: prompt,
                model_name: RESPONSE_PLATFORM_DEFAULT_MODEL[platform],
              };
              if (req.webSearch) {
                body.web_search = true;
                if (req.webSearchCountryIsoCode && RESPONSE_PLATFORM_SUPPORTS_GEO_PARAM[platform]) {
                  body.web_search_country_iso_code = req.webSearchCountryIsoCode;
                }
              }
              const json = await postLive<{ tasks?: { result?: LlmResponseResult[] }[] }>(
                RESPONSE_PLATFORM_PATH[platform],
                [body],
              );
              const result = json.tasks?.[0]?.result?.[0];
              const { text, citations } = extractResponseTextAndCitations(result);
              if (!text) {
                return {
                  platform,
                  prompt,
                  repeatIndex,
                  status: "empty",
                  modelName: result?.model_name ?? RESPONSE_PLATFORM_DEFAULT_MODEL[platform],
                  webSearchUsed: result?.web_search ?? null,
                  responseText: null,
                  mentionedBrands: [],
                  citations: [],
                };
              }
              return {
                platform,
                prompt,
                repeatIndex,
                status: "ok",
                modelName: result?.model_name ?? RESPONSE_PLATFORM_DEFAULT_MODEL[platform],
                webSearchUsed: result?.web_search ?? null,
                responseText: text,
                mentionedBrands: detectBrandMentions(text, names),
                citations,
              };
            } catch (err) {
              return {
                platform,
                prompt,
                repeatIndex,
                status: "error",
                error: err instanceof Error ? err.message : "DataForSEO request failed",
                modelName: null,
                webSearchUsed: null,
                responseText: null,
                mentionedBrands: [],
                citations: [],
              };
            }
          })(),
        );
      }
    }
  }

  return Promise.all(calls);
}

// ---------------------------------------------------------------------------
// Brand Visibility Benchmark — historical trend
// (DataForSEO LLM Mentions Historical API)
//
// This is a *different* endpoint from multi_target_metrics/live: its `target`
// array is filter criteria for ONE search (include/exclude rules), not a list
// of comparable named targets. To compare brands over time, this calls it
// once per brand name and combines the monthly results client-side — same
// principle as the live share-of-voice calculation, just repeated per month.
// Confirmed via docs on 2026-11-08: date_from cannot be earlier than
// 2025-08-01; platform accepts only "chat_gpt" or "google" (same two-platform
// limit as the live endpoint); chat_gpt coverage is US/English only.

interface MentionsHistoricalMonthRaw {
  year: number;
  month: number;
  metrics?: { mentions?: number; ai_search_volume?: number };
}

export interface BrandMonthlyMentions {
  brand: string;
  months: { year: number; month: number; mentions: number }[];
}

export async function fetchMentionsHistoricalForBrand(
  brand: string,
  dateFrom: string,
  dateTo: string,
  platform?: AiVisibilityPlatformFilter,
  locationCode = 2840,
  languageCode = "en",
): Promise<BrandMonthlyMentions> {
  const json = await postLive<{
    tasks?: { result?: { items?: MentionsHistoricalMonthRaw[] | null }[] }[];
  }>("/v3/ai_optimization/llm_mentions/historical/live", [
    {
      target: [{ keyword: brand, search_filter: "include" }],
      date_from: dateFrom,
      date_to: dateTo,
      location_code: locationCode,
      language_code: languageCode,
      ...(platform ? { platform } : {}),
    },
  ]);
  const items = json.tasks?.[0]?.result?.[0]?.items ?? [];
  return {
    brand,
    months: items.map((it) => ({
      year: it.year,
      month: it.month,
      mentions: it.metrics?.mentions ?? 0,
    })),
  };
}

export async function fetchMentionsHistorical(
  brands: string[],
  dateFrom: string,
  dateTo: string,
  platform?: AiVisibilityPlatformFilter,
  locationCode = 2840,
  languageCode = "en",
): Promise<BrandMonthlyMentions[]> {
  return Promise.all(
    brands
      .slice(0, 10)
      .map((brand) => fetchMentionsHistoricalForBrand(brand, dateFrom, dateTo, platform, locationCode, languageCode)),
  );
}
