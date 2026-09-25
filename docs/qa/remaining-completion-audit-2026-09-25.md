# PET LIFE OS remaining-completion audit

Date: 2026-09-25  
Audited branch: `codex/ci-vps-deploy`  
Audited/deployed SHA: `ad522b7540a369f067aef51e2af9721551c65f49`  
Staging: `http://185.231.112.154/fa`  
Scope: repository, 154 web routes, 96 API controllers, 178 Prisma models, 30 migrations, current tests, CI/CD, live staging, and supplied design references.

Status definitions used below:

- Function: **A** complete, **B** partial, **C** missing capability, **D** broken, **E** external blocker.
- Visual: **A** accepted, **B** usable with polish remaining, **C** major mismatch/unaccepted, **D** raw scaffold, **E** broken.
- Priority: **P0** release blocker, **P1** major product gap, **P2** completion gap, **P3** polish.

The complete route-level source of truth is [page-completion-registry-2026-09-25.csv](./page-completion-registry-2026-09-25.csv), with a machine-readable copy in [page-completion-registry-2026-09-25.json](./page-completion-registry-2026-09-25.json). It contains every real route and every field requested by this audit.

## 1. Executive summary

PET LIFE OS has a broad domain foundation and many implemented screens, but it is not 76% complete under the requested definition of complete. The evidence-based overall result is **64% complete; 36% remains**.

The repository is structurally substantial: 154 pages, 96 API controllers, 178 Prisma models, and 30 migrations. The current web unit suite passes 405 tests in 120 files; the API unit suite passes 36 tests in six suites; both typechecks pass; lint has zero errors and five warnings. A current staging sweep returned HTTP 200 for all 85 non-dynamic routes in both locales, 170 requests total.

Those numbers overstate product readiness if counted as completion. Only the landing route qualifies as function A in the strict registry. Five routes are externally blocked, three expose missing capabilities, and 145 are partial because their full action/state/role/runtime matrix is not accepted. No route has final route-level visual acceptance recorded. Live inspection shows a strong landing and usable responsive shop, while the admin dashboard still has excessive empty space, a horizontally overflowing navigation strip, and does not match the supplied operational-console references closely enough.

Four issues define the shortest path forward:

1. Fix pet-privacy authorization in public service/vet compatibility APIs.
2. Make CI gate the staging branch and repair the failing `main` CI run.
3. Wire production auth/payment/messaging/shipping adapters or explicitly reduce launch scope.
4. Finish missing product surfaces, starting with household/account, travel marketplace, and admin/partner counterparts, using a small set of canonical page patterns.

## 2. Revised completion percentage

Weighted score: **64%**.

| Category | Weight | Complete | Evidence and limit |
|---|---:|---:|---|
| Backend/domain | 16% | 78% | Broad modules and schema exist; travel marketplace is orphaned, production adapters and some workflows are absent. |
| Frontend functionality | 15% | 72% | 154 routes and many tested views; most routes lack end-to-end action acceptance. |
| Page coverage | 10% | 74% | Core consumer/provider/seller routes exist; household, travel marketplace, legal/help, and several admin pages are missing. |
| Admin coverage | 8% | 55% | Customer/support/content/finance subsets exist; operations coverage is incomplete and CRM/customer affairs are sample-only. |
| Partner coverage | 6% | 57% | Provider and seller portals exist; travel, insurer, and shelter partner portals do not. |
| Visual quality | 10% | 48% | Landing/shop are strong; most routes have no final comparison and admin is materially misaligned. |
| Responsive | 5% | 50% | Shop passed a sampled 390×844 check; no full route/breakpoint matrix exists. |
| RTL/LTR | 5% | 60% | Shared locale direction works and sampled shop passed; dense/admin/dynamic screens remain unaccepted. |
| Tests | 8% | 54% | Web 405 tests; API only 36 tests for 96 controllers; route, role, visual, accessibility and performance coverage remain. |
| CI/CD | 5% | 62% | Staging deploy succeeds, but `integration/local` bypasses CI and the latest `main` CI failed during pnpm setup. |
| Staging | 3% | 78% | Live and API healthy; static routes return 200; dynamic/action/role flows are not continuously accepted. |
| Security | 4% | 58% | Session, CSRF and pet-access foundations exist; public pet compatibility lookup has an authorization gap. |
| Performance | 2% | 40% | No current Lighthouse/CWV/load budget; five lint warnings include unoptimized images and one hook dependency. |
| SEO | 1% | 25% | Landing metadata exists; no sitemap/robots route and little route-specific metadata. |
| Localization | 2% | 60% | FA/EN shells exist; no complete translation/content/format audit across 154 routes. |

