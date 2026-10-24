# Final completion audit + cross-product hardening

Branch `claude/final-debug-hardening` from `integration/local` `b9906e7` (live, CI `36764257079` green).
Batch 7 (Codex: admin control plane, CMS, search, analytics, integrations, access control, audit UI, SEO)
had not landed on `integration/local` during this pass; no Batch 7 area was changed. Machine-readable grades:
[`matrix.json`](matrix.json). Tools: [`tools/`](tools/README.md).

## Method (evidence, not estimates)
| Evidence | Scope | Result |
|---|---|---|
| Unified QA database | every batch seed (2, 3, 4, 5, 6, 8) on one fresh `*_test` DB | all seeds compose; a second run leaves all 212 tables with identical row counts |
| Cross-domain IDOR suite (CI) `final-cross-domain-security.e2e-spec.ts` | every parametrised route of the running app; anonymous + unrelated account; ids from real rows; each GET proven readable by the row's real owner | ~145 routes proven; no private 2xx, no 5xx, no foreign mutation; fails on a reverted fix |
| Route crawl (Playwright) | 238 web routes × 1440/390 in fa (476 loads); after fixes 190 non-admin routes × 1440/390 in fa and en (760 loads) | 0 HTTP errors, 0 page errors, 0 API 5xx, 0 stuck skeletons, 0 overflow, correct `dir` everywhere |
| Browser smoke (preview) | 10 flows: OTP sign-in via UI, account, pet, health, services booking → pay, checkout → pay → order → cancel/refund, travel hold → pay, lost-pet report, animal-support offer + not-found, donation receipt | 10 / 10 |
| axe WCAG 2.1 A/AA | 18 touched pages × fa/en × 1440/390 (72 checks) | 4 distinct violations found and fixed; re-run 0 |
| Ledger invariants | main, seller and donation ledgers on the QA DB after all flows | 0 unbalanced transactions; every captured payment of the session is posted |
| Notification deep links | every distinct deep link produced by the e2e suites and QA seeds (36 shapes) | 36 / 36 resolve to a page |
| Domain events | QA, test and live DBs | 0 failed dispatches; unprocessed rows are Batch 2 audit records written by design |

