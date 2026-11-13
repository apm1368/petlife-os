# PET LIFE OS — ماتریس پوشش تصمیم‌ها و گزارش شکاف انتشار

> مرجع الزام‌آور: [سند تصمیم‌ها](./decisions.md) (فارسی، `main` @ `3fe6bb0`)
> مبنای این گزارش: `origin/main` @ `3fe6bb0` · بررسی: ۵ نوامبر ۲۰۲۶
> روش: خواندن کامل سند تصمیم‌ها + بازرسی کد، اسکیما، CI، PRهای باز و production زنده

---

## ۱. هشدار روش‌شناسی

این سند **وضعیت اجرایی** را گزارش می‌کند، نه وضعیت «محصول». برچسب‌ها فقط وقتی
`پیاده‌سازی‌شده` می‌گیرند که سه شاهد هم‌زمان وجود داشته باشد:

1. کد در `main` (یا در PR بازِ مشخص‌شده) موجود باشد؛
2. تست خودکار مرتبط در ریپو وجود داشته باشد؛
3. شواهد اجرا (CI سبز یا مسیر زندهٔ production) قابل استناد باشد.

وجود مدل دیتابیس، یا دکمهٔ UI، یا دادهٔ seed، به‌تنهایی `پیاده‌سازی‌شده` نیست.

**قاعدهٔ شمارش:** سند تصمیم‌ها در مقدمه عدد ۷۳۴ را ذکر می‌کند، اما استخراج
ماشینی از فایل فعلی **۸۶۲ ردیف جدول** و **۸۵۶ کد یکتا** می‌دهد. اختلاف از
تصمیم‌های جایگزین‌شده (F-04→T-21، F-17→E-09، X-07→V-57..63، V-97→T-14،
AD-02→BO-02، M-05→CM-11) و ارجاع‌های درون‌متنی ناشی می‌شود. این گزارش عدد
«۸۵۶ کد یکتا» را مبنا می‌گیرد و هیچ درصد پوششی بدون تعریف شمارش منتشر نمی‌کند
(مطابق §۷ نقشهٔ اجرا).

---

## ۲. گزارش وضعیت فعلی (Current State Report)

### ۲.۱ گیت و شاخه‌ها

| مورد | مقدار واقعی |
| --- | --- |
| شاخهٔ محلی | `main` @ `3fe6bb0` — هم‌تراز با `origin/main` |
| `origin/main` | `3fe6bb0 feat(admin): add audited feature-flag control plane` |
| شاخهٔ پیش‌فرض GitHub | `claude/pet-life-os-foundation-8synln` — **نادرست** (TC-11/WB-09 نقض) |
| حفاظت شاخهٔ `main` | **ندارد** (`Branch not protected`, rulesets = `[]`) |
| آخرین استقرار موفق | `3fe6bb0` — دقیقاً برابر `origin/main` |
| شاخه‌های remote | ۲۶ شاخه؛ ۲۲ شاخه در `main` merge شده‌اند |

### ۲.۲ استقرار و محیط (TC-04)

| مورد | مقدار واقعی | شاهد |
| --- | --- | --- |
| دامنهٔ تولید | `https://opetlife.ir` | TLS فعال، `/fa` و `/en` = ۲۰۰ |
| SHA مستقرشده | `3fe6bb0111c68f72d08d662f40da875ce8be1518` | `GET /api/health/version` |
| محیط گزارش‌شده | **`"environment":"staging"`** | همان endpoint |
| سلامت | `{"status":"ok","checks":{"database":"up","redis":"up"}}` | `GET /api/health/ready` |
| زیرساخت استقرار | GitHub Actions → SSH (`appleboy/ssh-action`) → `/var/www/petlife-os` → `deploy.sh` → PM2 | `.github/workflows/deploy.yml` |
| staging مستقل | **وجود ندارد** — `staging.opetlife.ir` پاسخ نمی‌دهد | probe DNS/HTTPS |
| زیردامنهٔ staging | وجود ندارد | همان |
| مسیر rollback | snapshot در `/var/www/petlife-os-releases/previous` + trap `ERR` در `deploy.sh` | `deploy.sh:163-215` |

