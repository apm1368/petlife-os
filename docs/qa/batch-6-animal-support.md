# Batch 6 — Lost Pet, Animal Support, Donations, NGO/Shelter, Community and Trust & Safety QA record

Branch `claude/batch-6-animal-support` from `b190f68`; Batch 8 (`f539f92`, live and canonical) merged in `bbd6bde` before the admin console. Sub-batches are separate commits.

| Sub-batch | Commit |
|---|---|
| 6A Audit + Lost Pet + public location privacy | `cb11496` |
| 6B Animal Support offers, fulfilment, pause, expiry | `a2ab70b` |
| 6C Donations: ledger, idempotency, refunds, receipts | `35954ee` |
| 6D NGO / Shelter operations portal and roles | `188b51e` |
| 6E Community privacy, search, one report queue | `cff6c7d` |
| 6F Real, reversible Trust & Safety effects | `7bdbf10` |
| Merge of integration/local (Batch 8) | `bbd6bde` |
| Storage privacy hardening | `4c221e4` |
| 6G Admin console | `b37c75f` |
| 6H QA seed, security regression, release fixes | `f2ed0e1`, `ecac0c6`, `cabcbe7` + this record |

## Grade scale used in the route registry
- **A / A** — behaviour covered by automated tests; on the isolated preview (seed-batch6) fa at 1440/1024/768/430/390/360 and en checked: no horizontal overflow, no stuck skeleton, no page errors, axe WCAG 2.1 A/AA clean at 1440 and 390.
- **A / B** — function as above; visually checked fa+en at 1440/390, or fa only.
- **B / C** — no browser evidence gathered in this batch.

## Audit findings fixed (6A–6H)
**Privacy**
- Public lost-pet, support-need, organization and rescue-case APIs returned exact latitude/longitude; the public lost-pet payload also carried the private address, private notes, household and creator ids. Public payloads now carry an intentional public area only; exact location is returned to the household/publisher, and to admins only through an audited `customer.pii.reveal`.
- Sharing a lost pet to the community copied the private address into the public post.
- Anonymous sighting-photo upload URLs were issued for closed incidents.
- Community posts exposed author account ids and pet ids; authors now appear by first name, ids only to the author.
- Public donor lists used the donor's account name; only a name the donor chose is shown, anonymous by default.
- NGO verification documents (`animal-support-verification/`) were missing from the private prefixes, so with the local storage driver (used live) they were reachable at a permanent `/uploads/…` URL. The static-route guard now also normalises dot segments, repeated slashes, backslashes and encodings.
- Members received each other's contacts in household payloads (fixed with Batch 8).

**Financial integrity**
- Donations did not post the cash leg (payment captured → clearing) — the clearing account never balanced.
- Admin "refund" marked a donation refunded without calling the gateway; refunds now go through the gateway and reverse both ledgers only on success, once.
- A donation idempotency key could be replayed for another donor or campaign; concurrent retries could double charge.
- Restricted donations could be linked to another organization's campaign.
- Order-less refunds (donations) triggered the commerce refund listener with a null order id (error logged on every donation refund); donors were never told about a refund.
- Public donor amounts were shown in raw rial with Latin digits (10× the Toman figure used everywhere else).

**Authorization**
- Anyone could publish a need in a verified organization's name or point it at another organization's campaign.
- Staff could offer help on their own organization's listing.
- Trust & Safety actions on support needs, lost-pet incidents, sightings and organizations only recorded a row; they now change the subject (see effects) and can be restored once to the exact prior state.

**Broken behaviour**
- Direct "reunited" failed with a 500 (DB check required `foundAt`).
- `payment.failed` notifications linked to `/checkout/:id`, a route with no page; now the cart.
- Several `/login` links (404) and missing `bg-surface-muted` token.

