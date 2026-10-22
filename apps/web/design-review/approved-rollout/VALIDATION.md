# Validation and release limits

## ویرایش نام مکان در ادمین — ۲۲ اکتبر ۲۰۲۶

صفحهٔ مکان‌های ادمین اکنون نام مکان را به‌صورت درون‌خطی با قرارداد موجود `PATCH /admin/places/:id` ویرایش می‌کند. بارگذاری تا مشخص‌شدن `places.view` آغاز نمی‌شود؛ کاربر فقط‌خواندنی هیچ کنترل نوشتن نمی‌بیند و ذخیره علاوه بر نمایش، هنگام کلیک نیز `places.manage` را بررسی می‌کند. نام خالی یا بیش از ۲۰۰ نویسه در مرورگر رد می‌شود و شکست ذخیره، متن تایپ‌شده را نگه می‌دارد. API، schema، migration، workflow، SMS و تنظیمات دامنه تغییر نکرده‌اند.

چهار تست کامپوننت رفتار مجوز، قرارداد PATCH، بازخوانی پس از موفقیت و حفظ پیش‌نویس در شکست را پوشش می‌دهند. شواهد مرورگر کنترل‌شده شامل چهار تصویر قبل و هشت تصویر بعد در fa/en × ۳۹۰/۱۴۴۰ برای نقش مدیر و فقط‌خواندنی است؛ overflow، pageerror، console error و درخواست شکست‌خورده صفر بود و payload مدیر دقیقاً فقط شامل `name` است.

- [قبل فارسی ۳۹۰](admin-places-rename-screenshots/before-manager-fa-390.webp) / [بعد مدیر](admin-places-rename-screenshots/after-manager-fa-390.webp) / [بعد فقط‌خواندنی](admin-places-rename-screenshots/after-readonly-fa-390.webp)
- [بعد مدیر انگلیسی ۱۴۴۰](admin-places-rename-screenshots/after-manager-en-1440.webp)، [نتایج بعد](admin-places-rename-screenshots/after-checks.json)، [نتایج قبل](admin-places-rename-screenshots/before-checks.json)، [بازاجرا](browser-admin-places-rename.py)

API و احراز هویت این شواهد fixture روی loopback هستند؛ بنابراین این بخش شاهد اتصال زنده یا استقرار production نیست. بازبینی بصری عمومی سایت نیز به‌دلیل redirect دارایی JS در origin فعلی همچنان gate مستقل انتشار است.


## خوانایی صف و مدارک همکاران — ۱۸ اکتبر ۲۰۲۶

کارت صف، وضعیت پرونده و چهار شمار مستقل مدارک را با دادهٔ موجود API نشان می‌دهد؛ زمان ارسال ناموجود «ثبت نشده» است. دکمهٔ بررسی حداقل ۴۴ پیکسل ارتفاع دارد. فهرست مدارک در ادمین و پورتال‌های خدمات‌دهنده/فروشنده، نوع و حجم فایل، اعتبار، زمان بررسی و دلیل رد را با برچسب مشخص نشان می‌دهد. زمان‌های ISO با formatter موجود و منطقهٔ تهران نمایش داده می‌شوند: `2026-10-15T21:00:00Z` در مرورگر UTC قبلاً ۲۳ مهر، ساعت ۲۱ بود؛ اکنون ۲۴ مهر، ساعت ۰:۳۰ است.

در قطع پاسخ تصمیم، نتیجه «تأیید نشده» است و توضیح باقی می‌ماند. دریافت دوبارهٔ وضعیت فقط GET است؛ اگر مدرک بررسی شده باشد، همان اقدام غیرفعال می‌شود. اگر هنوز منتظر باشد، تأیید صریح تازه لازم است. شکست GET هم توضیح را نگه می‌دارد و ارسال را باز نمی‌کند. این حفاظت رابط، تضمین عمومی exactly-once یا تغییر قرارداد سرور نیست.

۲۰ تست در چهار فایل partner-verification، typecheck، lint (سه هشدار قبلی، صفر خطا) و برابری کلیدهای fa/en گذشتند. ۴۰ حالت مرورگر بعد: سالم ۱۶، خالی ۴، خطای دریافت ۸، قطع پاسخ تصمیم ۴، بدون مجوز ۸؛ ۲۰ تصویر قبل نیز ثبت شده‌اند. هیچ overflow، pageerror یا console error غیرمنتظره دیده نشد. پاسخ‌های 503 کنترل‌شده حذف نشده‌اند. در هر قطع پاسخ، دقیقاً یک POST در mock و یک GET دستی پس از آن ثبت شد؛ بدون مجوز، درخواست پرونده و عملیات نوشتنی صفر است.

