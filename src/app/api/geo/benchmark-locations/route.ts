import { fetchMentionsLocationsAndLanguages } from "@/lib/dataforseo";

// Free reference data (confirmed cost: 0) — safe to call without the
// "Use live DataForSEO data" toggle, same way the LLM Responses /models
// endpoints are. Cached briefly since it's effectively static.
export async function GET() {
  try {
    const locations = await fetchMentionsLocationsAndLanguages();
    return Response.json(
      { locations },
      { headers: { "Cache-Control": "public, max-age=3600" } },
    );
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "DataForSEO request failed" }, { status: 502 });
  }
}
