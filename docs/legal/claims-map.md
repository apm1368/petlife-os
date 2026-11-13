# Legal claims ↔ reality map

> **وضعیت:** پیش‌نویس — نیازمند بررسی حقوقی مالک. این جدول هر ادعای مهم «قوانین و مقررات»، «حریم خصوصی» و «سوالات متداول» را به تصمیم تأییدشده، رفتار واقعی سامانه (مسیر کد) و مسئول عملیاتی آن وصل می‌کند. هر جا سامانه یا تیم امروز نمی‌تواند وعدهٔ متن را عملی کند، متن زنده اصلاح شده است (ستون «وضعیت»).
>
> **Status:** draft, needs the owner's legal review. Texts live in `apps/web/content/legal/{terms,privacy,faq}.{fa,en,de,es,ar,nl}.json` and are served at `/{locale}/legal/terms`, `/{locale}/legal/privacy` and `/{locale}/help/faq` until the owner publishes a reviewed version in Admin → Help center → Legal. Decision ids refer to `docs/decisions.md` (Persian governs) / `docs/decisions.en.md`.

Status legend: **✅ true** — the system does this today · **✏️ corrected** — the live text was changed in this PR to match what the system/team can actually do · **⚖️ lawyer** — true to the system, but the policy itself needs legal confirmation · **🧑‍💼 operational** — no code enforces it; a team must do it by hand.

Operational owners are roles, not people: **Support**, **Finance**, **Trust & Safety (T&S)**, **Partner verification**, **Engineering**, **Owner** (legal/policy decisions).

## Accounts and partners

| # | Shown text (en, short) | Where | Decision | System behaviour (code) | Owner | Status |
|---|---|---|---|---|---|---|
| A1 | Sign-up with mobile + one-time code; password or Google where available | Terms §3, FAQ | ON-01 | `auth.service.ts` creates the account on first valid OTP; password signup behind `auth.passwordSignupEnabled`; Google behind a flag (not configured) | Engineering | ✅ |
| A2 | You must be 18+ for your own account; children only via a parent's household | Terms §3, Privacy §12 | ID-18 (GC-04 says 16 for the global edition) | No birth date in `User`; not enforced in code — a user obligation | Owner | 🧑‍💼 ⚖️ (16 vs 18 for the global edition) |
| A3 | Household owner approves every invitation | Terms §3, FAQ | ID-21 | `households.service.ts` — invitations need owner approval, expire after 7 days | Engineering | ✅ |
| A4 | Partners pass identity/business checks before going live | Terms §5, FAQ | KYC decisions | Booking refuses unverified orgs (`bookings.service.ts` `verificationStatus !== "VERIFIED"`), discovery and catalog list only VERIFIED (`discovery.service.ts`, `catalog.service.ts`) | Partner verification | ✅ |
| A5 | Documents reviewed within 24 working hours | Terms §5, FAQ | — | `partner-verification.service.ts` SLA 24 working hours (queue target, not a guarantee) | Partner verification | ✅ (phrased "we aim to") |
| A6 | Reminder before a document expires; may pause | Terms §5 | — | `partner-document-expiry.worker.ts` hourly, 30-day alerts; **no automatic suspension** | Partner verification | 🧑‍💼 (pausing is manual) |
| A7 | Only a verified organisation can claim an unverified listing | Terms §5, FAQ | #304 owner rules | `place-claims.service.ts` requires VERIFIED org | T&S | ✅ |

## Bookings, pet taxi, orders