- [صف قبل، فارسی ۳۹۰](verification-design-screenshots/before-normal-queue-fa-390.webp) / [بعد](verification-design-screenshots/after-normal-queue-fa-390.webp)
- [صف فارسی ۱۴۴۰](verification-design-screenshots/after-normal-queue-fa-1440.webp)، [انگلیسی ۳۹۰](verification-design-screenshots/after-normal-queue-en-390.webp) / [۱۴۴۰](verification-design-screenshots/after-normal-queue-en-1440.webp)
- [پرونده فارسی ۳۹۰](verification-design-screenshots/after-normal-detail-fa-390.webp)، [حفظ توضیح پس از قطع پاسخ](verification-design-screenshots/after-save-error-detail-fa-390.webp)
- [پنل خدمات‌دهنده](verification-design-screenshots/after-normal-provider-fa-390.webp)، [پنل فروشنده](verification-design-screenshots/after-normal-seller-fa-390.webp)
- [مقایسه و ارزیابی بصری محدود همین بخش](design-qa.md)، [خروجی مرورگر](verification-design-screenshots/checks.json)، [هش منابع](verification-design-screenshots/source-hashes.json)، [بازاجرا](browser-verification-design.py)

بازاجرا: سرور Next توسعه با NEXT_PUBLIC_LOCAL_PREVIEW=0 و NEXT_PUBLIC_API_ORIGIN=http://localhost:4000؛ متغیرهای QA_REPO_ROOT، QA_WEB_ORIGIN، QA_EVIDENCE_DIR و QA_MODE=normal/empty/load-error/save-error/forbidden را به اسکریپت بدهید. Chromium با timezone=UTC و density=1، viewportهای 390/1440 × 1000؛ تصاویر full-page هستند. ابتدا تکمیل بارگذاری shell احرازشده انتظار کشیده می‌شود؛ timeout اولین اجرای سردِ harness پیش از تکمیل shell، موفق حساب نشده است. این اندازه‌گیری performance نسخهٔ production نیست.

API با DTO مصنوعی فقط روی loopback جایگزین شده؛ هیچ فایل خصوصی واقعی باز نشده و هیچ مدرک/تصمیم یا دادهٔ زنده ثبت نشده است. این بسته ادعای استعلام رسمی هویت، ارجاع کار به کارشناس، اتصال API زنده یا پذیرش همهٔ صفحات ندارد. مدل، migration، مجوز، workflow و مسیر انتشار تغییر نکرده‌اند. اصل تصویر «کوکی و دودی» در #45 با CI کامل در تثبیت `069cbfc467246f2e71ae3027410797769fb5fb20` ادغام شد؛ به صفحهٔ عمومی منتقل نشده است.


## تطبیق پوستهٔ واقعی ادمین با مرجع — ۱۷ اکتبر ۲۰۲۶

پوستهٔ LiveAdminShell از نوار تیرهٔ افقی به منوی کناری با رنگ‌های campaign و سربرگ روشنِ مرجع admin.webp تبدیل شد. لوگوی تأییدشدهٔ opetlife، نام/نقش واقعی حساب، گروه‌های ترجمه‌شده و منوی موبایل حفظ شدند. مسیر فعال به‌صورت خودکار در گروه باز می‌شود؛ کنترل دسترسی همان فهرست مجوزهای موجود است و CRM نمایشی همچنان پنهان است. هیچ مسیر، API، مجوز یا نقش جدید ایجاد نشد.

۷ تست ناوبری شامل کاربر فاقد دسترسی، مجوز خواندن مستقل، تغییر مسیر فعال و بسته‌شدن منوی موبایل؛ پس از یکپارچه‌سازی با #43، مجموع ۱۴ تست وظایف/پوسته گذشت. typecheck و lint موفق (سه هشدار قبلی). هشت حالت مرورگر قبل و هشت حالت بعد، fa/en × ۳۹۰/۱۴۴۰ × صفحه/منوی باز: بدون overflow، pageerror، console error یا پاسخ HTTP ناموفق؛ هیچ درخواست نوشتنی صادر نشد.