## 3. What the earlier 76% really contained

The 76% estimate was a **structural implementation estimate**: routes existed, modules were present, migrations were written, many views called APIs, and some workflows had unit tests. It did not consistently discount the following:

- a route existing without full actions, role behavior, or states;
- backend services that are not registered or exposed;
- sample-only operational consoles;
- live adapters that deliberately return `NOT_IMPLEMENTED`;
- missing admin and partner counterparts;
- the absence of visual acceptance across 149 in-scope routes;
- desktop-only or unverified responsive and RTL/LTR behavior;
- a staging deploy that is not gated by the full CI workflow.

Under the stricter product definition, the existing implementation is about 64%, leaving about 36%, not 24%.

## 4. Remaining P0

| Gap | Type | Evidence | Required outcome |
|---|---|---|---|
| Public service compatibility accepts arbitrary `petId` | Security/backend/broken flow | `ServicesService` loads a pet and health/care profiles without proving caller access; controller is optional-auth. | Require authenticated pet access before returning pet-derived compatibility, or ignore `petId` for anonymous callers. Add cross-household negative tests. |
| Public vet availability accepts arbitrary `petId` | Security/backend | `ProvidersService.getAvailability` loads arbitrary pets and returns compatibility. | Apply the same owner/grant check and non-disclosing response contract. |
| Staging deploy is not CI-gated | Infrastructure/test | `deploy.yml` runs on `integration/local`; `ci.yml` only runs on `main` and PRs. | Reusable CI or required workflow dependency before deploy. |
| Latest `main` CI is red | Infrastructure | Run `34694230583` failed at `pnpm/action-setup@v4`. | Repair setup, rerun, and make green CI a protected requirement. |
| Live payment gateway absent | External/backend | Standard gateway returns `STANDARD_GATEWAY_NOT_IMPLEMENTED`. | Production merchant adapter, webhook verification, idempotency and reconciliation acceptance. |
| Live BNPL absent | External/backend | SnappPay and DigiPay adapters return not implemented. | Complete or remove BNPL from GA scope. |
| Production OTP and password-reset delivery absent | External/auth | `DevOtpProvider` is wired; reset service logs dev behavior and sends no email. | Real SMS/email provider, secrets, delivery telemetry, expiry/retry tests. |
| Production notifications incomplete | External/backend | Faraz SMS returns `PROVIDER_NOT_IMPLEMENTED`; no accepted email/push path. | Real channel adapters and failure/retry/dead-letter behavior. |
| Production shipping/marketplace contract incomplete | External/backend | Partner adapters require live configuration and some marketplace adapters explicitly reject production. | Finish supported integrations or remove them from launch claims. |
| Production pricing/seed governance | Data/commercial | Current catalog/subscription values are development seeds. | Product-owner-approved catalog, plans, tax/shipping and effective dates. |

## 5. Remaining P1

- Register and expose the existing travel-marketplace services, add controller/module authorization, and create the public booking flow.
- Build household home, members, invitations, pet permissions, temporary access, transfer, lifecycle and access-history screens.
- Replace sample-only CRM and Customer Affairs workspaces with persistent APIs or remove them from release scope.
- Add admin partner detail/verification, services, orders, catalog, travel, insurance, places, animal support, community moderation, finance overview and integrations status.
- Add travel-provider, insurer and shelter/NGO partner portals where the product specification requires operational counterparts.
- Finish production subscription lifecycle: billing attempts, renewal, proration, cancellation, entitlement enforcement and recurring shipments.
- Complete notification scheduling for care/vaccine/medication/subscription events, not only templates and preferences.
- Establish visual acceptance for the core high-leverage pages and propagate the resulting components.
- Add API authorization/integration coverage across high-risk modules; six unit suites are insufficient for 96 controllers.
- Complete dynamic-route, role, forbidden, not-found and mutation-path staging tests.

## 6. Remaining P2

- Add user settings, security, sessions, privacy, consent, connected services, data export and deletion flows.
- Add product subscriptions/repeat-delivery management.
- Add FAQ, legal, privacy, contact and a structured help center/article experience.
- Add route-specific metadata, sitemap, robots, canonical/alternate locale links and structured data.
- Complete the responsive matrix at 360, 390, 768, 1024 and wide desktop.
- Complete Persian/English copy, number/date/currency format and bidirectional layout audits.
- Add accessibility testing for keyboard order, focus, dialogs, dense tables and reduced motion.
- Add performance budgets and image optimization; resolve the current five lint warnings.
- Add deterministic role-scoped seeds for dynamic routes and visual regression fixtures.

## 7. Remaining P3