## Automated gates
| Gate | Result |
|---|---|
| `batch6-animal-support.e2e-spec.ts` | 35 / 35 — location privacy (public vs owner/operator, forged ids); lost-pet reunion, sightings deep link, admin reveal/close audit; offer → accept → in progress → partial → pause/resume → complete; decline/cancel; deadlines and one-time warning; discovery sort/filter; donation ledger legs, donor names, idempotency and concurrency, restricted linkage, gateway refund + donor notice; NGO publish-as-org, coordinator/owner/viewer, portal donations without identity, private verification documents; community author privacy, search, duplicate reports, one queue, sighting reports; T&S remove/restore exact state, org suspend pauses live requests, incident close keeps the pet, community restrict/restore; admin console overview/donations RBAC; **6H**: forged-id sweep (incident, sighting, need, offer, donation, organization, membership, report, case — nothing changes), NGO roles, public payload privacy sweep, admin permission separation, re-report after resolution, listeners registered once, every notification deep link resolves to a page |
| Full API e2e (17 suites) | 548 / 548 (includes Batch 8's 23; the older classifieds suite was updated for two intended Batch 6 rules: automatic fulfilment and staff-only publishing) |
| API unit | 54 / 54 (incl. private upload-path guard) |
| Web tests | 136 files / 482 tests |
| Workspace typecheck / lint / production build | green (lint: 4 pre-existing `<img>` warnings) |
| Fresh database | 46 migrations from zero; schema diff only the known PostGIS index |
| Upgrade | copy of the live database (`f539f92`, Batch 8 migrations applied) + the six Batch 6 migrations: applied cleanly, no unvalidated constraints, only drop is the replaced report-target check; live has no Batch 6 domain rows, so no backfill is needed |

## Isolated preview (mutation QA — never live)
API `:4100` + web `:3100` on `petlife_b6_qa_test` (Redis DB 10, own storage dir). `seed-batch6.ts` runs only on `*_test` (or a named staging DB), is idempotent (ran twice on a fresh DB), and drives every side effect through the real services: donations through the sandbox payment path, the refund through the gateway refund path, moderation through `TrustActionService`. Result: 5 organizations (verified, pending, needs-info, suspended by a real T&S action, rescue) with OWNER/COORDINATOR/VIEWER staff; 6 needs (published, paused, partially fulfilled, fulfilled, expired, one paused by the suspension); offers pending/accepted/in progress/declined/completed; incidents searching/sighting reported/reunited/closed with 4 sightings (submitted, accepted, rejected); 5 posts with comments and reactions; 4 donations (general, restricted, anonymous, public; one refunded); reports open/escalated/resolved/dismissed; cases with remove→restore history, a suspension and an open case. Ledger: 0 unbalanced transactions; cash 105,000,000 IRR = donations less the refund; clearing 0.

### Browser matrix (Playwright + axe-core 4)
- 15 canonical pages in fa at 1440/1024/768/430/390/360 (90 checks) and 6 of them in en at all six widths (36): after fixes 0 axe violations, 0 overflow, 0 stuck skeletons, 0 page errors, correct `dir`.
- 18 further routes (owner incident, manage need, my help, my needs, receipt, NGO needs/offers/donations/team/verification, admin organizations/organization/donations/lost pets/lost-pet detail/need detail, new post, campaigns) in fa and en at 1440/390 (72 checks): same result.
- Browser console shows only the expected 401 (anonymous session probe) and 403 (NGO portal probe for non-members).
- Keyboard: report panel (Tab → Enter expands, reason select, visible focus), donation (preset → Continue → review with amount, recipient, type, display, sandbox note, Back / Pay), moderation reason gate (Escalate → reason field).

### Findings fixed during browser QA
WCAG contrast of the light-theme attention (2.7:1 → 5.1:1) and higher-concern (3.4:1 → 5.2:1) tokens and mint links; unlabeled photo inputs; unnamed campaign progress bar; invalid list markup in the NGO overview; non-focusable NGO donations scroll region; lost-pet detail overflow at 360/390; admin organization overflow at 390; donor amounts in raw rial.

## Known limits (documented, not faked)
- Payments are sandbox only (BLOCKED_EXTERNAL); partner payouts to organizations are recorded, not transferred.
- SMS delivery is not configured (in-app notifications only).
- No map provider: public locations are an approximate area text, never a pin.
- Rescue-case evidence and campaign updates exist in the API; their public presentation is minimal.
- Trust case detail shows raw status/reason codes and a before → after JSON line (operator view, Visual B).

## Release and live QA (2026-09-30)
- Pre-release backup: `/root/petlife-backups/release-b6-20260930-191404/petlife_os.dump` (pg_dump -Fc, 212 tables verified readable) + `ROLLBACK.md`.
- `integration/local` fast-forwarded `f539f92 → b9906e7` (Batch 7 had not landed; Batch 8 was already merged into this branch).
- CI run `36764257079`: success. Deploy run `36764257491`: gate job success, deploy success (19:24:43Z).
- Live `/var/www/petlife-os` at `b9906e7`; `GET /api/health/live` → 200; `prisma migrate status` → 46 migrations, up to date; the six `20260930000*_batch6_*` migrations finished. pm2: petlife-api 147 MB, petlife-web 87 MB online. (The background CI poller was reaped for low memory during the on-host build; the release was unaffected.)

### LIVE READ-ONLY QA (no sign-in, nothing created)
| Surface | fa 1440 | fa 390 | en 1440 | en 390 |
|---|---|---|---|---|
| Lost pets list — honest empty state | ok | ok | ok | ok |
| Unknown lost pet — "this report isn't available" | ok | ok | ok | ok |
| Organizations, needs, campaigns — empty states | ok | ok | ok | ok |
| Community — empty state | ok | ok | ok | ok |
| `/ngo`, `/admin/animal-support` signed out → `/welcome?returnTo=…` | ok | ok | ok | ok |
| My listings signed out → sign-in prompt | ok | ok | ok | ok |

All 200, correct `dir`, 0 overflow, 0 stuck skeletons, no page errors. API: public lists (lost pets, needs, organizations, posts) return no coordinates; `/ngo/overview`, `/animal-support/needs/mine`, `/me/donations`, admin overview and report queue → 401; `/uploads/animal-support-verification/…` incl. `./`, `../`, `%2e` and `/api/uploads/…` variants → 404.

### Found in live QA (carried into the final hardening task)
- An unknown support-listing id shows an error box titled "Loading" with the raw message "Listing not found." and a Retry button, instead of a not-found state (the lost-pet page handles this correctly). P1/P2 error-state defect; no data or security impact.

ISOLATED PREVIEW MUTATION QA is recorded above (seed-batch6 on `petlife_b6_qa_test`); nothing was created on production.