## Found and fixed
**P0**
1. `POST /payments/reconcile/:id` and `/financing/reconcile/:id` accepted any signed-in user for any intent (trigger + read someone else's payment state) → payer only, 404 otherwise.
2. Private files re-attachable by key: a health-document / observation / memory key was taken from the client and later served back through a signed download, so anyone who had once seen a key (memory keys are in payloads; revoked members and vets) could attach it to their own pet and keep downloading → keys must sit under the pet they are attached to.
3. Stored 500 on public pages: one post referencing a private key (`health-documents/…`) made every read of the public community feed fail; same class on needs, lost pets, sightings, travel/place images, org media, evidence, insurer logos, memories → keys validated to the field's own minted shape; galleries drop (and log) a private key instead of failing.
4. Double charge: three simultaneous Pay taps on one service booking captured three charges (travel had the same race) → the charge claims its intent atomically before the gateway; booking/travel pay lock the booking and share one intent. Covers checkout, bookings, travel, subscriptions, donations.

**P1**
1. Support listing (and 39 other detail/list views) showed an error titled "Loading" with the raw API message and a Retry that could never succeed on 404/403 → canonical `LoadFailure` (not found / no access / access ended / sign-in with returnTo; Retry only for transient errors).
2. Row actions on six list views replaced the whole page with an error box → action errors inline.
3. Service-booking payments were never posted to the ledger (their refunds post a reversal) → posted like travel.
4. A booking paid after its payment window closed failed after capture with nothing recorded → payment recorded, full refund handed to finance.
5. Uploads streamed any size to disk (30 MB accepted on a 1 KB declaration) → capped at the declared size (ceiling 50 MB), partial file removed.
6. Live nginx has no `client_max_body_size` → every upload over 1 MB (phone photos, PDFs) is refused with 413 on live → `docs/ops/nginx-petlife-os.conf` raises only `/api/uploads/` (applied at release).
7. 43 date/amount renderings used the browser's locale (Gregorian dates, Latin digits on Persian pages) across memories, timeline, trips, lost pets, support, health, insurance, vet/provider/seller panels → `useInstantFormat()`.
8. Raw codes on health documents and record details (`LAB_REPORT`, `HOUSEHOLD_ONLY`, `ACTIVE`…), travel-partner providers (`TRAVEL_ACCOMMODATION`), seller order list.
9. Unlabeled file inputs (critical axe) on health documents, observations, trip requirements.

**P2 fixed**: body-parser errors answered 500 (now 413/400); account-export worker could build one export twice; unbounded public service search (capped at 100); plan limits / insurance numbers in Latin digits; memories link contrast; medication end date as raw ISO; QA seeds 3/4/5 created pets without the owner grant the product creates.

## Not changed (classified)
- **B — UX refinement**: clinical values (lab results, doses) keep Latin digits (medical readability — decide in UX phase); manage-listing page uses a plain empty state instead of the system-state component; a paused listing of a suspended organization stays reachable by direct link (Batch 6 design); pending travel listing answers an empty review list; operational panels (provider availability times, seller inventory counts) show Latin digits in edit fields.
- **C — visual polish**: four CMS `<img>` lint warnings (Batch 7 area).
- **D — BLOCKED_EXTERNAL**: real payment gateway/BNPL, SMS delivery, courier and marketplace integrations, map provider, partner payouts, Google sign-in — all sandbox/stub by design.
- **E — tech debt / future**: domain events dispatch in-request with no retry relay (0 failures observed); per-pet health/timeline lists are unpaginated (bounded by one pet's history); `ServiceViewed` writes a domain event per view; QA seed 4 writes captured payments without ledger legs (fixture only — real flows post).
- **Batch 7 (documented for Codex)**: admin audit, insurance, services, subscriptions and travel-requirement screens show raw codes and Latin digits; sitemap content.

## Full regression (branch head before release)
| Gate | Result |
|---|---|
| Workspace typecheck / lint / production build | green (lint: the 4 pre-existing CMS `<img>` warnings) |
| API unit | 11 suites, 56 / 56 |
| Full API e2e (fresh database) | 18 suites, 555 / 555 — includes the new cross-domain security suite and the booking/travel double-pay tests |
| Web | 137 files, 486 / 486 |
| Migration from zero | 46 migrations applied; schema diff only the known PostGIS index |
| Upgrade | copy of live restored to a `*_test` DB: already at 46, nothing pending — this release has no schema change |
| Browser smoke / crawl / axe | see Method above (preview, `petlife_final_qa_test`) |

## Release 1 and live read-only QA (2026-09-30)
- Backup before release: `/root/petlife-backups/release-final-20260930-223023` (pg_dump -Fc, 213 table-data entries readable; nginx site file; ROLLBACK.md). No schema change in this release.
- `integration/local` fast-forwarded `b9906e7 → 8e5a467` (Batch 7 had not landed). CI `36785976955` success; deploy `36785977264` (ci/build + deploy) success.
- Live `/var/www/petlife-os` at `8e5a467`; `/api/health/live` 200; 46 migrations, up to date; pm2 api + web online.
- nginx: `/api/uploads/` raised to 50 MB (`nginx -t` ok, reloaded). A 2 MB upload now reaches the API (was 413 at nginx); 60 MB still 413; other API paths keep 1 MB.
- LIVE READ-ONLY QA (anonymous, GET only, nothing created): 25 pages × fa/en × 1440/390 = 100 loads — all 200, 0 page errors, 0 overflow, 0 stuck skeletons, correct `dir`. Unknown support listing / campaign / post / insurance product / place → canonical "not found", no Retry, no raw API text (the defect that opened this pass). `/pets`, `/orders`, `/profile`, `/provider`, `/seller`, `/ngo`, `/admin` → sign-in.
- Found in live QA and fixed in the follow-up release: the places filter button read "Retry" (now "Search").