- [قبل فارسی ۳۹۰](admin-shell-screenshots/before-page-fa-390.webp) / [بعد](admin-shell-screenshots/after-page-fa-390.webp)
- [قبل فارسی ۱۴۴۰](admin-shell-screenshots/before-page-fa-1440.webp) / [بعد](admin-shell-screenshots/after-page-fa-1440.webp)
- [انگلیسی ۳۹۰](admin-shell-screenshots/after-page-en-390.webp) / [۱۴۴۰](admin-shell-screenshots/after-page-en-1440.webp)
- [منوی موبایل](admin-shell-screenshots/after-navigation-fa-390.webp)، [شواهد بعد](admin-shell-screenshots/after-checks.json)، [قبل](admin-shell-screenshots/before-checks.json)، [هش منابع](admin-shell-screenshots/source-hashes.json)

بازاجرا با browser-admin-shell.py و متغیرهای QA_REPO_ROOT، QA_WEB_ORIGIN و QA_EVIDENCE_DIR روی سرور توسعه. API با DTO مصنوعی در مرورگر فقط loopback جایگزین می‌شود؛ این شاهد احراز هویت/API زنده یا پذیرش همهٔ صفحات داخلی نیست. داده‌های نمونه در تصاویر، دادهٔ سایت نیستند. اولین اجرای محلی با bind به 127.0.0.1 در rewrite داخلی localhost خطای اتصال داد؛ پس از اجرای سرور تست با hostname=localhost هشت حالت کامل گذشت. هیچ تغییر شبکه، workflow، امنیت سرور یا دسترسی Claude انجام نشد.

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


## اشتراک خانواده‌ها — ۱۸ اکتبر

[اصلاح صفحه‌بندی، جداسازی پاسخ فیلتر و شواهد مرورگر](SUBSCRIPTION-LIST-VALIDATION.md). این نتیجه محدود به همین صفحه و fixture محلی است؛ CI، ادغام و انتشار مستقل‌اند.

## نمای پت — ۱۸ اکتبر

[حفظ قاب شیشه‌ای، خطای مراقبت و جداسازی پاسخ پت قبلی](../member-glass/README.md). تصاویر/JSON و ابزار بازاجرا در همان پوشهٔ member-glass ثبت می‌شوند؛ پوشش محدود به نمای پت و API مصنوعی loopback است.

## انتشارهای واقعی #48/#50 و شاهد مرورگر مستقل — ۱۸ اکتبر

کد اصلاحات ثبت پت/صفحات بررسی‌شده با #48 و اصلاح نمای پت با #50 از مسیر موجود منتشر شدند؛ آخرین API SHA=`3ba6fdfed343b4c9cb1413a2911f55490c7d01d9`، deploymentId=`github-39140816890-1`، database/redis up. نتیجهٔ job deploy، نسخه و GETهای فقط‌خواندنی مستقل ثبت شدند؛ [مسیر و شواهد انتشار](../../../../docs/ops/codex-access.fa.md).

