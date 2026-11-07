import { fetchPromptMonitoring, RESPONSE_PLATFORMS } from "@/lib/dataforseo";
import type { ResponsePlatform } from "@/lib/types";

const MAX_PROMPTS = 5;
const MAX_COMPETITORS = 8;

export async function POST(req: Request) {
  const body = await req.json();
  const brand: string = body.brand;
  const competitors: string[] = Array.isArray(body.competitors) ? body.competitors.slice(0, MAX_COMPETITORS) : [];
  const prompts: string[] = Array.isArray(body.prompts)
    ? body.prompts.filter((p: unknown) => typeof p === "string" && p.trim()).slice(0, MAX_PROMPTS)
    : [];
  const platforms: ResponsePlatform[] = Array.isArray(body.platforms)
    ? body.platforms.filter((p: unknown): p is ResponsePlatform => RESPONSE_PLATFORMS.includes(p as ResponsePlatform))
    : [];
  const webSearch: boolean = body.webSearch === true;
  const webSearchCountryIsoCode: string | undefined =
    typeof body.webSearchCountryIsoCode === "string" && body.webSearchCountryIsoCode.trim()
      ? body.webSearchCountryIsoCode.trim()
      : undefined;

  if (!brand) {
    return Response.json({ error: "brand is required" }, { status: 400 });
  }
  if (prompts.length === 0) {
    return Response.json({ error: "at least one prompt is required" }, { status: 400 });
  }
  if (platforms.length === 0) {
    return Response.json({ error: "at least one platform is required" }, { status: 400 });
  }

  try {
    const results = await fetchPromptMonitoring({
      brand,
      competitors,
      prompts,
      platforms,
      webSearch,
      webSearchCountryIsoCode,
    });
    return Response.json({ results });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "DataForSEO request failed" }, { status: 502 });
  }
}
