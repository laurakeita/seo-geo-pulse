# Internal handoff — not published

This note exists so the public case study page can stay concise. It covers
debugging detail, browser test results, and open/confirmed checks that the
public page deliberately leaves out. Lives in this private repo only.

Last updated: 2026-11-08.

## This round (2026-11-08): navigation rebuild, saved tests, history, historical benchmark

Major restructure per the "two tabs instead of six" request. Summary of what
changed, for anyone picking this up later — the public case study intentionally
doesn't carry this level of build detail.

- **AI Tracking went from 6 sub-tabs to 2**: Queries, Visibility, Sentiment and
  Citations were removed from the navigation entirely (not hidden — the old
  `AITrackingTab.tsx` sub-tab code, `TrackedQuery`/`PlatformMention`/
  `CompetitorMention`/`Sentiment` types, and `aiVisibilityMock` were deleted).
  Share of Voice was renamed and rebuilt as **Brand Visibility Benchmark**
  (`BrandVisibilityBenchmark.tsx`, new). Prompt Monitoring is now its own full
  tool (`PromptMonitorSection.tsx`, substantially rewritten) with the question
  field first, then focal brand/competitors/market/language/platforms, per the
  requested field order. `AITrackingTab.tsx` is now a thin 2-tab shell.
- **Saved tests + run history + persistence**: new `src/lib/storage.ts` wraps
  `window.localStorage` (try/catch guarded). This is a from-scratch addition —
  there was no backend database or any persistence layer in this project
  before, so browser localStorage is the "existing persistence" being reused,
  per the instruction to prefer what's already there. Saved tests and history
  are per-browser, not synced across devices — stated directly in the UI, not
  just here. Verified via CDP: created a saved test + a run, read
  `localStorage` before/after a full page reload, confirmed both survived and
  the saved-test dropdown repopulated correctly.
- **Compare with previous run**: matches on exact (platform, prompt-text)
  pairs that succeeded (`status: "ok"`) in both runs. Verified two real edge
  cases via CDP: (1) two runs with different question wording → correctly
  flagged "these runs differ in: question wording" and correctly reported
  "Comparison unavailable — no prompt/platform pair succeeded in both runs"
  (zero overlap, since the prompt text differs on every pair); (2) three
  identical-settings runs → trend chart populated, "Compare latest two" showed
  a real per-brand table with "Matched sample: 4 prompt/platform pairs" and
  correct `— 0` deltas (demo data is deterministic, so identical settings
  produce identical results, which is expected and not a bug).
- **"Where competitors appeared" filter**: verified live in demo mode —
  surfaces exactly the answers where a competitor name matched and the focal
  brand didn't; checkbox only appears when at least one such answer exists.
- **Brand Visibility Benchmark + LLM Mentions Historical API**: new
  `fetchMentionsHistorical()` in `dataforseo.ts`, new routes
  `/api/geo/benchmark` and `/api/geo/benchmark-history`. Important
  implementation note: the Historical endpoint's `target` array is filter
  criteria for *one* search (include/exclude rules), not a list of comparable
  named targets like `multi_target_metrics` — so comparing N brands over time
  means N separate calls combined client/server-side per month, same principle
  as the live share-of-voice math. Confirmed via docs only (balance-blocked,
  see below): `date_from` cannot precede 2025-08-01 (enforced with a 400 in
  the route, verified by curl), platform is `chat_gpt`/`google` only.
- **Real mentions count was initially fabricated, caught and fixed**: first
  draft of `/api/geo/benchmark` synthesized a fake "mentions" number as
  `rate * 1000` instead of returning the API's real count, because
  `AiVisibilityPlatformResult` didn't carry raw mentions, only the rate. Fixed
  by adding `mentions: number` to that interface and threading the real value
  through — caught during self-review before shipping, not by the user.
- **Locale bug found and fixed during verification**: `toLocaleString(undefined, ...)`
  calls in two new components rendered dates/numbers in whatever locale the
  visitor's browser reports — confirmed via screenshot showing "2026年8月"
  instead of "Aug 2026" in the headless Chrome instance (which inherited a
  zh-TW system locale). Every `toLocale*` call in the codebase now explicitly
  passes `"en-US"` — grepped to confirm none were missed.
- **`window.prompt()` replaced with an inline input**: the first "save test"
  implementation used a native `window.prompt()` dialog, which is also what
  caused a CDP automation script to hang (native dialogs block the JS
  execution context mid-`Runtime.evaluate`, so an `await`ed click into a
  prompt() never resolves without separately handling the dialog event).
  Replaced with an inline text field — better for accessibility/stylability
  regardless, and what exposed the problem is informative on its own.
