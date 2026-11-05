# نقشهٔ اجرای سند تصمیم‌ها

> وضعیت: در حال اجرا  
> مرجع الزام‌آور: [سند تصمیم‌ها](../decisions.md)  
> مبنای کد: `main` در commit `12e771cd418b973e0fb0a710013210f174531237`  
> آخرین بازبینی: ۳ نوامبر ۲۰۲۶

## ۱. قواعد اجرای این نقشه

این فایل جایگزین سند تصمیم‌ها نیست. هر تغییر محصول باید با شناسهٔ تصمیم همان سند
ارجاع داده شود و اگر تصمیم تازه‌ای لازم بود، نخست به `docs/decisions.md` با کد
جدید اضافه شود. «موجود بودن مدل/صفحه/enum» معادل پذیرش فلو نیست.

برای هر PR اجرایی:

1. کدهای تصمیم پوشش‌داده‌شده، تصمیم‌های جایگزین‌شده و موارد خارج از محدوده را در
   شرح PR بنویسد.
2. تغییر API، مدل/مهاجرت، permission، feature flag، state transition، رخداد و
   اثر جانبی را مستند کند.
3. آزمون واحدِ منطق و E2E فلوهای حساس را همراه evidence اجرا کند.
4. پنج حالت UI (loading، empty، error، permission، populated) و فارسی/انگلیسی
   را بررسی کند.
5. بدون رسیدگی به تصمیم‌های مالی/PII، تغییرِ قابل مشاهده را پشت flag نگه دارد.

## ۲. واقعیت شروع کار

| مورد | وضعیت معتبر | تصمیم |
| --- | --- | --- |
| خط انتشار | `main`؛ آخرین تغییر تصمیم‌ها با PR #95 وارد شده است | TC-11، WB-09 |
| شاخهٔ پیش‌فرض GitHub | `main` (بازبینی‌شده در ۵ نوامبر ۲۰۲۶) | TC-11 محقق شده است؛ rule مخزن CI سبز و review اجباری را برای merge نگه می‌دارد |
| PR #59 | Draft، دارای conflict و ۱۶۴ commit عقب از main | TC-17؛ intent آن حفظ می‌شود، اما merge کور ممنوع است |
| PR #59 در برابر main | نسخهٔ قدیمی PR چند مسیر Google، هزاران ترجمه و قراردادهای جدیدتر را حذف می‌کند؛ OTP/Faraz و toggleهای اصلی در main جدیدتر وجود دارند | بازسازی انتخابی روی main، با test و بدون پاک کردن قابلیت‌های فعلی |
| محیط زنده | `opetlife.ir` SHA قدیمی‌تر از این سند تصمیم‌ها را اجرا می‌کند و health آن `environment=staging` می‌گوید | TC-04؛ production/staging/development باید جدا شود |
| دادهٔ آزمایشی | پاک‌سازی هنوز انجام نمی‌شود | WB-09؛ فقط در زمان انتشار طبق EX-14 |

### P0-01 — بازسازی کنترل‌شدهٔ PR #59

**کدها:** TC-17، TC-18، TC-19، ON-01، AD-11، AD-13، TC-05، TC-09.

PR #59 به دلیل فاصلهٔ زیاد از main قابل merge مستقیم نیست. خروجی این کار یک PR
جدید روی main یا بازنویسی امن همان PR است که فقط رفتارهای موردنیاز زیر را منتقل
کند:

- ورود موبایل/OTP و رمز اختیاری؛ فعال یا غیرفعال‌شدن OTP از تنظیمات ادمین.
- adapter واقعی Faraz Pattern API با عدم افشای key/code/recipient در log.
- الگوی پیامک قابل مدیریت ادمین که فقط کد الگوی فراز و متادیتای امن را نگه دارد،
  نه credential.
- صف و تاریخچهٔ ارسال، retry/rate limit، رضایت بازاریابی و تفاوت SENT/DELIVERED.
- تست‌های موفقِ OTP، خطای provider، rate limit، permission و UI فارسی/انگلیسی.

**خط قرمز:** حذف Google toggle/route فعلی، حذف ترجمه‌ها، یا تبدیل‌کردن رفتار
تولیدی به fixture تست فقط برای حل conflict مجاز نیست. تغییر تصمیم «ورود فقط با
موبایل» به خاموش‌بودن پیش‌فرض Google منجر می‌شود؛ حذف مسیرهای feature-flagged
بدون migration و آزمون، جزو این PR نیست.