- Landing reduced-motion, low-height and slower-device polish.
- Microcopy normalization, motion timing, skeleton tuning and density refinement after the page patterns are stable.
- Final empty-state illustration and subtle state-color consistency.

## 8. Missing pages

| Missing route/page family | Domain | Priority | Notes |
|---|---|---:|---|
| `/[locale]/household` and member list | Household | P1 | Backend exists; no dedicated household UI. |
| Household invite, permissions, temporary access, transfer, lifecycle, access history | Household/access | P1 | Supplied references exist; explicit flows are missing. |
| `/settings`, security, sessions, privacy, consent, connected services, exports/deletion | Account | P1/P2 | A pending local sidebar points to `/settings`, but no page exists. |
| `/travel`, search, listing detail, booking, confirmation, policy | Travel marketplace | P1 | Backend service files exist but no module/controller registration and no pages. |
| Travel provider portal | Partner | P1 | Missing. |
| Insurer portal | Partner | P1 | Missing. |
| Shelter/NGO portal | Partner | P1 | Missing. |
| Product subscription/repeat-delivery list and detail | Commerce/subscription | P1 | Marketing copy mentions repeat delivery; no customer management flow. |
| FAQ | Help/legal | P2 | Footer text is not a route. |
| Terms, privacy, consent detail | Legal | P2 | Dedicated public documents missing. |
| Contact and contact-submission result/error | Support | P2 | Missing. |
| Help center, search, article and contextual help | Support | P2 | Ticketing exists; help content surface does not. |
| Admin partner detail and verification review | Admin partners | P1 | Provider/seller lists exist; operational detail route is missing. |
| Admin products/catalog and orders | Admin commerce | P1 | Seller surfaces exist; platform operations do not. |
| Admin services and bookings | Admin services | P1 | Missing. |
| Admin travel, insurance and places | Admin verticals | P1 | Backend domains exist; admin counterparts do not. |
| Admin animal support and community moderation | Admin trust | P1 | Missing. |
| Admin finance overview | Admin finance | P1 | Transactions/reconciliation fragments exist; unified finance view is missing. |
| Admin roles/permissions and feature control | Access/control | P1 | Guards/enums exist; no operational UI. |
| Integrations status/configuration | Integrations | P1 | No UI; live adapters need operational visibility. |
| Global search | Search | P2 | No global UI despite broad domain data. |
| Analytics/reporting | Analytics | P2 | No production analytics surface. |
| Sitemap/robots | SEO | P2 | No Next sitemap/robots route found. |

## 9. Partial pages

The registry classifies **145 of 154 routes as function B**. This does not mean every page is equally incomplete. The main partial clusters are:

- Consumer pet, health, memories, care and travel-readiness pages: broad UI/API coverage, missing full role/state/visual acceptance.
- Vet/services/booking: strong workflow code and tests, but blocked by the pet-access bug and incomplete discovery correctness.
- Commerce: catalog/cart/orders are substantial; checkout is blocked by live payment/BNPL/shipping.
- Provider OS and Seller OS: core operations exist, but visual acceptance, external channel operations and complete role QA remain.
- Admin support/content/subscription/finance: real routes exist, but coverage is fragmented and visual density/navigation differ from the reference system.
- Public content, community, animal support, places and insurance: usable foundations, incomplete moderation/admin/partner counterparts and route-state QA.

## 10. Broken pages and flows

- No current static route returned a render error: all 170 FA/EN requests for 85 non-dynamic routes returned HTTP 200 without the Next application-error marker.
- The 69 dynamic routes were not safely testable without deterministic IDs; they remain unaccepted rather than proven broken.
- The AI page is a raw placeholder: function C, visual D.
- CRM and Customer Affairs render sample-only interfaces: function C despite visually populated cards.
- Travel marketplace cannot be reached because its services are not registered and it has no controller/pages.
- Public services/vet pet compatibility is functionally unsafe until authorization is corrected.
- Checkout can complete only in simulated/dev conditions; production payment paths deliberately fail.
- Admin staging shows horizontal navigation overflow and a sparse dashboard; it renders, but fails the visual/operational acceptance bar.

## 11. Backend gaps

1. Travel-marketplace services are orphaned: no module/controller import in `AppModule`.
2. Service/vet pet-compatibility authorization is missing.
3. Vet discovery does not explicitly restrict results to the VET service category, so non-vet providers can satisfy the query.
4. Production OTP/email/password-reset delivery is absent.
5. Standard payment, BNPL, SMS and marketplace live adapters are incomplete.
6. Recurring product shipment/subscription orchestration is missing.
7. Scheduled health/care reminder triggers are not accepted end to end.
8. CRM and Customer Affairs persistence/domain services are absent.
9. Operational integration status/health and replay tooling is absent.
10. No centralized feature-flag/kill-switch system was found; boolean entitlements exist, but they are not a rollout-control plane.
11. API test coverage is too narrow for the controller/schema surface.