- **English-first UI**: question/demo defaults switched to an English prompt
  ("Which niacinamide serums under NT$2,000 would you recommend for
  combination skin in Taiwan?"), with a one-click "Use a Traditional Chinese /
  Taiwan scenario instead" link that swaps in the original Traditional Chinese
  prompt and sets market/geo accordingly. All dashboard chrome (labels,
  buttons, table headers, tooltips) is English; submitted prompts and model
  answers stay in whatever language they were written/returned in.

## Account status

DataForSEO trial account balance went negative (**-$0.07**) partway through
this round's live verification. Every live call after that point — across
SERP, LLM Mentions, AI Keyword Data, and all four LLM Responses platforms —
returns HTTP 402 / task error 40200/40501 "Payment Required." The app
surfaces this correctly as a visible error (confirmed in the UI), but it
means **no successful live LLM Responses call has been observed this round.**
Account needs funding before Prompt Monitoring's live path can be verified
end-to-end with real content.

## What's confirmed vs. not, this round

### Organic Pulse / SERP (confirmed)
- Trailing-slash 404 on `/v3/serp/google/organic/live/advanced/` reproduced
  fresh — real, live 404, still fixed (code omits the trailing slash).
- **Found and fixed a live, current bug**: Google now serves organic results
  through a `google.com/goto?url=...` click-tracker redirect. DataForSEO's
  `domain` field reads "google.com" for every result regardless of which
  site actually ranks — confirmed across multiple real queries (e.g.
  "niacinamide serum", "second world war"). The real destination domain only
  survives in the `breadcrumb` field (e.g. `https://www.paulaschoice.com ›
  ingredient-spotlight`). Fixed in `extractDomain()` in `dataforseo.ts` by
  parsing breadcrumb first, falling back to `domain`.
- Verified the fix: `paulaschoice.com` for "niacinamide serum" →
  `status: "found"`, position 3 (matches live SERP data pulled the same
  session). Fictional domain `glowlabskincare.com` → `status: "not_found"`
  (not a false positive).
- Added a 3-way status (`found` / `not_found` / `error`) so a request failure
  no longer renders identically to a legitimately-absent ranking. Verified
  via UI (error badge distinct from "not found" text) and via forcing a 402.

### LLM Mentions / Multi-Target Metrics (confirmed)
- Field names/response shape (`items[].platform[].{key,mentions,ai_search_volume}`,
  `aggregated_metrics.platform`) match the parser exactly — confirmed live.
- Share-of-voice formula verified against raw numbers: GlowLab Skincare (9
  mentions) vs. The Ordinary (440,141 mentions) on ChatGPT, aggregated total
  440,150 — denominator is exactly the sum of the submitted targets' own
  mentions, not a global category total.
- **Platform coverage confirmed via docs AND live response**: this specific
  endpoint's `platform` param only accepts `chat_gpt` and `google`. Tested
  with two different target pairs (GlowLab/Ordinary, Nike/Adidas) — both
  only ever returned `google` and `chat_gpt` keys, never gemini/perplexity.
  Doc quote: "possible values: chat_gpt, google ... Note: if the platform is
  not specified, the data is returned for both platforms." Also: "chat_gpt
  data is available for the United States and English only" — this is the
  basis for the case study's tradeoff claim re: Mentions vs. Responses.
- AI Keyword Data worked example reproduced fresh: "hiking backpack" →
  `ai_search_volume: 2873` (confirmed live this round).
- Platform selector (added this round) verified: per-platform live-scoped
  requests via the `platform` param return correctly filtered results;
  race-condition guard tested by firing two rapid platform switches and
  confirming the UI settled on the later selection (not a stale response).

### LLM Responses / Prompt Monitoring (built, NOT live-verified)
- Confirmed via the free `/models` endpoint (no balance needed) that all
  four platforms are real, with live, current model lists (e.g. gpt-6.1-sol,
  claude-sonnet-5-5, gemini-4-argon, sonar/sonar-pro/sonar-reasoning-pro).
  Default models chosen for cost: `gpt-4.1-mini`, `claude-haiku-4-5`,
  `gemini-2.5-flash-lite`, `sonar`.
- Geo-targeting (`web_search_country_iso_code`) confirmed present in docs for
  chat_gpt, claude, perplexity; confirmed ABSENT for gemini.
- Response parsing (`items[].sections[].text` + `.annotations[].{title,url}`
  for citations) is based on docs only — **never confirmed against a real
  response body**, because every live call this round returned 402 before
  reaching a parseable success response. This is the single largest
  unverified surface area in the round's build.
- Error-path end-to-end verified: UI correctly shows per-platform
  "N requested / M analyzed / K empty / J failed" counts, race-guards a new
  run against a stale one, and the "empty" vs. "error" vs. "ok" status
  distinction was verified via mocked `Fetch.fulfillRequest` CDP
  interception (not real API data) for the "ok" and "empty" render paths,
  since no real "ok" response was reachable.
- Interactive-demo / sample-response fallback (added so a future public
  deployment can't silently rack up billed calls) verified working: when
  "Use live DataForSEO data" is off, `run()` short-circuits before any
  `fetch()` call — confirmed by code inspection (the fetch() is physically
  unreachable in that branch) and by the server access log showing zero
  hits to `/api/geo/prompt-monitor` during a demo-mode run.

## Browser coverage, this round

- **Chrome** (headless, CDP-automated): fully tested — page load, tab/section
  switching, Prompt Monitoring (prompt entry, platform toggles, geo field,
  run, loading/error/empty states, response inspection), Organic Pulse live
  fetch, Share of Voice platform selector + race guard, methodology
  accordions. Desktop (1280px) and mobile (390px) emulation via CDP
  `Emulation.setDeviceMetricsOverride` (not the `--window-size` CLI flag,
  which has a known viewport-constraint bug on narrow widths — see prior
  round's notes).
- **Safari** (real Safari, via AppleScript `osascript`): attempted, failed —
  `AppleEvent逾時` (AppleEvent timeout) opening the page, and `screencapture`
  separately failed with "could not create image from display." Traced the
  process tree: this sandbox's shell ultimately runs under
  `/Applications/Visual Studio Code.app`, which needs Screen Recording +
  Automation permission granted in System Settings, with a full VS Code
  **quit-and-relaunch** (not just reload) for the grant to take effect.
  User was mid-way through granting this when the session moved on to other
  work — retry once confirmed.
- **Firefox, Edge**: not installed in this environment.
- **Mobile Safari (iOS), Chrome Android**: no device/simulator available in
  this sandbox. Untested.
- No WebKit automation framework (e.g. Playwright-webkit) was used anywhere
  this round — all "Safari" attempts above were against real Safari.app,
  not a WebKit engine via another tool. (Distinguishing this because the
  brief asked to track it separately.)

## Deployment status

- No public URL exists. Code is pushed to a **private** GitHub repo:
  `https://github.com/laurakeita/seo-geo-pulse`.
- Vercel CLI is installed locally but has no authenticated session — `vercel
  login` needs an interactive browser OAuth flow this sandbox can't complete.
  Creating a *public* GitHub repo directly was also blocked by this sandbox's
  own auto-mode safety classifier ("Create Public Surface"); private repo
  creation was allowed.
- Per explicit instruction, the public case study does **not** link to a
  dashboard URL yet. Next step is entirely on the user's side: sign into
  Vercel with GitHub, import `laurakeita/seo-geo-pulse`, set
  `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` as env vars. Once that's live,
  add the "Try the monitoring dashboard" button with the real URL and verify
  the signed-out demo flow (brand/competitors/prompt are already prefilled:
  GlowLab Skincare / The Ordinary, CeraVe / the Taiwan niacinamide prompt).

## Known rough edges not worth blocking on

- Sentiment is gone from the navigation entirely this round (not demoted —
  removed, per the instruction). No sentiment analysis of any kind — real or
  AI-derived — exists anywhere in this build now. If ever added, it must be
  labeled "AI-derived" only if an actual model classifies response text.
- Brand Visibility Benchmark's "Compare periods" always refetches both
  periods from scratch (two full historical calls) rather than reusing the
  main trend fetch's data — simplest correct implementation, not optimized;
  fine at this traffic scale, worth revisiting if this ever gets real usage.
- The old `/api/geo/ai-visibility` route (superseded by `/api/geo/benchmark`)
  is still sitting in the repo, unreferenced by any component. Deletion was
  blocked by this sandbox's destructive-operation guard (`rm -rf`) and wasn't
  worth fighting — harmless dead code, safe to delete by hand whenever
  convenient.
- Demo-mode data throughout (Prompt Monitoring samples, Brand Visibility
  Benchmark snapshot and historical trend) is deterministic (hash-seeded),
  not random — intentional, so a visitor's screenshots/behavior are
  reproducible, but it means e.g. three identical demo runs in a row show
  identical sample results. That's expected, not a bug.