**نقص بحرانی:** `deploy.yml:45` مقدار `DEPLOYMENT_ENVIRONMENT='staging'` را روی
**production** ست می‌کند و `smoke-staging.sh` هم بعد از استقرار production اجرا
می‌شود. نتیجه: production خودش را staging معرفی می‌کند و staging واقعی وجود
ندارد. این همان «مشکل environment=staging» است که TC-04 می‌گوید باید حل شود.

### ۲.۳ PRهای باز

| PR | عنوان | وضعیت | CI | ریشهٔ شکست |
| --- | --- | --- | --- | --- |
| [#100](https://github.com/apm1368/petlife-os/pull/100) | feat(payments): payment infrastructure and ledger rails | OPEN، mergeable | **fail** در گام `Test` | ۳ E2E مالی/تجارت fail (خط ۲۱۳۶، ۲۴۰۹، ویت‌کِیور) |
| [#99](https://github.com/apm1368/petlife-os/pull/99) | feat: shared design system (packages/ui) | OPEN، mergeable | **fail** در گام `Design-system contract and visual stories` | هر ۶ snapshot بصری ناهماهنگ (baseline ۱۲۵۶px در برابر رندر ۹۱۰px) |
| [#98](https://github.com/apm1368/petlife-os/pull/98) | feat(admin): audited Faraz SMS pattern bindings | OPEN، **conflict** | بدون check | ناسازگاری با `main`؛ نیازمند rebase |
| [#59](https://github.com/apm1368/petlife-os/pull/59) | feat(auth,admin): SMS sign-in via FarazSMS | Draft، **conflict** | قدیمی | ۱۶۴ commit عقب از `main`؛ merge کور ممنوع (TC-17) |

### ۲.۴ کیفیت پایه (اجرای واقعی در `main`)

| گام | نتیجه |
| --- | --- |
| Lint | سبز (۵/۵ turbo task) |
| Typecheck | سبز |
| Migration | سبز |
| Unit test | **۴۰ suite / ۲۱۶ تست سبز** |
| Web test | **۲۲۷ suite / ۹۸۳ تست سبز** |
| E2E | ۷۶ فایل spec؛ در `main` سبز |
| Build | سبز |

---

## ۳. ماتریس پوشش تصمیم‌ها

ستون «شاهد» به فایل/مسیر واقعی در `main` اشاره دارد. ستون «وضعیت» یکی از:
`پیاده‌سازی‌شده` · `نیمه‌کاره` · `ندارد` · `مسدود` (منتظر تصمیم/قرارداد بیرونی).

### ۳.۱ پایه و انتشار — TC، WB، EX-13/14، GR-14

| کد | خواسته | وضعیت | شاهد | بلوکر | اقدام بعدی |
| --- | --- | --- | --- | --- | --- |
| TC-04 | سه محیط جدا؛ health محیط واقعی | **نیمه‌کاره** | `deploy.yml:45` = `staging` روی production؛ staging مستقل ندارد | DNS/زیردامنه + تصمیم معماری | یا env تولید را `production` کنیم و staging را مستقل بسازیم، یا صریحاً staging را روی زیردامنهٔ جدا مستقر کنیم |
| TC-11 | انتشار از main با staging تأییدشده | **نیمه‌کاره** | `deploy.yml` فقط `push: main` دارد؛ staging gate وجود ندارد | ندارد | staging job مستقل اضافه شود |
| TC-16 | review انسانی برای مالی/امنیت | **ندارد** | `main` حفاظت ندارد؛ rulesets خالی | دسترسی admin GitHub | ruleset: نیازمند CI سبز + ۱ review |
| TC-17 | PR #59 با رفع تعارض حفظ شود | **نیمه‌کاره** | PR #59 Draft و conflict است | تصمیم مالک دربارهٔ بازسازی | بازسازی انتخابی OTP/Faraz روی `main` (PR جدید) |
| TC-18 | یک اجراکننده برای دامنهٔ مشترک | **کنترل‌نشده** | PR #99 (`packages/ui`) و #100 (ledger/schema) هم‌زمان باز | قفل دامنه | تا merge یکی، دیگری فقط روی branch بماند |
| TC-19 | سند فنی هم‌زمان با کد | **پیاده‌سازی‌شده** | `docs/product/finance-payment-settlement-spec.fa.md`، `docs/payment-infrastructure.md` (در PR #100) | — | — |
| WB-09 | `main` شاخهٔ پیش‌فرض + سه محیط | **نیمه‌کاره** | default branch اشتباه | دسترسی admin | تغییر default branch به `main` |
| WB-12 | سند تصمیم در `docs/decisions.md` | **پیاده‌سازی‌شده** | `docs/decisions.md` @ `a31bf84` | — | — |
| WB-13 | کیفیت فقط با تست خودکار | **پیاده‌سازی‌شده** | CI: lint→typecheck→migrate→test→e2e→build | — | — |
| GR-14 | چک‌لیست آمادگی انتشار | **ندارد** | سند چک‌لیست منتشرشده وجود ندارد | نتیجهٔ تست‌ها | سند checklist + شواهد |
| EX-13 | migration با اسکریپت بازگشت | **نیمه‌کاره** | migrationها فقط `up` دارند؛ `down` ندارند | — | برای migration پولی، rollback رویهٔ تست‌شده لازم است |
| TC-03 | backup روزانه ۳۰ روزه + سایت دوم | **نیمه‌کاره** | `deploy.sh:114-119` backup **پیش از هر deploy**، retention ۱۴ عدد | backup cron روزانه، سایت دوم | روزانه‌سازی + restore rehearsal |

### ۳.۲ هستهٔ مالی و وضعیت — FE، OF، PY، F

| کد | خواسته | وضعیت | شاهد | بلوکر | اقدام بعدی |
| --- | --- | --- | --- | --- | --- |
| FE-14 | همهٔ مبالغ ریال صحیح؛ تقسیم تخفیف | **پیاده‌سازی‌شده** | `LedgerEntry.amount Int`؛ `CommissionRule.basisPoints Int` | — | — |
| FE-15 | دفتر دوطرفهٔ غیرقابل‌ویرایش | **پیاده‌سازی‌شده** | `LedgerAccount`/`LedgerTransaction`/`LedgerEntry` + `LedgerService.recordBalanced` | — | — |
| FE-16 | اصلاح فقط با تراکنش اصلاحی + تأیید نفر دوم | **نیمه‌کاره** | ستون‌های `reversesLedgerTransactionId`/`correctionReason` فقط در PR #100 | merge #100 | پس از merge، تست دوم‌تأییدی |
| FE-01..FE-20 | لبه‌های مالی کامل | **ندارد** | کد تخفیف، پاوما، کش‌بک، کیف پول دوعBalanceه | merge #100 برای PY-05 | پس از merge #100 |
| OF-01 | ماشین وضعیت رسمی برای سفارش/بسته/رزرو/پرداخت/مرجوعی | **نیمه‌کاره** | `order-policy.ts` فقط «قابل لغو بودن»؛ `booking`/`payments` ماشین واحد ندارند | — | سند + ماژول واحد `state-machines/` |
| OF-04 | توزیع پراکندهٔ تخفیف؛ بازگشت بخشی | **ندارد** | `order-policy.ts` ندارد | merge #100 | با ledger |
| OF-09 | اعتراض به «انجام شد» ۲۴ ساعت، نگهداشت تسویه | **نیمه‌کاره** | `BookingDetailView.test.tsx` مسیر preview refund را تست می‌کند | — | اثر تسویهٔ واقعی |
| OF-13 | رزرو موجودی ۱۵ دقیقه‌ای | **پیاده‌سازی‌شده** | `inventory-reservation.service.ts` در PR #100 | merge #100 | E2E سبز |
| O-04 | تحویل ۳ روزه؛ **مرجوعی ۴۸ ساعت** | **ناسازگار** | `order-policy.ts:24` `RETURN_WINDOW_DAYS = 7` — با O-04/O-07 (۴۸ ساعت) ناسازگار است | تصمیم مالک | **اصلاح به ۴۸ ساعت** یا ثبت تصمیم جایگزین |
| PY-01..PY-04 | کارت‌به‌کارت با آپلود فیش | **نیمه‌کاره** | `card-transfer-payment.service.ts` + `admin-card-transfer.controller.ts` فقط در PR #100 | merge #100 | — |
| PY-19 | کلید idempotency هر پرداخت؛ تکرار callback هیچ پولی جابه‌جا نمی‌کند؛ بازپرداخت تکراری فقط با مدرک تراکنش دوم و تأیید مدیر دوم | **پیاده‌سازی‌شده** | `common/idempotency/idempotency.interceptor.ts` + ایندکس `payment_intents.idempotencyKey`؛ `provider-events.service.ts` (`recordIfNew` ← `IGNORED_DUPLICATE`)؛ اصلاح کیف پول دو‌نفره (FE-16) | — | واردکردن گزارش تسویهٔ زیبال/بانک برای کشف خودکار مغایرت هنوز نیست (شاخهٔ `feat/py19-zibal-reconciliation`) |
| PY-05 | کیف پول دوم موجودی | **نیمه‌کاره** | `WalletBalanceType.WITHDRAWABLE/PURCHASE_ONLY` فقط در PR #100 | merge #100 | — |
| PY-18 | مغایرت‌گیری روزانهٔ خودکار | **نیمه‌کاره** | `ReconciliationLog` + `FinanceReconciliationFinding` وجود دارد؛ **خودکارِ روزانه نه** | قرارداد زیبال | بی‌طرف: reconcile با دفتر + صورتحساب بانک |
| F-01 | روش‌های پرداخت فاز اول | **نیمه‌کاره** | `ZibalPayment` + `PaymentRail` فقط در PR #100 | merge #100 | — |
| F-06/F-07 | کمیسیون ۷٪ بعد از تخفیف بدون ارسال | **نیمه‌کاره** | `CommissionRule` وجود دارد؛ seed/پیش‌فرض ۷٪ و مبنای محاسبه نیازمند بررسی | — | تست واحد مبنا |
| F-16 | کلید غیرفعال‌سازی روش پرداخت بدون deploy | **نیمه‌کاره** | `payment-environment.controller.ts` + `PaymentProvider` enum | — | اثبات در UI |
| T-01 | CPC = ۲٬۰۰۰ تومان | **ندارد** | هیچ مدل یا سرویس CPC در `main` | — | ساخت با flag (P-03) |
| F-09/F-10, T-03, P-01 | مدل CPC | **ندارد** | — | — | وابسته به ledger |
| F-11..F-14 | برداشت، شبا، تسویه | **نیمه‌کاره** | `SellerSettlement` + `MarketplaceSettlementStatement` وجود دارد؛ برداشت کیف پول ندارد | merge #100 | F-12 نیازمند API شبا |

### ۳.۳ بک‌آفیس، نقش‌ها و ممیزی — AD، BO، E

| کد | خواسته | وضعیت | شاهد | بلوکر | اقدام بعدی |
| --- | --- | --- | --- | --- | --- |
| AD-03 | PII کامل فقط برای سوپرادمین | **پیاده‌سازی‌شده** | `common/pii/pii-mask.util.ts` + تست‌های `batch2-security-matrix` | — | — |
| AD-05 | لاگ ممیزی غیرقابل حذف/ویرایش، فقط سوپرادمین | **پیاده‌سازی‌شده** | `admin/audit/admin-audit-log.service.ts` + `admin-audit-action.ts` | — | — |
| AD-11 | پیامک برای رویدادهای مشخص، بقیه اعلان سایت | **نیمه‌کاره** | `notification-orchestrator.service.ts` + `notification-groups.ts` + `notification-quiet-hours.util.ts` | PR #98 (الگوها) | merge #98 |
| AD-13 | الگوی پیامک در پنل + کد فراز | **نیمه‌کاره** | PR #98: `sms-pattern-template.service.ts` + `AdminSmsPatternsView.tsx` | merge #98 | — |
| AD-18 | آدرس پنل = `opetlife.ir/backoffice` | **ندارد — نقص زنده** | مسیر `/backoffice` در کد **وجود ندارد**؛ `/backoffice` → ۳۰۷ → `/fa/backoffice` → **۴۰۴** | — | ساخت `/backoffice` + redirect `/admin` |
| E-01 | `/backoffice` جایگزین `/admin`؛ `/admin` redirect | **ندارد** | فقط `apps/web/app/[locale]/(admin)/admin` وجود دارد | — | — |
| BO-02 | نقش‌ساز کامل | **نیمه‌کاره** | `admin/access/admin-access-control.service.ts` | — | نقش‌ساز واقعی با ماژول×عمل×دامنه |
| BO-06 | مجوز = ماژول × عمل × محدودهٔ داده | **نیمه‌کاره** | `admin-vertical-scoping.e2e-spec.ts` | — | گسترش به همهٔ ماژول‌ها |
| BO-07 | فقط سوپرادمین نقش می‌سازد؛ مجوز حساس نیازمند تأیید دوم | **پیاده‌سازی‌شده** | `FeatureFlagChange` (تأیید دوم)؛ `erp-a-access-settings-system.e2e-spec.ts` | — | — |
| BO-12 | خروجی اکسل با مجوز و واترمارک | **ندارد** | — | — | — |
| BO-14 | صفحهٔ تنظیم با نسخه‌بندی و تاریخ اثر | **نیمه‌کاره** | `admin/settings` + `platform-settings` | — | نسخهٔ تنظیمات |
| BO-21 | کلیدهای اضطراری سوپرادمین | **نیمه‌کاره** | `FeatureFlag.isEnabled` global؛ کلید «فقط‌خواندنی سایت» ندارد | — | — |
| TC-12 | پنل feature flag با rollout/city/beta | **پیاده‌سازی‌شده** | `FeatureFlag` (cities/betaUserIds/rolloutPercentage) + `feature-flag-evaluator.ts` + تأیید دوم | — | — |
| E-05..E-09 | حسابداری ERP، HR، شیفت، CRM | **نیمه‌کاره** | `erp-a..erp-g` e2e ها exist؛ E-05 سند تفصیلی ندارد | تأیید حسابدار (ER-01) | منتظر مالک/حسابدار |

### ۳.۴ پایهٔ دامنه — A، ON، PT، ID، XM

| کد | خواسته | وضعیت | شاهد | بلوکر | اقدام بعدی |
| --- | --- | --- | --- | --- | --- |
| A-01 | یک حساب، چند پنل | **پیاده‌سازی‌شده** | `households`، `seller-os`، `provider-os`، `AdminShell` | — | — |
| ON-01 | ورود موبایل + کد پیامکی | **نیمه‌کاره** | `faraz-otp.provider.ts` + `faraz-sms.client.ts` + تست | credential فراز + الگوی تأییدشده | PR #98 برای پیوند الگو |
| PT-04 | جنسیت اجباری نیست؛ «نمی‌دانم» | **پیاده‌سازی‌شده** | `health` module؛ تست‌های pet-identity | — | — |
| PT-05 | میکروچیپ تکراری: ذخیره + پرچم + اطلاع | **پیاده‌سازی‌شده** | `fix/pet-microchip-duplicate` → PR #63 | — | — |
| XM-09 | مرکز رویداد | **پیاده‌سازی‌شده** | `common/events/domain-events.service.ts` + `DOMAIN_EVENT_TYPES` | — | — |
| XM-10 | جدول اثرات ۱۰ رویداد کلیدی | **ندارد** | سند مستقل ندارد | — | سند `docs/architecture/event-impact.md` |
| ID-01 | هر پت یک مالک اصلی | **پیاده‌سازی‌شده** | `pet-access-owners-only.e2e-spec.ts` | — | — |
| ID-15 | «حساب تأییدشده» = فقط موبایل تأییدشده | **پیاده‌سازی‌شده** | `member-trust` module | — | — |

### ۳.۵ فروشگاه، فروشنده، خدمات — S، C、O، SH، SL, B, BK, VT

| کد | خواسته | وضعیت | شاهد | بلوکر | اقدام بعدی |
| --- | --- | --- | --- | --- | --- |
| C-01 | کاتالوگ مرکزی توسط ادمین | **پیاده‌سازی‌شده** | PR #93 + `admin/commerce` | — | — |
| C-03 | دقیقاً ۳ عکس برای هر محصول | **نیمه‌کاره** | `catalog` module | — | بررسی enforcement |
| C-06 | افزایش قیمت > ۱۵٪ → صف تأیید | **ندارد** | — | — | — |
| C-07/C-08 | گران‌فروشی > ۳۰٪ → پنهان‌سازی | **ندارد** | — | — | — |
| C-04 | آپلود اکسل با تطبیق بارکد | **ندارد** | — | — | — |
| SH-06 | کیف پول پیش‌فرض روشن | **نیمه‌کاره** | `checkout` module | merge #100 | — |
| SH-13 | کالای نسخه‌ای با برچسب و تأیید فروشنده | **نیمه‌کاره** | `checkout` | — | — |
| SL-01 | پیشخوان کارمحور فروشنده | **پیاده‌سازی‌شده** | `seller-os` module | — | — |
| SL-02/SL-03 | امتیاز عملکرد با وزن قابل تنظیم | **نیمه‌کاره** | `seller-finance` | — | وزن‌های قابل تنظیم |
| SL-13 | خروج فروشنده (توقف ← تسویه ← آزادسازی) | **ندارد** | — | — | — |
| B-01/B-02 | پرداخت رزرو بعد از تأیید، فقط آنلاین | **پیاده‌سازی‌شده** | `booking` module + `batch3-booking.e2e-spec.ts` | — | — |
| BK-05 | واکسن ناقص: آپلود کارت تا ۴۸ ساعت قبل | **نیمه‌کاره** | `services-booking-depth.e2e-spec.ts` | — | — |
| BK-19 | امتیاز خدمت ۲ ساعت بعد از انجام | **نیمه‌کاره** | `service-intake` | — | — |
| VT-01 | انتخاب دامپزشک برای دیدن پرونده + انقضا ۷ روز | **پیاده‌سازی‌شده** | `vet-share` + `share-card-health.e2e-spec.ts` | — | — |
| VT-17 | یادداشت خصوصی دامپزشک فقط برای همان کلینیک | **نیمه‌کاره** | `vet-panel` / `clinic-os` | — | — |
| V-54 / VT-15 | مشاورهٔ آنلاین / نسخهٔ الکترونیکی | **مسدود** | — | **استعلام سازمان دامپزشکی** | پشت flag، فعلاً خاموش |

### ۳.۶ اعلان و ارتباطات — NT

| کد | خواسته | وضعیت | شاهد | اقدام بعدی |
| --- | --- | --- | --- | --- |
| NT-01 | مرکز اعلان با تب | **پیاده‌سازی‌شده** | `notifications` module | — |
| NT-03 | ساعات سکوت ۲۲–۸ | **پیاده‌سازی‌شده** | `notification-quiet-hours.util.ts` | — |
| NT-04 | حداکثر ۲ پیامک غیرحیاتی در روز | **پیاده‌سازی‌شده** | `notification-delivery.service.ts` | — |
| NT-05 | retry با خط دوم فراز، سپس push؛ لاگ تحویل | **نیمه‌کاره** | `faraz-sms.adapter.ts` + `notification-delivery-worker.service.ts` | تست retry خط دوم |
| NT-10 | هشدار امنیتی غیرقابل خاموشی | **پیاده‌سازی‌شده** | `notification-groups.ts` | — |
| NT-11 | زبان اعلان = زبان کاربر، الگوی جدا انگلیسی | **نیمه‌کاره** | `notification-templates.ts` | PR #98 الگوها |
| NT-07 | بات بله/تلگرام | **ندارد** | — | موج ۲ |
| NT-14/NT-16 | خبرنامه، کارت ماهانهٔ پت | **ندارد** | — | موج ۲/۳ |

### ۳.۷ طراحی و سیستم — UX, IA, PD, DS, JR

| کد | خواسته | وضعیت | شاهد | بلوکر | اقدام بعدی |
| --- | --- | --- | --- | --- | --- |
| UX-01 | نوار پایین ۵ تبی | **پیاده‌سازی‌شده** | `features/navigation/MemberNavigation.test.tsx` | — | — |
| UX-17 | لندینگ و لوگو قفل | **پیاده‌سازی‌شده / رعایت‌شده** | PR #81/#91 تأیید hero مشترک؛ `docs/qa/landing-*` | — | عدم دست‌زدن |
| UX-11 | WCAG 2.2 AA | **نیمه‌کاره** | تست‌های دسترس‌پذیری محدود | — | — |
| GC-10/GC-11 | RTL/LTR با خصوصیات منطقی | **پیاده‌سازی‌شده** | `scripts/verify-design-system.mjs` («logical direction only») | — | — |
| DS-01 | کتابخانهٔ کامپوننت مشترک در `packages/ui` | **نیمه‌کاره** | `packages/ui` روی `main` فقط ۱۹ کامپوننت دارد؛ PR #99 آن را کامل می‌کند | merge #99 | — |
| DS-02 | ۶ الگوی صفحه | **ندارد** | `PageTemplates.tsx` فقط در PR #99 | merge #99 | — |
| DS-05 | یک ساختار کارت مشترک | **ندارد** | `ObjectCard.tsx` فقط در PR #99 | merge #99 | — |
| DS-06 | ۵ حالت اجباری صفحه | **نیمه‌کاره** | `Skeleton`/`EmptyState`/`ErrorRecovery`/`OfflineBanner` در `main` | «بدون دسترسی» ندارد | — |
| DS-12 | Storybook + تست بصری خودکار | **نیمه‌کاره** | PR #99 دارد ولی **۶ snapshot fail** | اصلاح baseline | — |
| DS-17 | تأیید ۶ صفحهٔ کلیدی | **مسدود** | — | **تأیید مالک** | — |
| DS-20 | یک مالک سیستم طراحی | **پیاده‌سازی‌شده** | WB-16: پدرام | — | — |

### ۳.۸ جهانی و نسل بعد — GL، GP، GC، NX

| کد | خواسته | وضعیت | بلوکر |
| --- | --- | --- | --- |
| GL-01..GL-20 | نسخهٔ جهانی | **مسدود** | **ثبت شرکت خارجی + بازبینی حقوقی GL-08/GP-13** (WB-20) |
| GC-10..GC-12 | RTL/LTR، فونت، تقویم | **پیاده‌سازی‌شده/نیمه‌کاره** | تقویم جلالی محلی نیازمند بررسی |
| NX-01..NX-20 | نسل بعد | **مسدود/موج ۳** | طبق NX-20 پشت flag، پس از فاز ۱ |

---

## ۴. گزارش شکاف انتشار (Deployment Gap Report)

### ۴.۱ شکاف‌های مسدودکننده (P0)

| # | شکاف | اثر | شاهد | مسیر رفع |
| --- | --- | --- | --- | --- |
| G-01 | **production خودش را staging معرفی می‌کند** | هیچ staging واقعی برای تأیید انتشار وجود ندارد؛ TC-04/TC-11 نقض | `deploy.yml:45`؛ `/api/health/version` → `"environment":"staging"` | اصلاح `deploy.yml` + ساخت staging مستقل |
| G-02 | **شاخهٔ پیش‌فرض GitHub اشتباه است** | بازکردن repo، کلون پیش‌فرض و PRهای جدید را از `main` منحرف می‌کند | `default_branch = claude/pet-life-os-foundation-8synln` | تغییر به `main` (دسترسی admin لازم) |
| G-03 | **`main` حفاظت ندارد** | merge بدون CI سبز یا review ممکن است؛ GR-14/TC-16 نقض | `Branch not protected`، rulesets `[]` | ruleset: CI سبز + ۱ review + منع force-push |
| G-04 | **`/backoffice` ۴۰۴ می‌دهد** | AD-18/E-01 نقض؛ مسیر canonical ادمین شکسته است | `https://opetlife.ir/backoffice` → ۳۰۷ → `/fa/backoffice` → ۴۰۴ | ساخت route + redirect `/admin` |
| G-05 | **PR #100 (پرداخت) CI قرمز** | کل P1-PAYMENTS و FE-14/15/16 و PY-05/19 مسدود | ۳ E2E fail | اصلاح E2E + rebase |
| G-06 | **PR #99 (design system) CI قرمز** | DS-01/02/05/12 مسدود | ۶ snapshot ناهماهنگ | بازتولید baseline + rebase |
| G-07 | **PR #98 conflict دارد** | AD-13/NT-11 مسدود | `mergeStateStatus: DIRTY` | rebase روی `main` |
| G-08 | **مهلت مرجوعی ۷ روز به‌جای ۴۸ ساعت** | نقض مستقیم O-04/O-07؛ ریسک مالی | `order-policy.ts:24` | اصلاح + تست |
| G-09 | **migration برگشت‌پذیر نیست** | EX-13 نقض؛ rollback فقط «بازگرداندن build» است، schema برنمی‌گردد | `migrations/*/migration.sql` فقط `up` | رویهٔ rollback مکتوب + تست |
| G-10 | **CPC، پاوما، کش‌بک، کیف پول عمومی، برداشت، تسویهٔ خودکار وجود ندارند** | F-01..F-16, T-01..T-09 ناقص | جست‌وجوی `main` | وابسته به merge #100 |

### ۴.۲ آنچه واقعاً پیاده‌سازی شده ولی مستقر/منتشر نشده

| کار | وضعیت | اقدام |
| --- | --- | --- |
| کنترل‌پنل feature flag با تأیید دوم | در `main` و مستقر (PR #97) | — |
| مدل دفتر دوطرفه + `LedgerService` | در `main` | توسعه در PR #100 |
| دفترکل، wallet، Zibal، card-transfer، settlement | فقط در PR #100 | رفع G-05 |
| `packages/ui` کامل + Storybook + تست بصری | فقط در PR #99 | رفع G-06 |
| الگوی پیامک فراز + پنل مدیریت | فقط در PR #98 | رفع G-07 |
| ورود OTP فراز + toggle گوگل | در `main`؛ PR #59 نسخهٔ قدیمی‌تری از همان را دارد | بازسازی انتخابی (TC-17) |

### ۴.۳ ریسک‌های پذیرفته‌شدهٔ مالک (بدون اقدام ما)

GL-08/GP-13 (مشاورهٔ دامپزشک ایرانی به کاربران جهانی — تحریم) · IA-13/IA-17 (بدون تست کاربر) ·
XM-04 (تشخیص اورژانس فقط متنی) · FE-11 (کمیسیون مرجوعی برنمی‌گردد) ·
ID-15 (شرط «تأییدشده» عملاً بی‌اثر) · NX-20 (دامنهٔ انتشار بسیار بزرگ) ·
WB-13 (کیفیت فقط با تست خودکار).

---

## ۵. برنامهٔ اجرای وابسته‌محور

| موج | بسته | تصمیم‌ها | پیش‌نیاز |
| --- | --- | --- | --- |
| **P0-A** | رفع G-01/G-02/G-03: محیط، default branch، ruleset | TC-04, TC-11, TC-16, WB-09 | دسترسی admin GitHub (G-02/G-03) |
| **P0-B** | رفع G-04: `/backoffice` + redirect `/admin` | AD-18, E-01, BO-* | طراحی ۶ صفحه (DS-17) یا نسخهٔ حداقلی هم‌راستا |
| **P0-C** | رفع G-08: پنجرهٔ مرجوعی ۴۸ ساعت | O-04, O-07, FE-* | تست واحد + E2E |
| **P0-D** | رفع G-05: CI سبز PR #100 | F, PY, FE-14..16, OF-13 | — |
| **P0-E** | رفع G-06: CI سبز PR #99 | DS-01/02/05/12 | تأیید DS-17 برای ادامهٔ کار UI |
| **P0-F** | رفع G-07: rebase PR #98 | AD-13, NT-11 | PR #100 برای schema مشترک |
| **P0-G** | رفع G-09: rollback پذیرفتنی | EX-13, TC-11 | رویهٔ مکتوب |
| **P1** | هستهٔ دامنه: ماشین وضعیت، جدول اثرات، event bus | OF-01, XM-09/10, WB-19 | P0-D |
| **P2** | بک‌آفیس: نقش‌ساز، ممیزی، تنظیمات | BO-02..BO-21, AD-*, E-* | P0-B |
| **P3** | ماژول‌ها به ترتیب WB-14 | PT→SH/SL→BK/VT→LP/SR→CM | P1, P2 |

---

## ۶. چیزهایی که فقط مالک می‌تواند تصمیم بگیرد

| مورد | کدها | اثر |
| --- | --- | --- |
| پنجرهٔ مرجوعی ۴۸ ساعت یا ۷ روز؟ | O-04, O-07 | اصلاح قانون/کد |
| default branch و ruleset | TC-16, WB-09 | نیازمند admin repo |
| تأیید ۶ صفحهٔ DS-17 | DS-17, WB-10 | گسترش `packages/ui` |
| سرفصل حساب و نقشهٔ رویداد→سند | ER-01, E-05 | تکمیل حسابداری |
| قیمت اشتراک | T-04, U-05 | پیکربندی |
| ثبت شرکت خارجی + حقوق GL-08 | WB-20, GL-08, GP-13 | فاز ۴ |
| بازبینی حقوقی T-13 (ناشناس‌سازی پس از حذف) | T-13, TC-20 | حذف حساب production-ready نمی‌شود |
| قرارداد/credential زیبال، فراز، الوپیک، شبا | F-14, F-12, P-02 | مسیر جایگزین دستی فعال می‌ماند |
