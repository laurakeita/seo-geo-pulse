export type DataSource = "live" | "mock";

export type Sentiment = "positive" | "neutral" | "negative";

export interface TrackedQuery {
  id: string;
  text: string;
  topic: string;
  region: string;
  platforms: string[];
  tags: string[];
  aiSearchVolume?: number | null; // only populated in live (DataForSEO) mode
}

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

export interface PlatformMention {
  platform: string;
  mentionRate: number; // 0-1, share of tracked prompts where brand is mentioned
  sentiment: Sentiment;
}

export interface CompetitorMention {
  brand: string;
  mentionRate: number; // 0-1
  isYou: boolean;
}

export interface CitationSource {
  url: string;
  citedByPlatforms: string[];
  note: string;
}

export interface AIVisibilityData {
  brand: string;
  period: string;
  source: DataSource;
  platforms: PlatformMention[];
  competitors: CompetitorMention[];
  citations: CitationSource[];
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

// Prompt-based competitor monitoring (DataForSEO LLM Responses API).
export type ResponsePlatform = "chat_gpt" | "claude" | "gemini" | "perplexity";

export interface Citation {
  title: string;
  url: string;
}

export interface PromptResponseResult {
  platform: ResponsePlatform;
  prompt: string;
  status: "ok" | "empty" | "error";
  error?: string;
  modelName: string | null;
  webSearchUsed: boolean | null;
  responseText: string | null;
  mentionedBrands: string[];
  citations: Citation[];
}
