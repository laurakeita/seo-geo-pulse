import type { NextConfig } from "next";

// Set only by the GitHub Pages workflow (.github/workflows/deploy-pages.yml),
// which also deletes src/app/api before this build — static export can't run
// server-side route handlers at all, so the API routes have to be gone from
// the build entirely, not just unused. Local `next dev`/`next build` and any
// future Vercel deployment are unaffected (this stays unset there).
const isStaticExport = process.env.NEXT_STATIC_EXPORT === "1";

const nextConfig: NextConfig = isStaticExport
  ? {
      output: "export",
      basePath: "/seo-geo-pulse",
      images: { unoptimized: true },
    }
  : {};

export default nextConfig;