## 12. Admin gaps

- Partner detail and verification review.
- Product/catalog/order operations.
- Service/booking operations.
- Travel, insurance and places operations.
- Animal-support and community moderation.
- Unified finance dashboard and checkout incident resolution.
- Roles, permissions, feature controls and integration health.
- Global search and export tooling.
- Persistent CRM/customer-affairs records and audit trail.
- Responsive dense-table/drawer patterns and navigation that does not overflow.

## 13. Partner gaps

- Provider OS exists with calendar, services, bookings, team and clinical screens, but onboarding/verification/settings and complete mobile/RTL acceptance remain.
- Seller OS exists with orders, inventory, offers, finance, settlements, channels, team and settings, but production marketplace connectors remain blocked.
- Travel-provider portal is missing.
- Insurer portal is missing.
- Shelter/NGO portal is missing.
- Cross-partner support and integration-status views are missing.

## 14. Visual gaps

- Route registry: visual B = 4, C = 149, D = 1, A = 0. The strict result reflects missing acceptance, not necessarily poor appearance on every page.
- Landing is visually strong and coherent, but still lacks formal breakpoint/reduced-motion acceptance.
- Shop is usable in desktop/mobile FA/EN; the supplied commerce reference still needs page-level comparison for list/detail/cart/checkout/order states.
- Admin does not yet follow the dense sidebar + table/detail patterns shown in the supplied references. The current dashboard wastes vertical space and its top nav overflows.
- Most consumer detail pages still need consistent hierarchy, page headers, context cards, timelines and action rails.
- Form, error, permission, empty and success treatments are not yet proven consistent across domains.

## 15. Responsive gaps

- Only sampled pages have current responsive evidence; shop passed at 390×844 in FA and EN.
- Dense admin/provider/seller tables, drawers, steppers, calendars, health records, checkout and long forms need breakpoint acceptance.
- Mobile navigation and action placement need a single pattern; current route groups use different shells.
- Low-height desktop and landscape mobile are untested.
- Long Persian copy, large dynamic values and error text can change card height and overflow.

## 16. RTL/LTR gaps

- Root direction and locale switching work for sampled pages.
- Shop passed sampled FA RTL and EN LTR mobile checks.
- Dense tables, timelines, charts, calendars, steppers, drawers, icon direction, truncation and mixed Latin/Persian identifiers remain unaccepted.
- CRM/Customer Affairs contain Persian-only sample copy and are not localized production surfaces.
- Date/calendar behavior needs explicit Jalali/Gregorian and timezone acceptance across all scheduling domains.

## 17. Test gaps

- Current pass: web 120 files / 405 tests; API six suites / 36 tests; web/API typechecks pass; lint zero errors/five warnings.
- Missing: authorization matrix tests for public optional-auth endpoints, including cross-household pet IDs.
- Missing: controller/service integration coverage across 96 controllers.
- Missing: 69 dynamic-route smoke tests with deterministic fixtures.
- Missing: real role-based E2E for member/provider/seller/admin.
- Missing: payment/webhook/refund/reconciliation and shipping callback contract tests against provider sandboxes.
- Missing: visual regression against canonical screenshots.
- Missing: responsive/RTL/LTR/a11y matrix.
- Missing: performance budgets, Lighthouse/CWV and load/concurrency testing.
- Missing: disaster/recovery, migration rollback and deploy rollback drills.

## 18. External blockers

| Integration | Current state | Needed |
|---|---|---|
| OTP/SMS | Dev provider / Faraz unimplemented production path | Account, approved sender, credentials, templates, delivery callbacks. |
| Password email | No production mail delivery | Mail provider, verified domain, credentials and templates. |
| Google OAuth | Code path exists | Production client, redirect URIs and consent configuration. |
| Standard payment | Explicitly not implemented | Merchant contract, credentials, callback/webhook specification. |
| SnappPay/DigiPay | Explicitly not implemented | Partner approval, credentials and sandbox/production contract. |
| AloPeyk/SnappBox | Requires live partner configuration/acceptance | Credentials, service areas, callbacks and reconciliation. |
| Torob/Digikala | Production paths explicitly not implemented | Official merchant APIs/contracts and credentials. |
| Object storage/CDN | Local fallback exists | Production bucket, access policy, lifecycle, CDN and signed URL configuration. |
| Maps/geocoding | Product surfaces need accepted provider | Keys, quota, privacy and geospatial UX decision. |
| Commercial catalog/plans | Development seed values | Approved SKUs, prices, inventory, tax/shipping and plan terms. |

