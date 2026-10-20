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

Historical checkpoint: the original glass-frame report was written before GitHub publication was available. That access blocker is no longer current; merged PRs and actual release evidence are tracked separately in Issue #4 and docs/ops/stabilization-remaining.fa.md. The historical screenshots are not a current deployment certificate.


## ادامهٔ طراحی فهرست پت‌ها — ۱۷ اکتبر

صفحهٔ واقعی `/fa/pets` روی مبنای تثبیت `befd02a`، پوستهٔ شیشه‌ای درست داشت اما در ۳۹۰، دکمهٔ افزودن با عنوان تداخل داشت و متن دکمهٔ انتخاب پت بلند از ارتفاع کنترل بیرون می‌زد؛ scrollWidth به‌تنهایی این نقص را نشان نمی‌داد. این ادامه فقط همین صفحه و حالت‌های آن را اصلاح می‌کند، نه تأیید همهٔ صفحات محصول.

کارت‌های دارای عکس واقعی همان پت، نام بلند و fallback بدون عکس، چیدمان یک‌ستونه/دوستونه و اقدام‌های مجزای مشاهده/انتخاب دارند. حالت خالی از خطا جداست. انتخاب ناموفق با همان hook موجود rollback می‌شود؛ پیام روشن نمایش داده می‌شود و کلیک تکراری تا پایان ذخیره بسته است. API، مدل، مجوزها، مهاجرت و قابلیت جدیدی اضافه نشده‌اند. نام/لوگوی opetlife و قاب مشترک حفظ شده‌اند.

[قبل فارسی ۳۹۰](pet-list-screenshots/before-fa-390.webp) · [قبل فارسی ۱۴۴۰](pet-list-screenshots/before-fa-1440.webp) · [بعد فارسی ۳۹۰](pet-list-screenshots/after-list-fa-390.webp) · [بعد فارسی ۱۴۴۰](pet-list-screenshots/after-list-fa-1440.webp). نسخه‌های en در همان پوشه‌اند؛ تصاویر clean، empty و error نیز جدا ذخیره شده‌اند.

نتیجه: ۲۳ تست هدفمند در سه فایل، typecheck وب و lint وب موفق (سه warning قبلی). کلیدهای fa/en یکسان‌اند. مرورگر واقعی Chromium: چهار حالت × fa/en × 390/1440، جمعاً ۱۶ حالت بعد، به‌علاوه چهار تصویر قبل. اجراهای دادهٔ سالم clean فاقد console error، pageerror، HTTP ناموفق، clipping عنوان/دکمه و overflow بودند. حالت list برای تطبیق قبل/بعد همان 404 کنترل‌شدهٔ `/settings/public` را حفظ می‌کند؛ بنر خطای اعلان در این تصاویر مربوط به محدودیت fixture تاریخی است، نه شاهد خرابی سرور. حالت error، شکست 503 محلی انتخاب پت را تزریق می‌کند؛ خطا پنهان نشده است.

[خروجی مرورگر](pet-list-screenshots/checks.json) · [هش کد آزموده‌شده](pet-list-screenshots/source-hashes.json) · [ابزار بازتولید](browser-pet-list.py). برای بازتولید: Next روی 3030، `NEXT_PUBLIC_LOCAL_PREVIEW=0` و `NEXT_PUBLIC_API_ORIGIN=http://localhost:4000`؛ سپس QA_REPO_ROOT، QA_EVIDENCE_DIR، QA_STAGE=after و QA_MODE=clean/list/empty/error را به ابزار بدهید. تصویر before باید از worktree جدا روی مبنای بالا گرفته شود؛ برای بازتولید شاخهٔ دارای تغییر محلی را جابه‌جا نکنید.

این شواهد، داده/API کنترل‌شدهٔ loopback هستند؛ ورود واقعی، نوشتن روی سایت زنده یا یکپارچگی تمام APIهای بک‌آفیس را تأیید نمی‌کنند. نتیجهٔ کامل CI و وضعیت ادغام فقط در PR و Issue #4 ثبت می‌شود؛ این بسته انتشار main ندارد.

