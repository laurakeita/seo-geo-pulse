import { fetchMentionExamples, type AiVisibilityPlatformFilter } from "@/lib/dataforseo";

const VALID_PLATFORMS: AiVisibilityPlatformFilter[] = ["chat_gpt", "google"];

export async function POST(req: Request) {
  const body = await req.json();
  const brand: string = body.brand;
  const competitors: string[] = Array.isArray(body.competitors) ? body.competitors : [];
  const platform: AiVisibilityPlatformFilter | undefined = VALID_PLATFORMS.includes(body.platform)
    ? body.platform
    : undefined;
  const locationCode: number | undefined = typeof body.locationCode === "number" ? body.locationCode : undefined;
  const languageCode: string | undefined = typeof body.languageCode === "string" ? body.languageCode : undefined;

  if (!brand) {
    return Response.json({ error: "brand is required" }, { status: 400 });
  }

  try {
    const examples = await fetchMentionExamples(brand, competitors, platform, locationCode, languageCode, 5);
    return Response.json({ examples });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "DataForSEO request failed" }, { status: 502 });
  }
}
