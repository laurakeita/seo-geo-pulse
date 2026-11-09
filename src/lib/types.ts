export type DataSource = "live" | "mock";

export interface TrendPoint {
  date: string; // YYYY-MM-DD
  clicks: number;
  impressions: number;
}

export interface KeywordRow {
  query: string;
  clicks: number;
  impressions: number;
  ctr: number; // 0-1
  position: number;
  positionChange: number; // negative = improved (moved up)
}

export interface PageRow {
  url: string;
  clicks: number;
  impressions: number;
  ctr: number; // 0-1
}

export interface OrganicPulseData {
  site: string;
  dateRange: string;
  source: DataSource;
  kpis: {
    impressions: number;
    clicks: number;
    avgPosition: number;
    avgCtr: number; // 0-1
    impressionsDelta: number; // 0-1, vs previous period
    clicksDelta: number;
    avgPositionDelta: number; // negative = improved
    avgCtrDelta: number;
  };
  trend: TrendPoint[];
  topQueries: KeywordRow[];
  topPages: PageRow[];
}

export interface OpportunityItem {
  title: string;
  insight: string;
  recommendation: string;
  impact: "high" | "medium" | "low";
}

export interface OpportunityReportData {
  brand: string;
  generatedOn: string;
  items: OpportunityItem[];
}

// ---------------------------------------------------------------------------
// Prompt Monitoring (DataForSEO LLM Responses API)

export type ResponsePlatform = "chat_gpt" | "claude" | "gemini" | "perplexity";

export interface Citation {
  title: string;
  url: string;
}

export interface PromptResponseResult {
  platform: ResponsePlatform;
  prompt: string;
  repeatIndex: number; // 0-based — which repeat of this (platform, prompt) pair this is, within one run
  status: "ok" | "empty" | "error";
  error?: string;
  modelName: string | null;
  webSearchUsed: boolean | null;
  responseText: string | null;
  mentionedBrands: string[];
  citations: Citation[];
}

// A saved test: a reusable setup a user can re-select and rerun. Persisted
// client-side (browser localStorage) — there's no backend database in this
// project, so this is the most honest "existing persistence" to reuse.
export interface SavedTest {
  id: string;
  name: string;
  prompts: string[];
  brand: string;
  competitors: string[];
  platforms: ResponsePlatform[];
  market: string; // free-text label describing the scenario, e.g. "Taiwan"
  language: string; // free-text label, e.g. "Traditional Chinese"
  webSearch: boolean;
  webSearchCountryIsoCode?: string;
  runsPerQuestion: number; // repeats sent per (platform, question) pair — 1 or 5
  createdAt: string; // ISO timestamp
}

export type TestRunSettings = Omit<SavedTest, "id" | "name" | "createdAt">;

// A completed or partial run, stored with everything needed to later compare
// it against another run: the exact settings used, per-result status, and
// which platform/prompt pairs actually produced usable text.
export interface TestRun {
  id: string;
  savedTestId: string | null;
  savedTestName: string | null;
  timestamp: string; // ISO
  mode: "live" | "demo"; // kept separate — a demo run is never compared against a live one
  settings: TestRunSettings;
  results: PromptResponseResult[];
}

// ---------------------------------------------------------------------------
// Brand Visibility Benchmark (DataForSEO LLM Mentions / Multi-Target Metrics
// + LLM Mentions Historical)

export type MentionsPlatform = "chat_gpt" | "google";

export interface BenchmarkBrandResult {
  brand: string;
  isYou: boolean;
  mentions: number | null; // null = coverage unavailable; 0 = measured zero
  mentionShare: number | null; // 0-1, share within the selected brand set
}

export interface BenchmarkResult {
  platform: MentionsPlatform | "all";
  market: string;
  language: string;
  brands: BenchmarkBrandResult[];
  citationDomains: Citation[]; // "Common citation domains in the dataset"
}

export interface BenchmarkMonthPoint {
  year: number;
  month: number;
  brands: { brand: string; mentions: number | null }[];
}

// "View example questions and answers" drill-down (DataForSEO Search
// Mentions API) — individual question/answer records from the dataset,
// distinct from the aggregate counts above.
export interface MentionExample {
  platform: string; // display name, e.g. "ChatGPT" / "Google AI Overview"
  question: string;
  answer: string;
  sources: Citation[];
}