## ادامهٔ نمای پت — خطای مراقبت و پاسخ دیررس، ۱۸ اکتبر

در `/[locale]/pets/[id]`، شکست GET مراقبت قبلاً به آرایهٔ خالی تبدیل می‌شد و پیام آرامش‌بخش «موردی یافت نشد» نمایش داده می‌شد. اکنون خطای جزئی روشن است، تاریخچهٔ در دسترس باقی می‌ماند و دکمهٔ تلاش دوباره فقط خواندن را تکرار می‌کند. فهرست پیش‌رو تا دریافت مراقبت کامل اعلام نمی‌شود. قاب شیشه‌ای، لوگو و مسیرهای موجود حفظ شده‌اند.

داده/مجوز/مراقبتِ همان نمای پت به شناسهٔ مسیر وابسته شد؛ پاسخ دیررس درخواست قبلی دیگر نمی‌تواند درون این نما زیر لینک پت تازه قرار گیرد. `PetContextShell`، فایل‌های پیام کارت پت و ادمین تغییر نکرده‌اند؛ این اصلاح تضمین رفتار تمام پوسته‌ها و جریان‌های تعویض پت نیست.

۶ تست تازه در `PetProfileView.test.tsx`، همراه ۱۲ تست موجود داشبورد و برچسب‌ها، موفق‌اند. پنج سناریو روی کد مبنا شکست می‌خوردند. تصاویر و JSON درخواست‌ها در `pet-overview-screenshots` و ابزار بازاجرا `browser-pet-overview.py` هستند؛ API مرورگر مصنوعی loopback است و هر mutation رد می‌شود. خطای 503 عمداً برای GET مراقبت/نمای کلی تزریق می‌شود؛ لغو اولیهٔ `/settings/public` توسط StrictMode فقط در صورت دریافت پاسخ 200 بعدی مجاز است و در JSON حفظ شده است. تصویرهای قبل یک بنر اعلان نامرتبطِ fixture قدیمی نیز دارند؛ اعلان خالی در fixture بعد با قرارداد واقعی `platform.announcement: null` تنظیم شده، نه با تغییر کد اعلان برنامه.

برای بازاجرا، Next روی localhost:3036 و `QA_EVIDENCE_DIR=/tmp/pet-overview-qa QA_STAGE=after QA_MODE=care-error`؛ حالت‌های `recover`، `empty`، `no-care-permission` و `load-error` نیز اجرا شوند. اعداد/تاریخ موجود با formatterهای واقعی برنامه نمایش داده می‌شوند. نتیجهٔ CI/ادغام و انتشار از PR و Issue #4 مستقل خوانده شود؛ این تست‌ها ورود یا دادهٔ واقعی سایت زنده را تأیید نمی‌کنند.

نتیجهٔ نهایی این ادامه: ۲۰ حالت بعد و چهار تصویر قبل، fa/en و ۳۹۰/۱۴۴۰، بدون overflow یا pageerror و با بارگذاری موفق دارایی‌های ثبت‌شدهٔ JS/CSS. لغو StrictMode و 503 کنترل‌شده در JSON باقی مانده‌اند و موفقیت جعلی جایگزین آن‌ها نشده است. typecheck، lint (سه هشدار قبلی) و برابری ۴۷۶۳ کلید fa/en موفق‌اند. API واقعی/DB، ورود زنده، عملکرد تمام پوستهٔ پت و سرویس‌های بیرونی در این بسته تأیید نشده‌اند.


## حفظ پیش‌نویس هنگام شکست عکس پت — ۱۸ اکتبر

