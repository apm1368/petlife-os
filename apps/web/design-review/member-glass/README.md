# Approved member glass dashboard

Personal pages used to change their visual surface when moving from home to pet/profile tabs. They now share one warm photographic glass member frame; shop, discovery and booking journeys use a separate service surface. The home uses the member's own pet, permission-aware overview and recorded care events. No screenshot numbers, pet identities, health scores or sample appointments were shipped.

## What changed

- Immersive greeting, recorded-event calendar, pet selector and profile/health/care/memory/document shortcuts.
- Same glass frame and pet identity header across personal routes, including mobile profile tabs.
- Health and care links hidden until current-pet permissions are confirmed; stale permission responses cannot expose the old pet's controls.
- Permission retry, pet-switch failure, partial care load failure and booking-load failure have visible states. Failed reads do not claim that nothing exists.
- Member navigation, notification bell, support and account controls remain connected. Existing booking/catalog/auth logic is retained.
- Generated decorative background disclosed on `/credits`; real pet photos still come from each pet's record.

## Evidence

| | 1440px | 390px |
| --- | --- | --- |
| Before (fa) | [Before](before-fa-1440.webp) | [Before](before-fa-390.webp) |
| Home (fa) | [After](home-fa-1440.webp) | [After](home-fa-390.webp) |
| Profile (fa) | [Profile](profile-fa-1440.webp) | [Profile](profile-fa-390.webp) |
| Home (en) | [After](home-en-1440.webp) | [After](home-en-390.webp) |

`browser-checks.json` covers Persian/English home and profile continuity at both sizes, with controlled API responses. This is not evidence of live-server sign-in or real customer data. The approved source is `../approved-rollout/targets/member-home.webp`.

## Owner summary

قاب شیشه‌ای داشبورد در پروفایل و تب‌های شخصی حفظ شده است.
داده‌ها از سرویس‌های موجود می‌آیند و میان‌برهای بدون مجوز پنهان می‌شوند.
این مرحله مربوط به داشبورد است؛ وضعیت سایر صفحه‌ها و پرامپت‌های تکمیلی در گزارش rollout ثبت شده است.

Proposed board #4 entry: `codex/stab-member-glass — PR pending — approved glass home + persistent personal shell; UI coverage ledger and Codex handoff attached; CI/QA required.`

Publication is blocked on GitHub PR/API access and the required checks. This branch has not been merged or deployed. See the verification section in design-qa.md for exact outcomes.


## ادامهٔ طراحی فهرست پت‌ها — ۱۷ اکتبر

صفحهٔ واقعی `/fa/pets` روی مبنای تثبیت `befd02a`، پوستهٔ شیشه‌ای درست داشت اما در ۳۹۰، دکمهٔ افزودن با عنوان تداخل داشت و متن دکمهٔ انتخاب پت بلند از ارتفاع کنترل بیرون می‌زد؛ scrollWidth به‌تنهایی این نقص را نشان نمی‌داد. این ادامه فقط همین صفحه و حالت‌های آن را اصلاح می‌کند، نه تأیید همهٔ صفحات محصول.

کارت‌های دارای عکس واقعی همان پت، نام بلند و fallback بدون عکس، چیدمان یک‌ستونه/دوستونه و اقدام‌های مجزای مشاهده/انتخاب دارند. حالت خالی از خطا جداست. انتخاب ناموفق با همان hook موجود rollback می‌شود؛ پیام روشن نمایش داده می‌شود و کلیک تکراری تا پایان ذخیره بسته است. API، مدل، مجوزها، مهاجرت و قابلیت جدیدی اضافه نشده‌اند. نام/لوگوی opetlife و قاب مشترک حفظ شده‌اند.

[قبل فارسی ۳۹۰](pet-list-screenshots/before-fa-390.webp) · [قبل فارسی ۱۴۴۰](pet-list-screenshots/before-fa-1440.webp) · [بعد فارسی ۳۹۰](pet-list-screenshots/after-list-fa-390.webp) · [بعد فارسی ۱۴۴۰](pet-list-screenshots/after-list-fa-1440.webp). نسخه‌های en در همان پوشه‌اند؛ تصاویر clean، empty و error نیز جدا ذخیره شده‌اند.

نتیجه: ۲۳ تست هدفمند در سه فایل، typecheck وب و lint وب موفق (سه warning قبلی). کلیدهای fa/en یکسان‌اند. مرورگر واقعی Chromium: چهار حالت × fa/en × 390/1440، جمعاً ۱۶ حالت بعد، به‌علاوه چهار تصویر قبل. اجراهای دادهٔ سالم clean فاقد console error، pageerror، HTTP ناموفق، clipping عنوان/دکمه و overflow بودند. حالت list برای تطبیق قبل/بعد همان 404 کنترل‌شدهٔ `/settings/public` را حفظ می‌کند؛ بنر خطای اعلان در این تصاویر مربوط به محدودیت fixture تاریخی است، نه شاهد خرابی سرور. حالت error، شکست 503 محلی انتخاب پت را تزریق می‌کند؛ خطا پنهان نشده است.

[خروجی مرورگر](pet-list-screenshots/checks.json) · [هش کد آزموده‌شده](pet-list-screenshots/source-hashes.json) · [ابزار بازتولید](browser-pet-list.py). برای بازتولید: Next روی 3030، `NEXT_PUBLIC_LOCAL_PREVIEW=0` و `NEXT_PUBLIC_API_ORIGIN=http://localhost:4000`؛ سپس QA_REPO_ROOT، QA_EVIDENCE_DIR، QA_STAGE=after و QA_MODE=clean/list/empty/error را به ابزار بدهید. تصویر before باید از worktree جدا روی مبنای بالا گرفته شود؛ برای بازتولید شاخهٔ دارای تغییر محلی را جابه‌جا نکنید.

این شواهد، داده/API کنترل‌شدهٔ loopback هستند؛ ورود واقعی، نوشتن روی سایت زنده یا یکپارچگی تمام APIهای بک‌آفیس را تأیید نمی‌کنند. نتیجهٔ کامل CI و وضعیت ادغام فقط در PR و Issue #4 ثبت می‌شود؛ این بسته انتشار main ندارد.