| # | Shown text | Where | Decision | System behaviour | Owner | Status |
|---|---|---|---|---|---|---|
| B1 | Cancellation terms (free hours, late refund %) shown before booking and frozen on the booking | Terms §6, FAQ | B-* | `freeCancellationHours` / `lateCancellationRefundPercent` snapshotted on the booking (`schema.prisma`), applied in `booking-lifecycle.service.ts` | Engineering | ✅ |
| B2 | Provider cancels → full refund; late → shown % | Terms §6, FAQ | — | `booking-lifecycle.service.ts` records the refund as REQUESTED for finance | Finance | ✅ (finance executes) |
| B3 | No-show: no automatic refund; partner no-show reviewed by support | Terms §6, FAQ | — | `provider-bookings.service.ts` "never refunds automatically"; member report moves no money | Support | ✅ |
| B4 | Ways to pay shown at checkout, incl. paying the partner directly | Terms §9 | **B-02 says on-site payment is not allowed** | `paymentMode` defaults to `PAY_AT_PROVIDER` | Owner | ⚖️ code ≠ decision; text describes reality |
| B5 | Health data to partners only as the service needs; ends 24 h after | Terms §6, Privacy §4, FAQ | — | `booking-pet-access.service.ts` per category; `ENV` 24 h | Engineering | ✅ |
| B6 | Vet-visit documents only when ticked, only the assigned vet, until 24 h after | Privacy §4 | #350 | `BookingDocumentPicker` + vet record access (#350) | Engineering | ✅ |
| B7 | Pet-taxi fare from city rates, never below minimum; pay driver on arrival | Terms §7, FAQ | — | `pet-taxi-fare.policy.ts`; online payment not enabled for rides | Engineering | ✅ |
| B8 | Pet-taxi locations kept roughly (~1 km) after 30 days | Terms §7, Privacy §5/§9 | — | `pet-taxi.service.ts` coarsening job | Engineering | ✅ |
| O1 | Cancel an order for a full refund before shipping | Terms §8, FAQ | O-* | `order-policy.ts` allows cancel while PENDING / AWAITING_SELLER_PREPARATION / READY_FOR_PICKUP | Finance | ✅ |
| O2 | Report damage / mismatch / expiry within **48 h of delivery**, with photos | Terms §8, FAQ | O-04, O-07 | `RETURN_WINDOW_HOURS = 48` from delivery; **conditions (photo, reason) are not checked by code — Finance reviews**; delivery is set by courier/shipment status (no 3-day auto-confirmation from O-04) | Finance | ⚖️ **48 h window vs the statutory right of withdrawal for distance purchases (Electronic Commerce Law)** — text keeps "nothing limits your statutory rights" |
| O3 | Refunds go back to the original method or the wallet; **finance reviews and processes every refund** | Terms §8, FAQ | **O-11 / S-12 say refunds go to the wallet** | `refunds.service.ts` calls the original gateway's refund; Zibal `supportsRefund: false`, so Finance handles it | Finance | ✏️ added "finance reviews and processes" · ⚖️ destination |
| O4 | No live-animal sales in the shop | Terms §8 | SH-14, M-10 | Not enforced in code; catalog moderation | T&S | 🧑‍💼 |
| O5 | The seller issues its own invoice; opetlife is an intermediary | Terms §4, FAQ | ER-02, SH-17 | Marketplace model (seller organisations) | Owner | ✅ |

## Payments and wallet

| # | Shown text | Where | Decision | System behaviour | Owner | Status |
|---|---|---|---|---|---|---|
| P1 | Card-to-card: receipt within 30 min; reviewed Sat–Wed 9–18, Thu 9–13 Tehran; bookings ≥ 24 h ahead | Terms §9, FAQ | AD-06 | `payment-infrastructure.policy.ts` | Finance | ✅ (review hours are a staffing commitment) |
| P2 | Overpayment → wallet; underpayment → 30 min to pay the rest | Terms §9, FAQ | — | `card-transfer-payment.service.ts` credits WITHDRAWABLE; `docs/payment-infrastructure.md` | Finance | ✅ |
| P3 | Two kinds of wallet credit; gift credit expires after 6 months | Terms §9, FAQ | — | `WalletBalanceType` WITHDRAWABLE / PURCHASE_ONLY; `wallet.service.ts` 6-month gift expiry | Finance | ✅ |
| P4 | **Refund credit cannot yet be paid out to a bank account in the app; Support → Finance reviews requests** | Terms §9, FAQ | — | No withdrawal endpoint (`wallet.controller.ts`) | Finance | ✏️ previously implied refund credit was "yours back"; now says payout is a manual review |
| P5 | Top-up 10,000–50,000,000 toman; ≤ 3 pending | Terms §9, FAQ | — | `wallet-top-up.policy.ts` (100,000–500,000,000 rial) | Finance | ✅ |
| P6 | Promotions automatic, not combinable, no codes | Terms §9 | — | `schema.prisma` promotion comment "Automatic, non-stacking… No codes" | Engineering | ✅ |
| P7 | Instalments by a third party when offered | Terms §9 | — | SnappPay / DigiPay adapters are stubs | Owner | ✅ ("when offered") |
| P8 | Gateways process online payments | Privacy §6 | — | `PAYMENT_SANDBOX_MODE` — gateways are **sandbox** today | Engineering / Owner | ✅ (no claim that online payment is live) |