محدودیت مرورگر محلی همچنان با پاسخ دارایی‌ها و hydration صفر ثبت است؛ برای شاهد مستقل، [PR #52](https://github.com/apm1368/petlife-os/pull/52) اسکریپت `scripts/qa-live-readonly.py` و workflow جداگانهٔ QA عمومی را اضافه می‌کند. workflow انتشار و CI موجود تغییر نمی‌کنند. این بررسی فقط همان origin عمومی و روش‌های خواندن را می‌پذیرد، service worker و websocket را مسدود می‌کند و هیچ رمز/فرم/حساب/دادهٔ زنده ارسال نمی‌کند. بارگذاری مثبت JS/CSS، hydration و تغییر نمایش رمزِ خالی باید پاس شوند؛ خطا یا مقصد خارج از هدف بررسی را قرمز می‌کند. نتیجه و تصاویر واقعی پس از اتمام بررسی افزوده می‌شوند؛ هیچ موفقیت مرورگر زودهنگام ثبت نشده است.

اجرای مستقل نخست [39142311828](https://github.com/apm1368/petlife-os/actions/runs/39142311828) **ناموفق** بود؛ هر ۱۶ حالت CSS با 200 و JS با 302 داشتند. [شبکه/تصاویر واقعی](onboarding-qa-screenshots/live-release-20261018/failed-browser-39142311828/checks.json). `reactBoundElements` ناموجود در JSON یعنی به‌علت شکست قبلی هنوز اندازه‌گیری نشده؛ نباید صفرِ اندازه‌گیری‌شده یا قبولی تلقی شود. پیش‌بررسی افزوده، هیچ redirectی را دنبال نمی‌کند؛ شکست پیش‌نیاز، اجرای ناقص و قرمز است، نه ۱۶ تست موفق. کنترل بومی درخواست/پاسخ Chromium در sandbox محلی، redirect مجاز را پذیرفت و POST و redirect خارج از مقصد را پیش از رسیدن به سرور مسدود کرد. این self-check شاهد سایت زنده نیست.


تشخیص تکمیلی [39144388468](https://github.com/apm1368/petlife-os/actions/runs/39144388468) نیز **ناموفق** است: runner متغیر HTTP proxy تنظیم‌شده نداشت؛ چهار CSS با MIME صحیح 200 و نخستین JS با 302 به مقصد خصوصی/خارج از هدف برگشت. redirect دنبال نشد. پیش‌نیاز شکست خورد و صفر سناریوی مرورگر اجرا شد؛ این قبولی نیست. CI معمول همان head `84044d0` [موفق](https://github.com/apm1368/petlife-os/actions/runs/39144392602) است، اما QA زنده قرمز است و #52 ادغام نمی‌شود. نبود متغیر proxy علت origin را اثبات نمی‌کند. [دستور فقط‌خواندنی مقایسهٔ Next/Nginx/URL عمومی](https://github.com/apm1368/petlife-os/issues/4#issuecomment-6252251588) برای Claude با اتصال موجود ارسال شد. [گزارش اپراتور از VPS](https://github.com/apm1368/petlife-os/issues/4#issuecomment-6252381568) دریافت شد: هر ۱۸ JS از Next مستقیم، Nginx محلی و IP عمومی از داخل VPS، بدون دنبال‌کردن redirect، پاسخ 200 داشتند. این شاهد گزارش‌شدهٔ اپراتور است؛ دستور معادل خودش اجرا شده و JSON دستور پیشنهادی ارائه نشده است. سلامت مسیرهای بررسی‌شدهٔ داخل VPS پشتیبانی می‌شود، اما محل دقیق اختلاف بیرونی و hydration در مرورگر کاربر همچنان تأیید نشده‌اند. تغییر برنامه یا Nginx بر پایهٔ حدس انجام نمی‌شود. هیچ اتصال/تنظیم/سرویس سرور برای این تشخیص تغییر نکرد.

## اصلاح محلی مجوز ویرایشگر مقاله — ۱۹ اکتبر، هنوز روی GitHub نیست

مالک ادامهٔ کار معطل Claude را به Codex سپرد. تلاش تازهٔ GitHub API خطای `401 Bad credentials` و git fetch خطای احراز هویت داشت؛ هیچ login، جایگزینی token/کلید یا تغییر دسترسی/نشست Claude انجام نشد. آخرین وضعیت ریموت و #51/#55 قابل تأیید مجدد نیست. این اصلاح فقط روی نسخهٔ محلی محفوظ #51 در `db5827e7bd6eda18ee6e09c5ba0df0953012baf4`، داخل worktree بازبینیِ جدا آماده شده؛ شاخهٔ انتشار تازه یا push از مبنای قدیمی ساخته نشده است. پیش از PR، باید آخرین تثبیت و head واقعی #51 fetch و patch با آنها تطبیق داده شود.

ویرایشگر از context مجوز واقعی ادمین استفاده می‌کند، نه نام نقش hardcode. کاربر فقط‌مشاهده کنترل ذخیره/وضعیت یا ویرایش متن نمی‌بیند؛ ویراستار بدون publish، متن زنده را فقط می‌خواند. ذخیرهٔ اطلاعات مشترک طبق API همچنان content.edit می‌خواهد؛ ساخت content.create، انتشار/پنهان‌سازی content.publish و بایگانی content.archive مستقل‌اند. handler هنگام کلیک مجوز را دوباره از store می‌خواند. حالت مجوز نامعلوم کنترل نوشتن یا fetch مقاله ندارد؛ از دست دادن مجوز متن تایپ‌شده را پاک نمی‌کند. guard تراکنشی API و خطاهای صریح/حفظ پیش‌نویس قبلی #51 تغییر نکرده‌اند. بازطراحی ادمین، API تازه، migration، workflow و تغییر ترجمه‌ای در این اصلاح وجود ندارد.

آزمون: سه تست از چهار بازتولید اولیه روی مبنا شکست خوردند؛ پس از اصلاح ۴۸ تست محتوا در هفت فایل موفق‌اند، شامل ۹ تست مجوز. تست قدیمی خطای 403 مطلب زنده با context ناشر، لغو مجوز سمت سرور پس از بارگذاری را مدل می‌کند؛ assertion خطا و حفظ عنوان حذف یا ضعیف نشده است. typecheck و lint موفق (سه هشدار قبلی؛ فایل‌های اصلاح بدون هشدار).

مرورگر: چهار تصویر قبل برای فقط‌مشاهده و ۱۶ حالت بعد (فقط‌مشاهده، پیش‌نویس ویراستار، مطلب زندهٔ ویراستار، ناشر؛ fa/en و 390/1440)، بدون overflow/pageerror. اجرای نهایی بعد هیچ console error یا درخواست شکست‌خورده نداشت؛ status و MIME دارایی‌های JS/CSS کنترل شدند. همهٔ APIها fixture روی loopback هستند و هر mutation رد می‌شود؛ این نتیجه آزمون API/DB واقعی، ورود زنده یا CI جدید نیست. خروجی مشترک types/config برای این محیط واقعاً ساخته شد؛ اجراهای اولیهٔ فاقد dist و اجرای هنگام HMR معتبر حساب نشدند. تصاویر/شبکه در `article-permissions-screenshots` و ابزار بازاجرا `browser-article-permissions.py` هستند. برای after، Next محلی 3037 و `QA_EVIDENCE_DIR`؛ before از worktree مبنای جدا روی 3035، با `QA_STAGE=before QA_WEB_ORIGIN=http://localhost:3035`.

بازخوانی فقط‌خواندنی API زنده در ۱۹ اکتبر، SHA `3ba6fdfed343b4c9cb1413a2911f55490c7d01d9` و deploymentId `github-39140816890-1`، محیط staging و PostgreSQL/Redis up را تأیید کرد. کد جدید منتشر نشده و به‌علت 401، Issue #4 یا PR قابل به‌روزرسانی نبود. ۳۰ فایل محلی پیام کارت پت با هش مبنا برابرند؛ هیچ دادهٔ زنده ساخته/ویرایش نشد.


## ادامهٔ محلی — خطای خواندن زبان مقاله، ۱۹ اکتبر

در همان نسخهٔ محفوظ #51، catch همهٔ خطاهای GET زبان را مثل «زبان ساخته نشده» به فرم خالی قابل ذخیره تبدیل می‌کرد. اکنون فقط ApiError با status=404 فرم زبانِ جدید می‌سازد؛ 403/خطای شبکه/سرور با ErrorRecovery و retry فقط GET متمایزند. ذخیره و تغییر وضعیت هنگام شکست خواندن بسته‌اند. شمارهٔ درخواست و cleanup مانع نشستن پاسخ دیررس زبان قبلی روی زبان تازه می‌شوند. هیچ draft cache بین زبان‌ها یا autosave تازه‌ای ادعا/اضافه نشده است.

چهار تست تازه: خطای خواندن و بازیابی، 404 واقعی، 403 و پاسخ دیررس زبان قبلی؛ سه تست روی رفتار پیشین شکست خوردند. نتیجهٔ جدیدتر: ۵۲ تست محتوا در هفت فایل موفق؛ typecheck و lint فایل‌های اصلاح موفق، بدون تغییر تست یا workflow برای سبزشدن. شواهد جدید مرورگر شامل چهار حالت خطا و چهار بازیابی بعد و چهار تصویر قبل در fa/en ×390/1440، در `article-read-error-screenshots/` هستند. pageerror/overflow/requestfailed صفر؛ 503 عمدی و console مربوط در JSON حفظ شده‌اند. هر mutation مسدود است و retry فقط یک GET تازه دارد. اسکریپت `browser-article-read-error.py` روی localhost:3037، و قبل روی worktree جدا localhost:3035 بازاجرا می‌شود؛ API همهٔ این تصاویر fixture است و این شاهد آزمون واقعی DB یا ورود زنده نیست.

GitHub در آزمایش تازه همچنان 401 داشت؛ نه PR، نه CI جدید و نه انتشار قابل انجام/تأیید است. این ادامه و اصلاح مجوز قبلی به‌صورت patch از cached head `db5827e` محفوظ‌اند؛ پیش از انتقال، آخرین head واقعی #51 و تثبیت باید خوانده و اختلاف‌ها بررسی شوند. فایل‌های سرور، دسترسی‌های Claude و کار محلی پیام کارت پت تغییر نکرده‌اند.
