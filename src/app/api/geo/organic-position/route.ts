import { fetchOrganicPositions } from "@/lib/dataforseo";

export async function POST(req: Request) {
  const body = await req.json();
  const domain: string = body.domain;
  const keywords: string[] = Array.isArray(body.keywords) ? body.keywords : [];

  if (!domain || keywords.length === 0) {
    return Response.json({ error: "domain and keywords are required" }, { status: 400 });
  }

  try {
    const positions = await fetchOrganicPositions(domain, keywords);
    return Response.json({ positions });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "DataForSEO request failed" }, { status: 502 });
  }
}