## 19. Infrastructure blockers

- CI is not triggered by `integration/local`, while deployment is; staging can receive code that never ran the complete CI job.
- Latest `main` CI run failed at pnpm setup and has not been superseded by a green run.
- Deploy runs install/migrate/build/restart/health checks, but not lint, typecheck, tests or E2E.
- No branch protection/required-check evidence was found in the repository.
- No automated rollback, migration preflight/backup verification or smoke suite for critical actions is present.
- Staging is HTTP on a raw IP; production TLS/domain/cookie/security-header behavior is not thereby proven.
- Current working tree contains uncommitted UI navigation work; it is not visible on staging until committed, pushed and deployed.

## 20. High-leverage pages to design first

| Canonical page | Patterns established | Pages that inherit | Why first |
|---|---|---|---|
| Auth/login + OTP/recovery | Two-panel auth, fields, verification, error/success | Register, welcome, forgot/reset, sensitive confirmation | Establishes form and trust language. |
| Account/profile | Account shell, navigation rows, inline edit, state cards | Settings, privacy, consent, security, connected services | Defines personal settings family. |
| Household home/access | Member list, grants, stepper, audit history | Invite, permissions, temporary access, transfer, lifecycle | Largest missing consumer system. |
| Pet profile | Pet context header, tabs, metadata, alert strip | Care, insurance, travel, lost pet, memories | Core entity-detail pattern. |
| Health overview | Clinical summary, timeline, documents, alerts | Labs, imaging, medications, vaccination, dental, rehab | Sets the most complex information hierarchy. |
| Care calendar | Day/week/month, event detail, reminders | Provider calendar, subscriptions, notifications | Shared scheduling behavior. |
| Service/provider discovery + detail | Search/filter/cards/map/profile/availability | Vet, grooming, places, insurance and travel discovery | Reusable marketplace discovery. |
| Booking wizard | Stepper, selection, consent, review, confirmation | Vet/service/travel booking and appointments | Defines transactional flow. |
| Product detail | Media, variants, compatibility, offers | Catalog list, cart lines, subscription product | Defines commerce object detail. |
| Checkout | Address, shipping, payment, summary, failure/retry | BNPL, order confirmation, repeat delivery | Release-critical transaction pattern. |
| Travel listing detail | Policy, availability, pet eligibility, booking | Travel search and partner inventory | Genuinely missing and domain-specific. |
| Support ticket detail | Conversation, attachment, status, audit trail | Admin support, disputes, trust cases | Shared case-management pattern. |
| Admin customer 360 | Dense header, tabs, linked records, action/audit | Partner 360, order ops, subscription household | Canonical admin detail. |
| Admin partner review | Queue, evidence, verification actions, history | Seller/provider/travel/insurer/shelter review | Missing operational cornerstone. |
| Seller order detail | Dense transaction, fulfillment, finance, timeline | Admin order, shipment, refund, reconciliation detail | Reusable operational transaction view. |

## 21. Design pattern families

| Pattern family | Required building blocks |
|---|---|
| Consumer detail | Context header, metadata grid, tabs, alert strip, side actions, timeline, related items. |
| Discovery | Search, filters, sort, list/map switch, cards/rows, verified/compatibility states, pagination. |
| Transaction | Stepper, editable selections, sticky summary, payment, confirmation, retry and resume. |
| Account | Settings shell, grouped navigation, inline edit, security history, destructive-action confirmation. |
| Health record | Clinical summary, source/provenance, timeline, documents, abnormal flags, provider attribution. |
| Calendar | Jalali/Gregorian date control, day/week/month, event drawer, recurrence, reminder and timezone. |
| Operational | Sidebar, filters, dense table, status chips, detail drawer, bulk/safe actions and audit history. |
| Admin review | Queue, subject context, evidence, decision actions, reason, revisions and immutable audit. |
| Finance | Balance/ledger summary, transactions, reconciliation, settlement/refund details and export. |
| Content | Editorial list, editor, locale versions, media, taxonomy, preview and publish history. |
| System state | Skeleton, empty, recoverable error, forbidden, offline/sync, destructive and success feedback. |

## 22. Pages that can inherit each pattern