در ویرایش مشخصات پت، ذخیرهٔ فیلدها ممکن است موفق و دریافت لینک آپلود، PUT عکس یا اتصال عکس به پت ناموفق شود. قبلاً مسیر خطای عکس نیز `onSaved` را صدا می‌زد؛ والد از حالت ویرایش خارج می‌شد و خطای جزئی/عکس انتخابی از دست می‌رفت. اکنون همان پیام دقیق «بقیهٔ تغییرها ذخیره شد» و فرم باقی می‌مانند. تلاش مجدد فقط با اقدام صریح کاربر است؛ retry خودکار upload اضافه نشده است. قالب و API و مجوزها تغییر نکرده‌اند؛ این اصلاح بازطراحی ادمین یا تضمین اتمیک بودن ذخیرهٔ مشخصات و عکس نیست.

چهار تست تازه، دریافت لینک ناموفق، PUT ناموفق و بازیابی با همان فایل، اتصال ناموفق عکس و شکست خود مشخصات را پوشش می‌دهند. سه تست روی مبنا شکست می‌خوردند؛ پس از اصلاح، ۱۰ تست همراه تست‌های موجود نمای پت موفق‌اند. typecheck موفق؛ lint بدون خطا و با سه هشدار قبلی. CI نهایی PR باید مستقل بررسی شود؛ تست واقعی storage/API و ورود زنده در این بسته انجام نشده‌اند.

ابزار `browser-pet-photo-retry.py` فقط loopback و fixtureهای کنترل‌شده را می‌پذیرد؛ PATCH/POST/PUT فقط در interceptor پاسخ داده می‌شوند و به API یا storage واقعی نمی‌رسند. اجرای before از worktree مبنا `cb9c4ab` و اجرای after از شاخهٔ اصلاح است. JSON و تصاویر در `pet-photo-retry-screenshots/` هستند. هر دو زبان در ۳۹۰/۱۴۴۰ پوشش داده می‌شوند؛ وضعیت error و بازیابی جدا ثبت است. خطای 503 عمدی و لغوهای ناوبری Next/StrictMode حذف نمی‌شوند: لغو فقط با پاسخ موفق همان مسیر (و برای RSC با MIME مربوط) پذیرفته می‌شود. اجرای اولیهٔ fixture بدون MIME برای آرایهٔ خالی نامعتبر بود؛ معیارها ضعیف نشدند و اجرای نهایی با قرارداد JSON صحیح ثبت می‌شود.

بازاجرا: Next محلی روی 3038 و `QA_EVIDENCE_DIR=/tmp/pet-photo-qa QA_STAGE=after python3 apps/web/design-review/member-glass/browser-pet-photo-retry.py`. برای before از `QA_WEB_ORIGIN` و worktree مبنای جدا استفاده شود؛ شاخهٔ دارای کار محلی جابه‌جا نشود. این شواهد بارگذاری JS نسخهٔ زنده را تأیید نمی‌کنند. وضعیت کد، CI و انتشار در PR و Issue #4 مستقل ثبت می‌شود.


اجرای نهایی: چهار حالت خطا و چهار حالت بازیابی پس از اصلاح، همراه چهار تصویر قبل؛ همهٔ چهار ترکیب زبان/عرض بدون pageerror/overflow و با JS/CSS موفق. قبل از اصلاح خطای عکس در هر چهار حالت ناپدید شد؛ پس از اصلاح دیده می‌شود. `selectedPhotoCount=0` رفتار عمدی input فایل است که مقدارش پس از انتخاب پاک می‌شود؛ نگه‌داشتن همان فایل با تست واحدِ بدنهٔ retry و موفقیت upload دوم سنجیده شد، نه این شمار DOM. خطای 503 ساختگی، StrictMode و لغو RSC با پاسخ 200 بعدی در JSON ثبت هستند. [بعد فارسی موبایل](pet-photo-retry-screenshots/after-photo-error-fa-390.webp) · [بعد فارسی دسکتاپ](pet-photo-retry-screenshots/after-photo-error-fa-1440.webp) · [شبکه و نتیجه](pet-photo-retry-screenshots/after-checks.json).
