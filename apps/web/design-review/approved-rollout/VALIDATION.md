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

## KYC policy and clinic plan checkpoint (2026-10-16)

Owner explicitly authorized backend KYC implementation. The previous protected-API statement applies to the earlier frontend checkpoint only. This checkpoint changes PartnerVerificationService and related tests, with no Prisma schema/migration or deploy/workflow changes.

- Internal policy unit tests: 17 passed.
- Relevant web suite (verification portals/admin/checklist + clinic plans/workspace): 18 passed / 5 files.
- KYC browser: 16 fa/en × 390/1440 checks passed with controlled responses and updated checklist captures.
- Root lint passed at the KYC-policy checkpoint; clinic plan additions subsequently passed relevant tests. No complete final lint/typecheck/full-suite pass is claimed for all later edits.
- Native Prisma generation remains blocked by official binary/checksum HTTP 403. Official WASM DMMF and generator experiments did not produce a usable client; no fake declarations or checksum bypass was used. API integration tests and full API types remain unverified.
- No database, migration, deployment or live upload was performed. Source changes are checkpointed separately before starting remaining support operations from the current main line.


## اصلاح طراحی وظایف ادمین — ۱۷ اکتبر ۲۰۲۶

مسیر `/[locale]/admin/tasks` با دادهٔ قرارداد موجود بازطراحی شد: عنوان و شرح خوانا، مسئول، مهلت با تقویم محلی، اولویت و منشأ کار. نقص قابل تکرار قبل: وضعیت BLOCKED در هر دو زبان ترجمه نداشت و خطای MISSING_MESSAGE می‌داد. اکنون «نیازمند رفع مانع» نمایش داده می‌شود. خطای ساخت پیش‌نویس را نگه می‌دارد؛ نتیجهٔ نامطمئن موفقیت اعلام نمی‌شود و «بررسی فهرست» صرفاً GET است.

۱۲ آزمون در AdminTasksView و AdminShell، typecheck و lint (سه هشدار قبلی، صفر خطا) موفق. ۱۶ حالت Chromium بعد از اصلاح: فهرست، خالی، خطای ساخت و خطای تغییر وضعیت × فارسی/انگلیسی × ۳۹۰/۱۴۴۰. overflow، pageerror و console error غیرمنتظره صفر؛ پاسخ 503 عمداً در دو حالت خطا حفظ شده است. چهار تصویر قبل، خطای ترجمهٔ واقعی را ثبت می‌کنند.

- [قبل فارسی ۳۹۰](task-design-screenshots/before-fa-390.webp) / [بعد](task-design-screenshots/after-list-fa-390.webp)
- [قبل فارسی ۱۴۴۰](task-design-screenshots/before-fa-1440.webp) / [بعد](task-design-screenshots/after-list-fa-1440.webp)
- [بعد انگلیسی ۳۹۰](task-design-screenshots/after-list-en-390.webp) / [۱۴۴۰](task-design-screenshots/after-list-en-1440.webp)
- [شواهد ماشین‌خوان](task-design-screenshots/checks.json)، [هش منابع](task-design-screenshots/source-hashes.json)، [بازاجرای مرورگر](browser-admin-tasks.py)

بازاجرا: سرور وب توسعه با NEXT_PUBLIC_LOCAL_PREVIEW=0 و NEXT_PUBLIC_API_ORIGIN=http://localhost:4000؛ سپس QA_REPO_ROOT، QA_WEB_ORIGIN و QA_EVIDENCE_DIR و QA_MODE=list/create-error/status-error/empty را به اسکریپت بدهید. همهٔ مقصدهای شبکه loopback هستند و API در مرورگر با DTO مصنوعی جایگزین می‌شود؛ این شاهد اتصال واقعی API، احراز هویت زنده یا بررسی همهٔ ادمین نیست. هیچ عملیات زنده انجام نشد. پوستهٔ مشترک ادمین در این بسته تغییر نکرد؛ تخصیص کار/کارهای من یا CRM جدید پیاده‌سازی نشده‌اند. schema، migration، workflow و مجوزها تغییر نکرده‌اند.