- Consumer detail: pet profile, memory detail, trip detail, lost-pet incident, insurance application, place, provider and product.
- Discovery: services, vets, shop/products, places, insurance, animal-support needs, community and future travel.
- Transaction: booking, checkout, subscription changes, household invite/transfer, temporary access and travel booking.
- Account: profile plus all missing settings/security/privacy/consent/access pages.
- Health record: all 18 health/document routes and provider patient record.
- Calendar: care calendar, provider calendar, booking availability, medication reminders and subscription shipment schedule.
- Operational: seller inventory/offers/orders, provider bookings/patients/services/team and admin lists.
- Admin review: disputes, trust, partner verification, animal support/community moderation and content approvals.
- Finance: admin transactions/reconciliation/seller finance/settlements and seller finance/settlements.
- Content: blog index/article/taxonomy and all eight CMS routes.
- System state: every route; implement once in shared components and enforce through review/tests.

## 23. Pages that need dedicated design

Category A — must design explicitly:

- Auth/recovery, account/profile, household access, pet profile, health overview, care calendar.
- Discovery/detail pair for services/providers.
- Booking wizard, product detail, checkout.
- Travel listing detail and booking.
- Support ticket, admin customer 360, admin partner review and seller/admin order detail.

Category B — derive from existing pattern:

- Remaining pet health subroutes, memories, lost pet, insurance, places, animal support, community, notifications.
- Provider and seller list/detail pages.
- Most admin list/detail/review pages.
- Blog/CMS taxonomy/version/media pages.

Category C — functional completion only before design propagation:

- Travel-marketplace module/controller/API.
- Production adapters and recurring shipment orchestration.
- CRM/customer-affairs persistence.
- Access-control/integration-health APIs.

Category D — polish only after acceptance:

- Landing, shop home and shared motion/color tuning.

## 24. Exact page-by-page completion sequence

1. Security: service and vet `petId` authorization plus negative tests.
2. CI: fix pnpm setup, run CI on `integration/local`, require CI before deploy, add critical smoke checks.
3. Production adapter scope decision: implement or hide OTP/email/payment/BNPL/shipping/marketplace capabilities.
4. Shared state primitives: loading, empty, error, forbidden, not-found, offline/sync, confirmation and toast.
5. Auth/login/OTP/recovery canonical page.
6. Account/profile canonical page, then settings/security/privacy/consent/session/export/deletion pages.
7. Household home/access canonical flow, then invite/permissions/temporary access/transfer/lifecycle/history.
8. Pet profile canonical page, then care, memories, lost pet, insurance and readiness pages.
9. Health overview canonical page, then all health/document subroutes and provider patient record.
10. Care calendar canonical page, then reminder/notification and provider calendar reuse.
11. Service/provider discovery/detail, then vet/services/places/insurance lists.
12. Booking wizard and booking detail/list; verify provider counterpart and cancellation/reschedule states.
13. Product detail, cart, checkout, order confirmation/list/detail and repeat-delivery management.
14. Register travel marketplace backend; build travel search/detail/booking and partner counterpart.
15. Support ticket canonical pattern; apply to admin support, disputes and trust.
16. Admin customer 360, then admin partner review.
17. Admin operational gaps: orders/catalog/services/bookings/travel/insurance/places/animal support/community.
18. Seller/provider portal alignment using operational and calendar patterns.
19. CMS/blog plus public FAQ/legal/contact/help center.
20. Analytics, global search, integration status, roles/permissions, feature control and export.
21. Full responsive/RTL/LTR/accessibility sweep across canonical pages, then derived routes.
22. Dynamic-route/role E2E, visual regression, performance/SEO, migration/rollback and production readiness.

## 25. Estimated effort by batch

| Batch | Scope | Effort |
|---|---|---:|
| 0 | P0 security + CI gating | 3–5 agent-days |
| 1 | External adapter implementation/configuration | 6–12 agent-days plus provider approval time |
| 2 | Shared states, shells and canonical components | 4–6 agent-days |
| 3 | Account + household missing flows | 5–8 agent-days |
| 4 | Pet/health/care alignment | 5–7 agent-days |
| 5 | Discovery/booking/commerce + repeat delivery | 6–9 agent-days |
| 6 | Travel marketplace and partner portal | 5–8 agent-days |
| 7 | Admin/partner missing counterparts | 8–12 agent-days |
| 8 | Legal/help/SEO/search/analytics/access/integrations | 4–7 agent-days |
| 9 | Responsive/RTL/a11y/E2E/performance/release | 6–10 agent-days |

Total implementation and verification: **52–84 agent-days**, plus elapsed time for external credentials, merchant approvals and product pricing/legal content. This estimate assumes reuse of the pattern families rather than bespoke redesign of every route.

## 26. CI/CD and staging state

