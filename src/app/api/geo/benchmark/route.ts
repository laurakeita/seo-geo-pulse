import { fetchAiVisibility, type AiVisibilityPlatformFilter } from "@/lib/dataforseo";
import type { BenchmarkResult } from "@/lib/types";

const VALID_PLATFORMS: AiVisibilityPlatformFilter[] = ["chat_gpt", "google"];
const PLATFORM_DISPLAY: Record<AiVisibilityPlatformFilter, string> = { chat_gpt: "ChatGPT", google: "Google AI Overview" };

export async function POST(req: Request) {
  const body = await req.json();
  const brand: string = body.brand;
  const competitors: string[] = Array.isArray(body.competitors) ? body.competitors : [];
  const platform: AiVisibilityPlatformFilter | undefined = VALID_PLATFORMS.includes(body.platform)
    ? body.platform
    : undefined;
  const locationCode: number | undefined = typeof body.locationCode === "number" ? body.locationCode : undefined;
  const languageCode: string | undefined = typeof body.languageCode === "string" ? body.languageCode : undefined;
  const locationName: string = typeof body.locationName === "string" ? body.locationName : "United States";
  const languageName: string = typeof body.languageName === "string" ? body.languageName : "English";

  if (!brand) {
    return Response.json({ error: "brand is required" }, { status: 400 });
  }

  try {
    const visibility = await fetchAiVisibility(brand, competitors, platform, locationCode, languageCode);
    const names = [brand, ...competitors].filter(Boolean);

    // Raw mention count + share of voice within the selected brand set, for
    // the selected platform scope (or summed/averaged across platforms if
    // "all" platforms was requested).
    const targetStats = (name: string): { mentions: number | null; rate: number | null } => {
      const platforms = visibility.byTarget[name];
      if (!platforms) return { mentions: null, rate: null }; // target missing entirely = coverage unavailable
      if (platform) {
        const match = platforms.find((p) => p.platform === PLATFORM_DISPLAY[platform]);
        return match ? { mentions: match.mentions, rate: match.mentionRate } : { mentions: null, rate: null };
      }
      if (platforms.length === 0) return { mentions: null, rate: null };
      const mentions = platforms.reduce((s, p) => s + p.mentions, 0);
      const rate = platforms.reduce((s, p) => s + p.mentionRate, 0) / platforms.length;
      return { mentions, rate };
    };

    const stats = names.map((name) => ({ name, ...targetStats(name) }));
    const totalRate = stats.reduce((s, r) => s + (r.rate ?? 0), 0);

    const brands = stats.map((r) => ({
      brand: r.name,
      isYou: r.name === brand,
      mentions: r.mentions,
      // mentionRate is already "share of combined mentions" from the API;
      // this re-normalizes it against the targets that have coverage here so
      // the displayed percentages sum to ~100% within the selected set.
      mentionShare: r.rate === null ? null : totalRate > 0 ? r.rate / totalRate : 0,
    }));

    const result: BenchmarkResult = {
      platform: platform ?? "all",
      market: locationName,
      language: languageName,
      brands,
      citationDomains: visibility.citations.map((c) => ({ title: c.url, url: `https://${c.url}` })),
    };

    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "DataForSEO request failed" }, { status: 502 });
  }
}
