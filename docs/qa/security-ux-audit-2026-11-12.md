# Full-site security, function, language and UX audit — 2026-11-12

Scope: the whole site except the admin back office UI (admin API authorization was still checked). Code at
`b04c4966` (main), live site https://opetlife.ir, all four locales (fa/en/de/es).

## How it was tested

- **Code review**, four parallel read-only passes: auth/session, authorization (≈1,130 routes / 157 controllers),
  input handling (uploads, SSRF, injection, payments, webhooks, logging, secrets), and the Next.js front end.
- **Live probing** (GETs only): response headers, exposed files (`.env`, `.git`, source maps, swagger…), cookie
  flags, public API payloads, the image optimizer, listening ports and firewall, nginx config.
- **HTTP crawl** of 617 non-admin URLs in four locales (status, `lang`/`dir`, untranslated keys, Persian on
  Latin pages and the reverse, de/es strings identical to English). All 617 answered 200 (one expected 308).
- **Browser pass** (Playwright, 35 pages × 4 locales × mobile 390px + desktop 1366px = 280 loads): page errors,
  console errors, failed requests, horizontal overflow, broken images, axe WCAG 2 A/AA (serious/critical).
- **Catalog check** of `messages/{de,es}.json` against `en.json`, and of inline fa/en copy in components.
- Live database read-only checks (counts only): seed accounts, stored photo metadata.

## Fixed in this change

| Severity | Finding | Fix |
|---|---|---|
| High | **Phone pre-account takeover.** A phone typed at password sign-up was trusted: when the real owner later signed in by SMS they landed in the stranger's account, whose password and sessions stayed valid. | `releaseUnprovenContact` + `markContactVerified` now treat phone exactly like email: first proof clears the unproven password, revokes sessions and reset links; a contact typed into an account whose *other* contact someone else proved is taken off it and the prover gets their own account (OTP and Google). e2e: `batch8-account` (2 new cases). |
| High | **Class-level permission decorators were ignored.** `PetAccessGuard`, `SellerAuthGuard` (and `ProviderAuthGuard`/`AdminAuthGuard`) read metadata from the handler only, so `@RequirePetAccess("canManageAccess")` on `PetAccessController` and `@RequireSellerRole(FINANCE/CATALOG_MANAGER)` on seller finance/catalog-request controllers did nothing: anyone with any grant on a pet could list and revoke all its access grants. | `getAllAndOverride([handler, class])` in all four guards; `revokeGrant` re-checks `canManageAccess`. e2e: `pet-access-self-escalation` (new case). |
| Medium | Session/CSRF/OAuth cookies had no `Secure` flag on the live site (it runs `NODE_ENV=development`). | `useSecureCookies()` — `Secure` whenever `WEB_APP_ORIGIN` is https (or `NODE_ENV=production`). |
| Medium | Dev OTP provider / dev password reset wrote codes and reset tokens to the PM2 log on the live server. | `isLiveDeployment()` (NODE_ENV, `DEPLOYMENT_ENVIRONMENT=production`, or a public https origin) — never logged there. |
| Medium | OTP check-then-act races (concurrent requests → many SMS, many guesses), contact-change and deletion codes bypassed the per-number budgets (SMS bombing at 120/h), codes were not bound to their purpose, and anyone could lock a number out by posting wrong codes when none was outstanding. | New `OtpService` + `OtpCodeStore`: cooldown claimed with `SET NX` before sending, hourly send budget counted atomically for every purpose, attempts checked and spent in one Lua script, codes keyed by purpose + account, failures only counted against a live code. Providers only deliver. Unit + e2e (`security-rate-limit`, 2 new cases). |
| Medium | `/_next/image` was an open proxy (`remotePatterns: https://**` and `http://localhost`): unauthenticated port probing of `localhost:4000` (confirmed live: 400 vs 500) and image re-encoding DoS. | No `remotePatterns` (every remote image already uses `unoptimized`), `qualities: [75]`. |
| Medium | Photos were stored with EXIF/XMP (GPS of the owner's home, device ids) and served publicly; any bytes could be hosted under an image key. | `image-metadata.util.ts` strips EXIF/XMP/text chunks from JPEG/PNG/WebP without re-encoding (JPEG keeps a minimal Orientation tag); non-images under an image key are refused (415). Dry run on all 211 stored photos: all accepted, none contained EXIF. |
| Medium | Travel: household membership was treated as access to every pet — trips, vaccination/travel document titles and insurance of a pet the member has no grant on, and sharing its medical documents with a host. | Trip hub/list require `canViewIdentity`; documents/insurance and document sharing require `canViewHealth`; booking holds require visibility of every pet. |
| Medium | Seller ADMIN could promote themselves to OWNER and demote/remove the real owner, or re-invite the owner at a lower role. | Only an OWNER may grant, change or remove OWNER. Unit spec. |
| Low | Stored `javascript:` URL in travel requirement `sourceUrl` rendered as a link to household members and staff. | DTO accepts only http(s); `externalHref()` guard on every data-driven external link touched. |
| Low | Bearer tokens (invites, pet cards, health shares, downloads) and query strings written to request logs. | Logger writes the route template (`/health-shares/:token`). |
| Low | Card-transfer idempotent replay could return another member's payment row. | Replay scoped to the caller; foreign key → conflict. |
| Low | No password length ceiling on register/change/reset (Argon2id 64 MiB per hash). | 200 chars, same as sign-in. |
| Low | Web client accepted API paths with `..`/`%2e%2e`/`#`/`\` from decoded route params (one-link CSRF shape). | `assertSafeApiPath()` in `apiFetch`. |
| Low | CMS links `/\host` treated as internal. | API `isSafeHref` and the renderer treat `/\` like `//`. |
| Low | `X-Powered-By: Next.js`; CSP without `object-src`/`base-uri`. | `poweredByHeader: false`; `object-src 'none'; base-uri 'self'` added (no script restrictions, as before). |
| Low | Demo places counted with `NODE_ENV` only. | Uses the shared demo-record rule. |

### Language and UX fixed

- **795 member/public message keys** were missing from `de.json`/`es.json` (German and Spanish visitors saw
  English): support needs, health, onboarding, health shares, services, vet booking, pets, places, community,
  bookings, landing, insurance, care calendar… All added (ICU-validated, informal du/tú, existing terminology).
  Partner panels (seller/vet/provider/clinic) and admin namespaces (≈870 keys) were left for a later pass.
- **German/Spanish visitors were shown Persian** in: the animal-support section nav, the *Add a pet* form, the
  public pet card (QR / emergency page — its "reported lost" link also pointed to `/fa`), clinic invitations, and
  pet identity labels. Fixed with de/es copy (or English where the copy is still fa/en only).
- Blog byline «تحریریهٔ اپت‌لایف · opetlife editorial» appeared in Persian on en/de/es articles, cards, metadata and
  JSON-LD → `localizedAuthorName()` shows the Latin half outside `/fa`.
- Broken provider cover images (demo rows point at files removed in the redesign) now fall back to the monogram;
  the seed no longer references them.
- Browser pass: **no page errors, no horizontal overflow** on any of the 280 loads; the only console error is the
  expected 401 from `/api/auth/session` for anonymous visitors.

## Open items

Findings that are not fixed by this change (configuration and product decisions, and items that need new UI)
were reported to the owner directly rather than in this public repository.