- Remote `integration/local`: `ad522b7540a369f067aef51e2af9721551c65f49`.
- Latest deploy run for that SHA: `35540501424`, completed successfully.
- Live staging: `http://185.231.112.154/fa`.
- API liveness: `http://185.231.112.154/api/health/live` returned 200 with healthy status.
- Current staging checks: `/fa`, `/fa/shop`, `/fa/admin` returned 200; all 85 static routes in FA and EN returned 200, 170 requests, zero render issues.
- Pushed changes to `integration/local` are visible after the deploy workflow completes.
- Latest `main` CI run: `34694230583`, failed at `pnpm/action-setup@v4`.
- Critical gap: `integration/local` deploy does not wait for the full CI workflow. Deployment itself builds and health-checks but can publish code that never passed lint, typecheck, tests or E2E.

CI/CD completion requires: green CI on the release branch; CI trigger on staging branch; deploy dependency on successful CI; protected branch/check; post-deploy role/action smoke suite; and rollback/migration safeguards.

## 27. Recommended final release path

**Feature complete**

1. Fix P0 security and CI.
2. Resolve external adapter scope and production configuration.
3. Complete household/account/travel/recurring-commerce and missing admin/partner capabilities.

**UI system complete**

4. Approve the 15 canonical pages.
5. Extract the 11 pattern families into shared components/tokens/states.

**All pages aligned**

6. Apply patterns to the 154 existing routes and newly required routes.
7. Complete responsive, RTL/LTR, localization and accessibility acceptance.

**Release candidate**

8. Run all unit/integration/E2E/visual/performance/security/migration tests in CI.
9. Deploy the exact green SHA to staging and run seeded role/action smoke tests.
10. Freeze schema/content/pricing, verify observability and rehearse rollback.

**Production ready**

11. Configure domain/TLS/cookies/secrets/storage/providers, production seed/content and monitoring.
12. Run final go/no-go against security, payments, notifications, legal, backups and support operations.

## 28. Exact remaining-work matrix