## Community and content

| # | Shown text | Where | Decision | System behaviour | Owner | Status |
|---|---|---|---|---|---|---|
| C1 | **Posts appear straight away**; reports are reviewed | Terms §10 | **M-08 says review before publishing** | `CommunityPost.status @default(PUBLISHED)` | T&S | ⚖️ code ≠ decision; text describes reality |
| C2 | Lost-pet reports must be true; publish an area, not your address | Terms §10, FAQ | **M-09 says admin review, auto-publish after 2 h** | Published without a moderation step | T&S | ⚖️ code ≠ decision |
| C3 | Found-pet posts ≤ 3 a day | Terms §10, FAQ | #290 Q54 | `community-post.service.ts` | Engineering | ✅ |
| C4 | Area alerts: location rounded to ~1 km, never shown; radius ≤ 10 km | Terms §10, Privacy §5, FAQ | #290 Q53 | `lost-pet-area-alert.service.ts` | Engineering | ✅ |
| C5 | **Memorial: withdrawing removes it from opetlife pages straight away; the original photo stays in the pet's memories until deleted there; copies elsewhere are outside our control; stored image files deleted on request within 30 days** | Terms §10 | memorial workflow | `public-pet-memorial-workflow.md`: withdrawal revokes the memorial copy immediately; the source `PetMemory` image stays a public asset whose URL keeps working; CDN rules are outside the repo | T&S + Engineering | ✏️ previously "can withdraw it at any time" only. **30 days is a proposed service level — owner to confirm** |
| C6 | **Published photos are public files; hiding takes them off our pages, the file stays reachable by direct address until deleted; Support deletes on request within 30 days** | Privacy §11 | — | Public uploads (posts, lost pets, memories) are served by URL; private documents use short-lived signed links (`s3-storage.driver.ts`) | Support + Engineering | ✏️ added. **30 days — owner to confirm** |
| C7 | Reviews only after delivery / completed booking; checked before they appear | Terms §11 | — | `product-engagement.service.ts`, `provider-reviews.service.ts`; status PENDING | T&S | ✅ |

## Privacy, data and notifications

