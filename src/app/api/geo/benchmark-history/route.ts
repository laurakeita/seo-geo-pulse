import { fetchMentionsHistorical, type AiVisibilityPlatformFilter } from "@/lib/dataforseo";
import type { BenchmarkMonthPoint } from "@/lib/types";

const VALID_PLATFORMS: AiVisibilityPlatformFilter[] = ["chat_gpt", "google"];
const EARLIEST_DATE = "2025-08-01"; // DataForSEO's documented minimum for this endpoint

export async function POST(req: Request) {
  const body = await req.json();
  const brand: string = body.brand;
  const competitors: string[] = Array.isArray(body.competitors) ? body.competitors : [];
  const dateFrom: string = typeof body.dateFrom === "string" ? body.dateFrom : EARLIEST_DATE;
  const dateTo: string = typeof body.dateTo === "string" ? body.dateTo : new Date().toISOString().slice(0, 10);
  const platform: AiVisibilityPlatformFilter | undefined = VALID_PLATFORMS.includes(body.platform)
    ? body.platform
    : undefined;

  if (!brand) {
    return Response.json({ error: "brand is required" }, { status: 400 });
  }
  if (dateFrom < EARLIEST_DATE) {
    return Response.json({ error: `date_from cannot be earlier than ${EARLIEST_DATE} (DataForSEO's documented minimum)` }, { status: 400 });
  }

  try {
    const names = [brand, ...competitors].filter(Boolean);
    const perBrand = await fetchMentionsHistorical(names, dateFrom, dateTo, platform);

    // Combine the separate per-brand monthly pulls into one timeline: each
    // point is one calendar month with every brand's mention count for it.
    const monthKey = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;
    const months = new Map<string, BenchmarkMonthPoint>();
    for (const b of perBrand) {
      for (const m of b.months) {
        const key = monthKey(m.year, m.month);
        if (!months.has(key)) months.set(key, { year: m.year, month: m.month, brands: [] });
        months.get(key)!.brands.push({ brand: b.brand, mentions: m.mentions });
      }
    }
    const timeline = Array.from(months.values()).sort((a, b) => a.year - b.year || a.month - b.month);

    return Response.json({ timeline, dateFrom, dateTo, platform: platform ?? "all" });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "DataForSEO request failed" }, { status: 502 });
  }
}
