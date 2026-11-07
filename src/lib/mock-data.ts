import type {
  KeywordRow,
  OpportunityReportData,
  OrganicPulseData,
  PageRow,
  TrendPoint,
} from "./types";

/**
 * Demo-only data for a fictional DTC skincare brand. Numbers are synthetic —
 * this is a sales/portfolio asset, not a real client's data. See the
 * seo-geo-pulse plan for why: no Semrush/WorkDuo API access on trial tiers,
 * so live integration is deferred until a client signs and funds it.
 */
const DEMO_BRAND = "GlowLab Skincare";
const DEMO_SITE = "glowlabskincare.com";

function buildTrend(days: number): TrendPoint[] {
  const start = new Date("2026-07-01");
  const points: TrendPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const wave = Math.sin(i / 6) * 180 + Math.sin(i / 30) * 260;
    const growth = i * 9;
    const clicks = Math.round(1200 + wave + growth);
    const impressions = Math.round(clicks * (14 + Math.sin(i / 10) * 1.5));
    points.push({
      date: d.toISOString().slice(0, 10),
      clicks,
      impressions,
    });
  }
  return points;
}

const trend = buildTrend(84); // 12 weeks

const topQueries: KeywordRow[] = [
  { query: "niacinamide serum", clicks: 4820, impressions: 61200, ctr: 0.079, position: 3.2, positionChange: -0.6 },
  { query: "best serum for hyperpigmentation", clicks: 3110, impressions: 58900, ctr: 0.053, position: 5.8, positionChange: -1.4 },
  { query: "glowlab skincare review", clicks: 2790, impressions: 9800, ctr: 0.285, position: 1.4, positionChange: 0.1 },
  { query: "vitamin c serum sensitive skin", clicks: 2205, impressions: 44300, ctr: 0.050, position: 7.1, positionChange: -2.1 },
  { query: "korean skincare routine order", clicks: 1980, impressions: 71200, ctr: 0.028, position: 11.3, positionChange: -3.5 },
  { query: "barrier repair moisturizer", clicks: 1640, impressions: 26100, ctr: 0.063, position: 6.4, positionChange: 0.8 },
  { query: "glowlab vs the ordinary", clicks: 1390, impressions: 5200, ctr: 0.267, position: 2.0, positionChange: -0.3 },
  { query: "retinol alternative pregnancy safe", clicks: 980, impressions: 33400, ctr: 0.029, position: 14.6, positionChange: -4.2 },
];

const topPages: PageRow[] = [
  { url: "/products/niacinamide-10-serum", clicks: 6420, impressions: 88100, ctr: 0.073 },
  { url: "/blog/hyperpigmentation-guide", clicks: 4310, impressions: 96700, ctr: 0.045 },
  { url: "/reviews", clicks: 3980, impressions: 15200, ctr: 0.262 },
  { url: "/products/vitamin-c-brightening-drops", clicks: 2870, impressions: 60300, ctr: 0.048 },
  { url: "/blog/skincare-routine-order", clicks: 2140, impressions: 79800, ctr: 0.027 },
];

const last14 = trend.slice(-14);
const prev14 = trend.slice(-28, -14);
const sum = (arr: TrendPoint[], key: "clicks" | "impressions") => arr.reduce((s, p) => s + p[key], 0);
const clicksNow = sum(last14, "clicks");
const clicksPrev = sum(prev14, "clicks");
const impressionsNow = sum(last14, "impressions");
const impressionsPrev = sum(prev14, "impressions");

export const organicPulseMock: OrganicPulseData = {
  site: DEMO_SITE,
  dateRange: "Last 12 weeks (demo data)",
  source: "mock",
  kpis: {
    impressions: impressionsNow,
    clicks: clicksNow,
    avgPosition: 6.8,
    avgCtr: clicksNow / impressionsNow,
    impressionsDelta: (impressionsNow - impressionsPrev) / impressionsPrev,
    clicksDelta: (clicksNow - clicksPrev) / clicksPrev,
    avgPositionDelta: -0.9,
    avgCtrDelta: 0.006,
  },
  trend,
  topQueries,
  topPages,
};

// Demo brand/competitor set reused by Prompt Monitoring and Brand Visibility
// Benchmark's demo (sample-response) modes.
export const DEMO_COMPETITOR_SET = ["The Ordinary", "Paula's Choice", "CeraVe", "Some By Mi"];

export const opportunityReportMock: OpportunityReportData = {
  brand: DEMO_BRAND,
  generatedOn: "2026-09-21",
  items: [
    {
      title: "“korean skincare routine order” is slipping in rank",
      insight: "Average position dropped from #8 to #11 over the last 12 weeks — highest impressions (71K) of any tracked query, but only a 2.8% CTR.",
      recommendation: "Update /blog/skincare-routine-order with deeper content and structured data, and add concrete product-sequencing guidance.",
      impact: "high",
    },
    {
      title: "Brand mention rate in AI search lags competitors",
      insight: "GlowLab averages a 32% mention rate across ChatGPT/Gemini/Perplexity, behind The Ordinary (71%) and CeraVe (66%).",
      recommendation: "Add structured ingredient pages that AI models can cite, and pursue third-party reviews to build presence on sources like Reddit and Byrdie.",
      impact: "high",
    },
    {
      title: "Brand-owned content is rarely cited as an AI source",
      insight: "Of the 4 tracked citation sources, only 1 is a brand-owned page — the rest are third-party (Reddit, Byrdie, YouTube).",
      recommendation: "Rewrite high-traffic blog posts into a format AI summaries can cite more easily (clear conclusions, numbered steps, FAQ sections).",
      impact: "medium",
    },
    {
      title: "“/reviews” page has standout CTR — worth scaling",
      insight: "26.2% CTR, well above site average, showing strong intent-to-conversion for review-style content.",
      recommendation: "Add more per-product review roundup pages, and link to this page from other high-traffic pages.",
      impact: "medium",
    },
    {
      title: "“retinol alternative pregnancy safe” is growing but underconverting",
      insight: "33K impressions at position 14.6 — a high-potential long-tail term the current page content doesn't yet support.",
      recommendation: "Create a dedicated page for this search intent, with medical claims reviewed for compliance.",
      impact: "low",
    },
  ],
};
