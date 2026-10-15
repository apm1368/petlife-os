# PET LIFE — combined approved design rollout

Branch: `codex/stab-approved-design-rollout`, based on `a5a672d` from the latest fetched `origin/stabilization/wave-1`. Shop work is included in this branch; do not release the old shop-only bundle separately. No production deploy or merge has been performed.

The owner authorized combining the approved page patterns for a single release. The member's personal tabs retain the glass frame; service, reservation, commerce, editorial and operations destinations use the warm plum/cream/copper vocabulary. Existing route guards and transaction engines remain in place. Protected admin navigation/CRM/customer-affairs are unchanged.

| Area | Implementation / evidence |
| --- | --- |
| Member home and personal tabs | Previously merged glass member home; shared glass form/record surfaces remain. See `../member-glass`. |
| Shop, products, detail, cart, checkout, confirmation | Full commerce stage included; actual filters, multi-seller checkout, address editing and errors. See `../shop-design`. |
| Clinic/service/taxi lists and provider profile | Warm discovery cards/sidebar, provider sections/staff/booking panel; real discovery data and filters. |
| Slot/range/taxi/travel bookings | Shared reservation pattern; underlying hold, availability, addresses, payment and policy behavior retained. |
| Animal support | Divar-like needs cards and real help-offer flow; no invented hotel prices. |
| Blog and article | Editorial search, featured grid, cover and reading column, author/date/tags, actual same-category related posts and sharing. |
| Contact | Park backdrop and glass form; authenticated support delivery, preserved draft, true success/error states. |
| Admin home | Real operational counts, queues, tasks, system health and role-filtered search. No fabricated sales graph. |
| Wider operational/internal pages | Domain tokens, surfaces, forms, tables and mobile wrapping applied through shared patterns. **Not every inner form has been individually redesigned or browser-tested.** |
| Additional real feature actions | Owner record edits/corrections, clinical reads/writes, content author/tag/category maintenance, availability editing, seller offers/inventory/channels, plan maintenance, household name, subscription history and travel edit. |

## One backend handoff

Use [BACKEND-HANDOFF.fa.md](BACKEND-HANDOFF.fa.md). It includes the single Persian prompt, verified contract gaps, provenance/access issues and ownership boundaries. [API-DISPOSITIONS.md](API-DISPOSITIONS.md) distinguishes existing replacement/aggregate APIs from **remaining frontend work**. Do not request a duplicate backend for an already-existing endpoint.

The request for universal backend-to-frontend coverage is **not certified complete**. The controller inventory has unresolved review candidates and some genuine missing frontend areas (including wider Clinic OS and insurance administration). A shared stylesheet does not close them. See `backend-ui-coverage.json`, `BACKEND-COVERAGE.md` and `ui-coverage-audit.json` for evidence. Reproduce the service inventory with `node apps/web/design-review/approved-rollout/audit-service-consumers.cjs`. `route-design-status.json` records all inventoried routes and explicitly distinguishes shared patterns from individual verification.

## Visual review

Screenshots use controlled API fixtures, not live production data. No fixture is imported by a shipped page. `targets/` preserves the approved visual references. `screenshots/before-*` captures real sources at `a5a672d`; contact/clinical are new routes and have no invented baseline.

| Page | Persian mobile | Persian desktop |
| --- | --- | --- |
| Clinic list | [After](screenshots/clinic-list-fa-390.webp) · [Before](screenshots/before-clinic-list-fa-390.webp) | [After](screenshots/clinic-list-fa-1440.webp) · [Before](screenshots/before-clinic-list-fa-1440.webp) |
| Clinic profile | [After](screenshots/clinic-fa-390.webp) · [Before](screenshots/before-clinic-fa-390.webp) | [After](screenshots/clinic-fa-1440.webp) · [Before](screenshots/before-clinic-fa-1440.webp) |
| Booking | [After](screenshots/booking-fa-390.webp) · [Before](screenshots/before-booking-fa-390.webp) | [After](screenshots/booking-fa-1440.webp) · [Before](screenshots/before-booking-fa-1440.webp) |
| Support board | [After](screenshots/support-board-fa-390.webp) · [Before](screenshots/before-support-board-fa-390.webp) | [After](screenshots/support-board-fa-1440.webp) · [Before](screenshots/before-support-board-fa-1440.webp) |
| Blog | [After](screenshots/blog-fa-390.webp) · [Before](screenshots/before-blog-fa-390.webp) | [After](screenshots/blog-fa-1440.webp) · [Before](screenshots/before-blog-fa-1440.webp) |
| Article | [After](screenshots/article-fa-390.webp) · [Before](screenshots/before-article-fa-390.webp) | [After](screenshots/article-fa-1440.webp) · [Before](screenshots/before-article-fa-1440.webp) |
| Contact | [Mobile](screenshots/contact-fa-390.webp) | [Desktop](screenshots/contact-fa-1440.webp) |
| Admin home | [After](screenshots/admin-fa-390.webp) · [Before](screenshots/before-admin-fa-390.webp) | [After](screenshots/admin-fa-1440.webp) · [Before](screenshots/before-admin-fa-1440.webp) |
| Clinical owner records | [Mobile](screenshots/clinical-records-fa-390.webp) | [Desktop](screenshots/clinical-records-fa-1440.webp) |

English equivalents replace `-fa-` with `-en-`. Browser JSON records horizontal overflow and uncaught page errors at 390/1440. For reproduction, run Next dev on port 3000, install Python Playwright/Pillow and system Chromium, then execute `browser-review.py` and `browser-extra-review.py` from this folder. Set the local API origin to `http://localhost:4000`; requests are intercepted only inside the review browser. They never change application data.

## Publication gates

Frozen install, lint, web typecheck, web tests and browser evidence are recorded in `VALIDATION.md`. Repository-wide typecheck remains blocked by the cloud's ungenerated Prisma Client. Do not weaken checks or fake generated types. GitHub write authentication is unavailable in this environment; local commits/bundle are a handoff, not an open PR or a deployment. The required base is `stabilization/wave-1`; owner/Claude handles merge and the final approved release to `main`.

## Clinic workspace follow-up

`/provider/clinic` adds the real daily queue, task lifecycle/status filters, paginated customer search, current clinic plan usage and author/owner-controlled customer notes. Notes default to clinic-only. Four fa/en 390/1440 captures are in `screenshots/clinic-workspace-*.webp`; `clinic-browser-checks.json` records no document overflow or page errors. Content version history now inspects server snapshots and reports restore failures. These additions do not implement the remaining campaign/import/team/finance Clinic OS work.

## Additional owner photo reference

The owner supplied [another original Cookie photo](references/cookie-owner-photo-02.jpg) for the design collection. [Usage notes](references/README.fa.md) retain its provenance and distinguish a design reference from an already published page asset.
