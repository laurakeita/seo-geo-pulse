import { fetchAiKeywordVolume, fetchAiVisibility, type AiVisibilityPlatformFilter } from "@/lib/dataforseo";

const VALID_PLATFORMS: AiVisibilityPlatformFilter[] = ["chat_gpt", "google"];

export async function POST(req: Request) {
  const body = await req.json();
  const brand: string = body.brand;
  const competitors: string[] = Array.isArray(body.competitors) ? body.competitors : [];
  const queryTexts: string[] = Array.isArray(body.queryTexts) ? body.queryTexts : [];
  const platform: AiVisibilityPlatformFilter | undefined = VALID_PLATFORMS.includes(body.platform)
    ? body.platform
    : undefined;

  if (!brand) {
    return Response.json({ error: "brand is required" }, { status: 400 });
  }

  try {
    const [visibility, volumes] = await Promise.all([
      fetchAiVisibility(brand, competitors, platform),
      fetchAiKeywordVolume(queryTexts),
    ]);

    return Response.json({
      platforms: visibility.byTarget[brand] ?? [],
      // Per-target, per-platform breakdown (not just the average) so the
      // dashboard can show one platform at a time or compare them side by side.
      competitors: Object.entries(visibility.byTarget).map(([name, platforms]) => ({
        brand: name,
        platforms,
        mentionRate: platforms.length ? platforms.reduce((s, p) => s + p.mentionRate, 0) / platforms.length : 0,
        isYou: name === brand,
      })),
      citations: visibility.citations,
      keywordVolumes: volumes,
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "DataForSEO request failed" }, { status: 502 });
  }
}