### P0-02 — شاخهٔ اصلی و حفاظت

**کدها:** TC-11، TC-16، WB-09.

شاخهٔ پیش‌فرض GitHub اکنون `main` است و rule مخزن CI سبز و review را برای merge
الزامی می‌کند. هر تغییر در protection/ruleset فقط با دسترسی مجاز مالک/ادمین مخزن
انجام می‌شود؛ دور زدن آن مجاز نیست. clone، template و workflowها باید همواره
`main` را خط انتشار بدانند.

### P0-03 — سه محیط و عملیات انتشار

**کدها:** TC-03 تا TC-12، EX-13، EX-14، GR-14.

این مورد وابسته به DNS، credential و دسترسی سرور است. خروجی مورد انتظار:

- development محلی، staging روی زیردامنه با دادهٔ ناشناس، و production فقط
  `opetlife.ir`؛ health/version محیط واقعی را اعلام کند.
- backup روزانه با نگهداری ۳۰ روز، کپی دیتاسنتر دوم و rehearsal ماهانهٔ restore.
- migration additive/reversible با آزمایش روی کپی داده و گزارش اصلاح رکوردها.
- upload scan/limits/metadata stripping و link امضاشده برای فایل خصوصی.
- Sentry/log/uptime و هشدار، feature-flag با audience/city/beta list و rollback.

## ۳. ترتیب اجرا و بسته‌های مستقل

| موج | بستهٔ اجرایی | کدهای مرجع | وابستگی/خروجی |
| --- | --- | --- | --- |
| ۰ | ریپو، محیط، امنیت و تصمیم‌ها | TC، WB، EX-13/14، GR-14 | main، سه محیط، CI، backup، flags، PR #59 reconciled |
| ۱ | هستهٔ دامنه | A، ON، PT، ID، XM، OF، FE، DS | identity/household/pet، ماشین وضعیت، event table، ledger و component tokens |
| ۲ | پرداخت و کیف پول | F، PY، FE، O، SH | payable مشترک، Zibal، رسید کارت‌به‌کارت، wallet، refund، reconcile |
| ۲ | backoffice | AD، BO، E، TC-12، V-80/82/86 | /backoffice، TOTP، role builder، inbox، PII/audit، approval دوم |
| ۳A | پرونده و سلامت | PT، VT، V-01..16، CM/health | QR، reminders، medical sharing، clinical limited scope |
| ۳B | فروشگاه و فروشنده | S، C، O، SH، SL، V-17..38 | onboarding، ۳ عکس، offer/inventory، CPC، order/return/settlement |
| ۳C | خدمات و دامپزشک | B، BK، VT، V-39..56 | provider verification، booking state machine، online consultation behind flag |
| ۳D | حمایت و جامعه | M، LP، SR، AD-P، CM، V-65..79 | moderation، lost/adoption، NGO/donation، event/ticket |
| ۳E | سفر، تاکسی و بیمه | X، V-64/69..72، TC-02 | manual fallback first; partner APIs only behind flag |
| ۴ | رشد، جهانی و نسل بعد | GL، GP، GC، NX، V-80..98 | پس از حقوقی/شرکت خارجی و قابلیت‌های شریک |

بسته‌های هم‌زمان فقط وقتی مستقل‌اند. هر تغییر در schema، ledger، feature flag،
permission مرکزی، event contract یا navigation shell مالک واحد دارد؛ TC-18 اجازهٔ
دو اجراکننده برای آن‌ها نمی‌دهد.

## ۴. نقشهٔ تصمیم‌ها به پرامپت‌های اجرایی

