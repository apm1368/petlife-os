# Public community smoke — 2026-11-11

Test ID family: `QA-COMMUNITY-PUBLIC-{fa,en,de,es}`. Environment: production, anonymous real browser/API reads, Chromium 154.0.8037.57. Tested application SHA: `d2461e598fec4b18e7e4fc5f013b853d771ae02b`.

The read-only Playwright script `docs/qa/tools/community-public-smoke.py` ran four cases against `/fa/community` (390×844), `/en/community` (1440×900), `/de/community` (768×1024), and `/es/community` (390×844). Each page, search request, and filter request returned 200. A unique synthetic query produced a genuinely empty response before any screenshot was retained; every observed request method was GET/HEAD/OPTIONS, no write occurred, no browser page errors or horizontal overflow were observed, and the sampled LTR UI scan found no Persian application text. The HTML direction was RTL for fa and LTR for en/de/es. Spanish also exercised dark + simplified display, German dark mode, and fa/en light mode.

All four cases PASS for this bounded search/filter smoke. Screenshots and structured results are in [evidence](evidence/community-public-2026-11-11/). The script aborts non-GET/HEAD/OPTIONS requests and retains screenshots only for confirmed empty filtered results.

This is not proof of community posting, moderation, authenticated flows, private messages, every UI string, accessibility, all viewport/theme combinations, or full-page localization. It is not evidence for code after `d2461e5…`; rerun the smoke after changes to the community page/API or production configuration.