| Domain | Page/capability | Current state | Missing | Priority | Dependencies | Suggested owner | Effort |
|---|---|---|---|---:|---|---|---:|
| Security | Service pet compatibility | Implemented without pet access proof | Authorization and non-disclosure tests | P0 | PetAccess | CODEX ONLY | M |
| Security | Vet availability compatibility | Implemented without pet access proof | Authorization and tests | P0 | PetAccess | CODEX ONLY | S |
| CI/CD | Staging gate | Deploy works independently | CI dependency/protection/smoke | P0 | GitHub Actions | CODEX ONLY | M |
| CI/CD | Main CI | Last run failed | Repair pnpm setup and rerun | P0 | GitHub Actions | CODEX ONLY | S |
| Auth | OTP | Dev provider | Production SMS/email delivery | P0 | Credentials/provider | CODEX ONLY | L |
| Auth | Password recovery | UI/API token generation exists | Secure token delivery | P0 | Email/SMS provider | CODEX ONLY | M |
| Payments | Standard gateway | Explicitly unimplemented | Live adapter/webhooks/reconciliation | P0 | Merchant credentials | CODEX ONLY | L |
| Payments | BNPL | Explicitly unimplemented | Live SnappPay/DigiPay or scope removal | P0 | Partner approval | CODEX ONLY | L |
| Logistics | Live shipping | Core orchestration exists | Partner contract/callback acceptance | P0 | AloPeyk/SnappBox | CODEX ONLY | L |
| Notifications | SMS/email/push | Preference/template foundation | Live delivery/retry/telemetry | P0 | Provider credentials | CODEX ONLY | L |
| Data | Production catalog/plans | Development seeds | Approved catalog/prices/terms | P0 | Product decision | CODEX ONLY | M |
| Travel | Marketplace backend | Service files orphaned | Module/controller/auth/registration | P1 | Existing schema/services | CODEX ONLY | L |
| Travel | Search/detail/booking pages | Missing | Full consumer flow | P1 | Travel API | CODEX ONLY | L |
| Travel | Partner portal | Missing | Inventory/booking operations | P1 | Travel API/roles | CODEX ONLY | L |
| Household | Home/members | Backend partial, pages missing | Household shell/list/detail | P1 | Household API | CODEX ONLY | M |
| Household | Invite/access/transfer/lifecycle | Missing UI | Complete permission workflows | P1 | PetAccess/Household | CODEX ONLY | L |
| Account | Settings/security/privacy | Missing | Pages and operations | P1 | Users/Auth | CODEX ONLY | L |
| Subscription | Membership lifecycle | Partial | Billing/renewal/cancel/proration acceptance | P1 | Payments | CODEX ONLY | L |
| Commerce | Repeat delivery | Missing | Customer and seller recurring shipment flows | P1 | Subscription/Orders | CODEX ONLY | L |
| Services | Vet-only discovery | Partial | Enforce VET category | P1 | Provider data | CODEX ONLY | S |
| CRM | CRM workspace | Sample-only | Persistent backend/actions | P1 | New CRM domain | CODEX ONLY | L |
| Customer Affairs | Operations workspace | Sample-only | Persistent backend/actions | P1 | Support/CRM domain | CODEX ONLY | L |
| Admin Partners | Partner detail/verification | Missing | Queue/detail/evidence/action/history | P1 | Admin/roles/audit | CODEX ONLY | L |
| Admin Commerce | Products/orders | Missing | Catalog/order operations | P1 | Commerce/admin | CODEX ONLY | L |
| Admin Services | Services/bookings | Missing | Operations pages | P1 | Services/booking/admin | CODEX ONLY | L |
| Admin Verticals | Travel/insurance/places | Missing | Operations pages | P1 | Domain admin APIs | CODEX ONLY | L |
| Admin Trust | Animal support/community | Missing | Moderation/review pages | P1 | Domain admin APIs | CODEX ONLY | L |
| Admin Finance | Unified overview/incidents | Fragmented | Dashboard and incident workflow | P1 | Payments/ledger | CODEX ONLY | M |
| Access Control | Roles/permissions | Guards exist, UI absent | Admin management surface | P1 | Auth/admin/audit | CODEX ONLY | L |
| Integrations | Status/config/replay | Missing | Operational integration console | P1 | All adapters | CODEX ONLY | L |
| Insurance | Partner portal | Missing | Product/application operations | P1 | Insurance roles/APIs | CODEX ONLY | L |
| Animal Support | Shelter/NGO portal | Missing | Organization/campaign/need operations | P1 | Animal Support roles | CODEX ONLY | L |
| AI | Assistant page | Placeholder | Defined safe capability or remove route | P1 | Product/AI backend | CODEX ONLY | L |
| Visual system | Canonical page acceptance | No route accepted | Approve 15 reference pages | P1 | Supplied screenshots | CODEX ONLY | L |
| Admin UI | Dashboard/navigation | Renders, major mismatch | Sidebar density, overflow, layout | P1 | Operational pattern | CODEX ONLY | M |
| Dynamic routes | 69 ID routes | Source exists | Seeded smoke/action/role acceptance | P1 | Test fixtures | CODEX ONLY | L |
| Provider OS | Full portal acceptance | Core routes exist | Responsive/roles/states/onboarding | P1 | Provider API/data | CODEX ONLY | L |
| Seller OS | Full portal acceptance | Core routes exist | External channels, states, responsive | P1 | Marketplace adapters | CODEX ONLY | L |
| Help | FAQ/legal/contact/help center | Missing | Public content/forms/states | P2 | Approved copy | CODEX ONLY | M |
| Search | Global search | Missing | Cross-domain search UI/API contract | P2 | Search strategy | CODEX ONLY | L |
| Analytics | Product/admin analytics | Missing | Metrics/events/dashboards | P2 | KPI definitions | CODEX ONLY | L |
| SEO | Sitemap/robots/metadata | Landing metadata only | Technical SEO suite | P2 | Public route policy | CODEX ONLY | M |
| Responsive | Full breakpoint matrix | Sampled only | 360/390/768/1024/wide acceptance | P2 | Canonical patterns | CODEX ONLY | L |
| RTL/LTR | Full direction matrix | Sampled only | Dense/dynamic/calendar/table acceptance | P2 | Canonical patterns | CODEX ONLY | L |
| Accessibility | Keyboard/focus/semantics | Partial | Automated/manual acceptance | P2 | Shared components | CODEX ONLY | L |
| Performance | Budgets/CWV/load | Missing | Lighthouse, image, bundle, API load gates | P2 | Production-like data | CODEX ONLY | M |
| Tests | API integration | 36 tests / 6 suites | High-risk controller/service coverage | P1 | Test DB/Redis | CODEX ONLY | L |
| Tests | Visual regression | Missing | Canonical and inherited screenshot suite | P2 | Approved references | CODEX ONLY | L |
| Localization | FA/EN completeness | Partial | Copy, formats, calendars, truncation | P2 | Content review | CODEX ONLY | L |
| Landing | Final motion/polish | Strong, visual B | Reduced motion/low-height/perf acceptance | P3 | Performance budget | CODEX ONLY | S |

## Audit conclusion

The project has enough real code to justify continuing from the current repository. It does not need a restart. It does need a stricter release sequence: close security and CI first, decide which external integrations are truly in GA, approve a small canonical design set, then propagate patterns through the existing route inventory. The route registry should be updated after every completion batch; a page moves to function A or visual A only after its actions, states, roles, directions and breakpoints are accepted.