| شناسهٔ پرامپت | اندازه | حوزه و کدهای تصمیم | وابستگی |
| --- | --- | --- | --- |
| P0-R | L | TC-01..19، WB-09، EX-13..14، GR-14 | دسترسی زیرساخت و GitHub |
| P0-SMS | M | TC-17..19، ON-01، AD-11..13، TC-05/09 | P0-R |
| P1-CORE | XL | A-01..04، ON-02..20، PT-01..20، ID-01..20، XM-09..20 | P0-R |
| P1-STATE | XL | OF-01..20، FE-01..20، EX-01..08، XM-01..10 | P1-CORE |
| P1-DESIGN | L | UX-01..20، IA-01..20، PD-01..20، DS-01..20، JR-01..20 | نمونهٔ بصری DS-17 تا DS-20 |
| P2-PAYMENTS | XL | F-01..16، PY-01..20، FE-01..20، O-07..12 | P1-STATE، P0-SMS |
| P2-BACKOFFICE | XL | AD-01..18، BO-01..21، E-01..09، V-80..86 | P1-CORE، P1-STATE |
| P3-PET-HEALTH | XL | V-01..16، VT-01..20، CM-01..07، U-01..09 | P1-CORE، P1-DESIGN |
| P3-COMMERCE | XL | S-01..17، C-01..11، O-01..12، SH-01..20، SL-01..20، V-17..38 | P2-PAYMENTS، P2-BACKOFFICE |
| P3-SERVICES | XL | B-01..09، BK-01..20، VT-01..20، V-39..56 | P1-STATE، P2-PAYMENTS |
| P3-COMMUNITY | XL | M-01..15، LP-01..07، SR-01..06، AD-P-01..07، CM-08..20، V-65..79 | P2-BACKOFFICE |
| P3-OPS-MANUAL | L | X-01..06، TC-02، EX-17..20 | P2-BACKOFFICE |
| P3-TRAVEL-INSURANCE | L | X-04..05، V-69..72، partner flags | P1-CORE، P2-PAYMENTS |
| P4-GROWTH | L | GR-01..20، V-20..23/87..95، T-05..16 | P1-DESIGN، analytics TC-15 |
| P4-GLOBAL | XL | GL-01..20، GP-01..20، GC-01..20 | legal entity + country flags |
| P4-NEXT | XL | NX-01..20، V-57..64/90..98 | data governance, partner/legal review |

اندازه: S کمتر از یک هفتهٔ توسعه، M یک جریان محدود، L چند سطح UI/API/test،
XL یک جریان متقاطع با schema/operations/QA. اندازه زمان‌بندی قطعی نیست و
وابستگی بیرونی را حذف نمی‌کند.

## ۵. تعریف آماده‌بودن و پذیرش

هیچ موردی صرفاً با دیدن صفحه «تمام» نیست. برای هر prompt و زیرتسک:

- `NOT_STARTED → IN_PROGRESS → READY_FOR_QA → READY_FOR_RELEASE →
  LIVE_VERIFIED` باید قابل ردیابی باشد.
- مشخصات فیلدها، state transition و خطاهای قابل‌نمایش در API و UI ثبت شود.
- دادهٔ حساس در log، URL، export یا screenshot evidence قرار نگیرد.
- money movement idempotent باشد و audit actor/time/reason داشته باشد.
- تست منفی tenant/permission و retry/callback تکراری وجود داشته باشد.
- flag، rollback، manual fallback و مالک صف برای اتصال بیرونی تعیین شود.

## ۶. نکته‌های نیازمند تصمیم یا عملیات بیرونی

| مورد | اثر بر اجرا |
| --- | --- |
| مجوز GitHub برای default branch/ruleset | P0-R کامل نمی‌شود |
| DNS/credential سه محیط و backup second site | TC-03/04/10/11 |
| قرارداد و credential زیبال، فراز، الوپیک/اسنپ‌باکس، شبا | پرداخت و ارسال فقط sandbox/manual fallback |
| استعلام سازمان دامپزشکی | consultation/نسخهٔ الکترونیک پشت flag باقی می‌ماند |
| بازبینی حقوقی حذف/ناشناس‌سازی و T-13 | account deletion production-ready نمی‌شود |
| قیمت اشتراک و نقشهٔ سرفصل حسابداری | setting/ERP با placeholder منتشر نمی‌شود |
| تأیید ۶ صفحهٔ DS-17 | پیاده‌سازی گستردهٔ UI جدید شروع نمی‌شود |

## ۷. کنترل کامل‌بودن تصمیم‌ها

اسکریپت استخراج markdown در snapshot ۳ نوامبر ۲۰۲۶، ۸۶۱ ردیف جدول و ۸۵۶ کد
یکتا پیدا می‌کند؛ در مقدمهٔ سند عدد ۷۳۴ ذکر شده است. این تفاوت احتمالاً از
شمردن تصمیم‌های جایگزین‌شده و ارجاع‌های تکراری ناشی می‌شود، اما قبل از گزارش
درصد پیشرفت باید با مالک سند اصلاح یا صریحاً تعریف شود. هیچ درصد پوشش از این
دو عدد بدون تعیین قاعدهٔ شمارش منتشر نشود.
