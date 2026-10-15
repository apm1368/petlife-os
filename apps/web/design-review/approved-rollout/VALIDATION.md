# Validation and release limits

Application code: `7208e85`, rebased onto `origin/stabilization/wave-1` at `f3bf0648761d665bb36f90f710eed2c14e1c0355`. Later commits contain documentation/review evidence and an AccountNav test update for the newly added clinic-notes link; application code is unchanged.

| Check | Result |
| --- | --- |
| Frozen install | Passed after rebase; lockfile unchanged. |
| Shared types build | Passed. |
| Root lint | Passed on final application code. Existing warnings retained; no weakened rules. |
| Web typecheck | Passed on final application code. |
| Root typecheck | Blocked in API by unavailable generated Prisma Client exports. Official engine/checksum downloads returned HTTP 403. No fabricated declarations or checksum/TLS bypass. |
| Final full web suite | 793 passed / 1 failed in 202 files. The sole failure was an outdated AccountNav expectation of 8 links after adding the ninth clinic-notes link. Updated the exact count to 9 and added an explicit assertion for the new destination. Targeted AccountNav + MemberClinicNotes rerun: 4/4 passed. No subsequent complete-suite green run is claimed. |
| Earlier full suite | 767 tests / 196 files passed before the final KYC/access/clinic additions. A later two-worker run had 782 passes and one SellerTeam timeout; it was not a green run. Unchanged SellerTeam passed in isolation. |
| New targeted regressions | KYC, access, consent, clinic tags, household notes, assignment, subscription reload and day-only date formatting passed. |
| Fresh controlled browser checks | 128 passed: KYC 16, external admin/access 36, external public travel 16, health depth 20, clinic operations 24, clinic extras 16. Each includes fa/en at 390/1440; no horizontal overflow or uncaught page errors. |
| Protected paths | No branch changes in API/prisma, workflows, scripts, deploy files, AdminShell navigation or admin CRM/customer-affairs. |

Browser captures use controlled API fixtures. They are not live backend, role-completeness or every-route certification. No real payment, notification, message, document upload or source synchronization occurred. API migrations and deployment were not run.

## Functional evidence

- KYC: organization and document decisions are separate; initial approval requires accepted unexpired evidence. Private links require a reason and are temporary. Upload acknowledgment and permissions are checked. This is manual organization verification, not official identity/licence lookup.
- Clinic: staff/resource assignment sends only changed fields; explicit unassignment is distinct from keeping a field. Customer tags use actual server responses. Shared notes show only server-returned household-visible notes; internal notes remain private. Task refresh does not reset subscription loading or cause redundant requests.
- Health: clinical provenance is respected; sharing is limited to selected records. Existing upstream source protection is consumed, not reimplemented.
- Travel: date-only price windows retain their calendar day; unknown values are not displayed as zero. External listings do not imply a completed booking/payment.
- Commerce: cart images use the actual nullable media returned by the upstream API; no unrelated substitute image.
- Permission, loading, empty and error states remain separate. No tests were skipped or assertions/timeouts weakened.

## Delivery limits

GitHub push authentication is unavailable in this environment. No PR, board update, merge or deployment has been performed. Local commits and exported bundles must not be described as published. Full API/UI completion remains unverified; static coverage candidates require manual disposition. Backend gaps are listed in BACKEND-HANDOFF.fa.md, while existing API frontend work is tracked separately in API-DISPOSITIONS.md.
