# Prompts for Codex / Claude

These prompts identify remaining work, not work already delivered. Apply one topic per fresh branch. Existing session rules remain in force: branch from latest `origin/stabilization/wave-1`, base PR `stabilization/wave-1`, no merge by the frontend agent, CI + QA, before/after Persian 390px and 1440px screenshots, fa/en parity, RTL, Jalali dates and explicit Toman units. Use existing APIs and real data. Never weaken tests or put samples into production data flows.

## 1. Existing functionality without a verified frontend consumer

```text
Audit apps/web/design-review/approved-rollout/ui-coverage-audit.json. For each method marked REVIEW_REQUIRED_NOT_PROOF_OF_MISSING_UI, verify whether it is a legacy wrapper, an alias/generic call, a deliberate role restriction, or a real user-facing operation with no reachable control. Record the exact route, role and permission, source method, missing action, acceptance test, and decision. Do not infer feature absence solely from the static scan.

Prioritize: address editing; allergy/condition/medication edits; refunds and shipment details; clinical problem lists/prescriptions/care plans; admin author/category/tag management; seller marketplace publishing; provider availability editing. Preserve owner/provider authorship and access rules, and preserve audit history for clinical corrections. Reuse existing endpoints when present. For confirmed UI gaps, implement one domain per codex/stab-* branch with accessible forms, visible save failures, retry and distinct loading/empty/error states. Never invent a new API or mock success. Raise a precisely scoped backend issue if required behavior is absent.

Protected scopes (apps/api, prisma, workflows, deploy files, scripts, AdminShell navigation, admin crm/customer-affairs) belong to Claude. Document findings there without editing those files from a frontend task.
```

## 2. [codex→claude] Approved admin navigation

```text
Owner approved an admin concept with a deep-plum RTL navigation rail and warm cream operational canvas. The frontend agent may redesign AdminDashboardView content, but AdminShell navigation is your protected scope. Reconcile the approved navigation presentation with existing NAV_ITEMS/NAV_GROUPS and permission filtering. Keep CRM/customer-affairs and all preview-only sample-data workspaces hidden in production. Preserve route guards, compact mobile navigation, keyboard behavior, actual counters, and all existing destinations. Do not add invented sales/session analytics or setup cards. Agree on the shell class/interface for the frontend dashboard styling; submit a separate small PR to stabilization/wave-1 with fa/en screenshots and required tests.
```

## 3. Optional anonymous contact delivery — only if the owner wants it

```text
The approved Contact concept currently signs users in and routes to the existing authenticated support case flow. Implement that frontend against supportService.create; no anonymous backend is required for this approved behavior.

If the owner separately requests sending without sign-in, inspect whether a public contact endpoint now exists. If absent, implement it in Claude's backend lane with a documented minimal request schema, server-side validation, rate limiting, spam controls, delivery/storage outcome and actionable error codes, no fake delivery success or invented contact details. Document privacy/retention choices and provide integration tests. Expose a real endpoint contract to the frontend. Never publish phone/email/address placeholders as business contact details.
```

## 4. Remaining approved frontend design batches

```text
Implement the ledger in README.md, one domain per fresh branch and PR. The approved raster targets are recorded in approved-targets.json. Preserve the glass member shell for personal tabs and use the warm opaque theme for shop/services/booking. Product cards open product details before offer/variant selection; don't add unsupported favorites/trending badges. Shop filters use existing URL-backed facets. Reservation UI adapts to hourly slots, BOARDING/SITTING ranges, PET_TAXI addresses and separate travel holds/payments. Content uses existing author/date/category/tag fields and real photographs; deterministic same-category related links can use blogService.listArticles. Support uses need listings, city/urgency and actual help offers rather than commercial prices. All paths must remain functional, permission-gated and responsive at 390px. No sample data in shipped pages. Report completed/pending/blocked routes separately.
```

## 5. Cloud prerequisite for the repository-wide TypeScript gate

```text
The frontend branch does not change apps/api or prisma. In this cloud instance pnpm typecheck fails because @prisma/client has not been generated; downloading the official schema-engine checksum from binaries.prisma.sh returns HTTP 403. Even the CLI's supported --no-engine generation path requires that download here and fails. No checksum bypass, TLS bypass or manually written Prisma stubs were used.

Restore legitimate network access to binaries.prisma.sh in the cloud environment settings, then run the repository's pinned package manager with pnpm install --frozen-lockfile, pnpm --filter @petlife/api db:generate, pnpm lint, pnpm typecheck and pnpm --filter @petlife/web test. Do not alter application types or weaken verification to get a green result. The existing CI generates the full Prisma client before its checks and must remain authoritative for merge. On the VPS, use flock /var/lock/petlife-build.lock for heavy work and use the existing test environment setup without printing secrets.
```