| # | Shown text | Where | Decision | System behaviour | Owner | Status |
|---|---|---|---|---|---|---|
| D1 | No national ID collected; card numbers/IBAN not collected | Privacy §2 | — | `User` model; card-to-card keeps masked company card + receipt image | Engineering | ✅ |
| D2 | Photo location data (EXIF/GPS) removed on upload | Privacy §2 | — | `image-metadata.util.ts` | Engineering | ✅ |
| D3 | Share links 1 h–7 days, sections picked, every opening logged, revocable | Privacy §4, FAQ | — | `health-share.service.ts` (salted IP hash + UA per read) | Engineering | ✅ |
| D4 | Vet share ≤ 90 days, verified clinic only, revocable | Privacy §4, FAQ | — | `vet-share.service.ts` | Engineering | ✅ |
| D5 | Third parties: Faraz SMS, own mail server, browser push, OSM tiles / Neshan / Google, insurers only with consent, Jajiga click logged | Privacy §6 | — | `ENV` providers; `insurance-application.service.ts` consent text; Jajiga click-out log | Engineering | ✅ |
| D6 | We never sell data; staff see only what their role needs; revealing full contact details needs a special permission and is logged | Privacy §6 | AD-03 (superadmin only) | `customer.pii.reveal` is held by ADMIN and TRUST_SAFETY, audited | Owner | ✅ (text doesn't claim superadmin-only; AD-03 differs) |
| D7 | Cookies: `petlife_session` 30 days, `petlife_csrf`, `petlife_oauth_state` 10 min, `NEXT_LOCALE`; no ad/analytics trackers | Privacy §7 | — | `session.service.ts`, `csrf.middleware.ts`, `auth-google.controller.ts`, next-intl; no tracker found | Engineering | ✅ |
| D18 | eNamad badge, when shown, loads from enamad.ir (sees your IP and that you are on opetlife) | Privacy §6 | — | `EnamadSeal.tsx`: fixed template from `trust.enamadId` + `trust.enamadCode` only (never stored HTML), `referrerpolicy=origin`, lazy; hidden unless `trust.enamadEnabled` and both values set | Engineering | ✅ (#380) |
| D19 | Social links are plain links; nothing loads from those networks until opened (keeps "no social-media tracking cookies" true) | Privacy §7 | — | `SocialIcons.tsx`: own inline SVGs, plain `<a target=_blank rel="noopener noreferrer me">`; shown iff `social.<net>Enabled !== false` and the https URL passes the server allowlist | Engineering | ✅ (#380) |
| D8 | Marketing off by default; security alerts can't be switched off; quiet hours 22–08 | Privacy §8, FAQ | NT-02, NT-10 | `notification-preference.service.ts`, `notification-orchestrator.service.ts` | Engineering | ✅ |
| D9 | Push: device address + keys; payload = category title + link; removed at sign-out | Privacy §8 | #303 | Web push (X5, #303) | Engineering | ✅ (per #303) |
| D10 | Android app: only INTERNET + POST_NOTIFICATIONS; offline cache = static files; no SDKs | Privacy §1 | #305 | TWA merged manifest (X5) | Engineering | ✅ (per #305) |
| D11 | Retention: sessions 30 d, exports 7 d, pet taxi 30 d then rough, server logs ~7 d, financial records as law requires | Privacy §9 | TC-03 (backups 30 d — not stated) | `ENV`, `account-export.service.ts`, `pet-taxi.service.ts`, `logrotate-petlife-pm2.conf` | Engineering | ✅ |
| D12 | **Account deletion: the request is recorded and reviewed, and carried out once the data-retention policy is published; we tell you when it is done** | Privacy §9–§10, FAQ | TC-20 (30 days), T-13, A-03 | Request states REQUESTED → PENDING_RETENTION → READY; **execution is disabled** (`privacy-governance.service.ts` "EXECUTION_DISABLED", `RETENTION_POLICY_APPROVED=false`) | Owner (publish the retention policy) + Engineering | ✏️ previously "we delete or anonymise"; now promises only what happens today |
| D13 | Export from Profile → Privacy, available 7 days | Privacy §10, FAQ | TC-20 (7 days) | `account-export.service.ts` | Engineering | ✅ |
| D20 | Place suggestions: name, category, city, address, map point, notes; only staff see who suggested it; once checked and listed, details and notes may be published, never the name; result told in the app | Privacy §2 | Owner request 2026-11-13 (#6) | `PlaceSuggestView.tsx` (#381, pin required, notes shown as public description); API `POST /place-suggestions` (members, 10/min, ≤ 10 pending); approval creates an UNVERIFIED unlisted place, listed only after staff verify (X3 admin tab); in-app notice on approve/reject | Trust & Safety | ✅ (#381 + admin tab) |
| D14 | Argon2id passwords, encrypted connections, scripts can't read sign-in cookies, private documents via short-lived links | Privacy §11 | E-03 (admin 2FA) | As stated; **no admin 2FA yet** (not claimed) | Engineering | ✅ |

## Support, changes, law

| # | Shown text | Where | Decision | System behaviour | Owner | Status |
|---|---|---|---|---|---|---|
| S1 | First answer within 24 working hours | Terms §16 | AD-06 | `setting-definitions.ts` SLA default 24 h | Support | ✅ ("we aim to") |
| S2 | 14 days' notice before important changes | Terms §17, Privacy §13 | NT-08 | No code; announce on the site + notification by hand | Owner | 🧑‍💼 |
| S3 | Governing law: Iran (Electronic Commerce Law, Consumer Rights Protection Law); statutory rights not limited | Terms §8, §18 | — | — | Owner | ⚖️ |
| S4 | Company name / registration / address via footer and Contact page | Terms §1, Privacy §1 | — | `site.footerNote`, `site.contact*` settings — **empty by default; the owner must fill them** | Owner | 🧑‍💼 |
| S5 | No precedence clause between language versions | — | GC-05 (English is the reference for legal text) | — | Owner | ⚖️ |

## Owner decisions this map asks for

1. **Retention policy** (D12): approve and publish it, then set `RETENTION_POLICY_APPROVED`. Until then the texts say requests are recorded and carried out after publication.
2. **File deletion service level** (C5, C6): confirm "within 30 days" or give another number.
3. **Refund destination** (O3) and **wallet payout** (P4): wallet-only (O-11/S-12) or original method; whether a bank payout process exists.
4. **Returns vs statutory withdrawal** (O2), **pay-at-provider vs B-02** (B4), **pre-moderation M-08/M-09** (C1, C2), **age 16 vs 18** (A2), **GC-05** (S5): legal review.
5. **Company details** (S4): fill the footer note and contact settings.
