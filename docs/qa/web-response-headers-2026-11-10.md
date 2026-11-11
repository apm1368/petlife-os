# QA-WEB-HEADERS-01 — P2 response-header hardening

Base main `464efafd7a0a354c6d773ea8fdfaa588a4ca9091`; header implementation `b7b1081f7d35fe696263a9f9042a434cfe1d1113`, browser-helper refinement `750f8ff6cc3a7c86f9e7b525c2d5ad8db6512419`. **Implemented/tested locally, NOT LIVE.** Owner security-hardening requirements; TC-21 code-review clarification is recorded in #245 and does not affect product second-person approvals.

## Baseline, expected and actual

On stable production `40f0045e5dbda0afd974779373fa3fd43d18be3b`, direct anonymous HTML for English FAQ, German legal and Spanish registration lacks nosniff, frame, referrer and CSP headers; HSTS exists. API readiness already supplies nosniff/SAMEORIGIN/no-referrer/CSP. No private session, clinical record or authenticated clickjacking exploit was tested.

Four new contracts against the actual exported Next config initially **FAIL** (no header rules). After the change all **four PASS**; ESLint, Node syntax and diff checks PASS. Existing intl plugin and image configuration are preserved; no shared UI or HERO files change. Complete fresh hosted CI/typecheck/build still required.

[Production baseline](evidence/web-headers-2026-11-10/before/results.json): three HTTP header checks FAIL; same-origin public FAQ iframe PASS; cross-origin disposable iframe check **BLOCKED/inconclusive**, neither expected document nor browser policy signal observed. This is **not proof of protection, successful cross-origin embedding or a confirmed private-flow exploit**. An initial check waited for API-backed FAQ copy; the refined helper observes the document heading for framing and records browser policy/network signals separately. No false PASS is substituted for the inconclusive result.

## Scoped change and assumptions

- `X-Content-Type-Options: nosniff` and explicit `Referrer-Policy: strict-origin-when-cross-origin` on Next responses.
- `X-Frame-Options: SAMEORIGIN` plus **only** `Content-Security-Policy: frame-ancestors 'self'`, consistent with the API's same-origin framing boundary. No third-party HTML embedding contract was found in the inspected decisions; existing sharing/source-link workflows are links, not an embedding permission. A future authorized embed needs explicit route/origin design, not globally opening private pages.
- This is not a complete script/XSS CSP. No default/script/image/connect restrictions, nonce changes or camera Permissions-Policy are introduced. Current inline hydration, QR camera controls and signed media are not intentionally blocked.
- No cache/MIME/HSTS, bucket/CDN, upload, session, authorization, clinical, financial approval or ledger policy change. Private document previews still require authorized acceptance; a public iframe test is not their proof.

## Retest/release handoff

Run `vitest run next-security-headers.test.mjs` from apps/web, relevant lint/full CI and production build. After normal protected merge/deploy, verify exact SHA, ready state and all sampled public JS/CSS resources. Run `python docs/qa/tools/web-response-headers-smoke.py --expected-sha SHA --output-dir NEW_TEMP_DIR` and retain HTTP and same/cross-origin browser outcomes separately. The helper aborts every unsafe request and uses only public owned routes/disposable browser DOM; no real data is created.

Do not mark frame behavior LIVE_VERIFIED without an actual browser policy observation. If cross-origin execution remains environment-blocked, retain that limitation and verify at least the actual deployed HTTP policy. Preserve the existing landing HERO and perform its normal release comparison. No migration; existing backup/build rollback and unverified restore-drill limits remain.
