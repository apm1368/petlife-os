# PET LIFE OS — ممیزی واقع‌محور پیاده‌سازی

> وضعیت: **فاز صفر تکمیل‌شده برای برنامه‌ریزی؛ نه گواهی «آمادهٔ تولید» برای همهٔ قابلیت‌ها**
> تاریخ ممیزی: ۲۰۲۶-۱۰-۳۱
> مبنای کد: `origin/main` در کامیت `b8c57c098e1c8d47a652ccefee7b4c16d76ef96b`
> شاخهٔ سند: `codex/phase-zero-implementation-audit`
> مالک تصمیم‌های محصول/حقوقی: Product / Legal / Operations
> اسناد مکمل: [تصمیم‌های باز](./open-decisions.fa.md)، `docs/release/external-adapter-status.md` و `docs/product/data-retention-decisions.md`

### اولویت منابع این ممیزی

1. پرامپت مادرِ پیوست‌شده توسط مالک محصول (اجبارهای ایمنی، دامنه‌ها و ترتیب وابستگی).
2. جلسهٔ مالی/فلوهای Manus که در ۲۰۲۶-۱۰-۳۱ خوانده شد؛ آن جلسه در انتهای دادهٔ قابل‌مشاهده به‌دلیل کمبود اعتبار ناتمام بود، بنابراین فقط تصمیم‌های صریح آن به‌عنوان ورودی استفاده شده و شکاف‌ها در سند تصمیم‌های باز آمده‌اند.
3. کد `origin/main`، اسکیما، CI، health زنده و مستندات versioned مخزن.

هر جا این منابع با هم ناسازگارند، این سند به‌جای انتخاب پنهانی، مورد را به تصمیم باز تبدیل می‌کند.

---

## 1. این سند چه می‌گوید و چه نمی‌گوید

این سند، وضعیت قابل اثبات PET LIFE OS را از روی کد، اسکیما، تست، CI و استقرار بررسی می‌کند. واژه‌ها عمداً دقیق‌اند:

| برچسب | معنای عملی |
| --- | --- |
| **پیاده‌سازی‌شده** | مدل/سرویس/مسیر مرتبط در شاخهٔ اصلی وجود دارد. این به‌تنهایی به معنی قابل‌فروش یا متصل به شریک خارجی نیست. |
| **آزموده** | حداقل تست واحد/یکپارچه/E2E مرتبط در مخزن اجرا شده است. |
| **آمادهٔ پیکربندی** | کد واقعی موجود است ولی کلید، حساب، پترن، قرارداد یا تأیید بیرونی لازم دارد. |
| **Sandbox / شبیه‌سازی** | برای توسعه و QA قابل استفاده است؛ نباید به کاربر تولیدی به‌عنوان عملیات واقعی نشان داده شود. |
| **ناقص / تصمیم‌وابسته** | بخش‌هایی از مدل یا UI وجود دارد، اما فلو، سیاست، مالکیت داده یا قرارداد لازم بسته نشده است. |
| **مسدود بیرونی** | تکمیل فقط با اطلاعات/مجوز/اعتبارنامه/قرارداد خارج از مخزن ممکن است. |

در نتیجه وجود دکمه، route یا دادهٔ seed به‌تنهایی اثبات «ارائه‌دهندهٔ فعال»، «پرداخت انجام‌شده» یا «تحویل واقعی» نیست. همهٔ فلوهای پولی، پزشکی، اضطراری، احراز هویت و دادهٔ خصوصی باید در همین چارچوب تصمیم و آزمایش شوند.

---

## 2. نتیجهٔ اجرایی در یک نگاه

### آنچه اکنون واقعاً وجود دارد

- یک monorepo عملیاتی با وب Next.js، API NestJS، PostgreSQL/PostGIS، Redis و Prisma؛ حوزه‌های بسیار گسترده‌ای در آن مدل و route دارند.
- پنل‌های کاربر، ادمین، ارائه‌دهنده/کلینیک، فروشنده، تجارت، رزرو، سلامت، سفر، بیمه، حمایت حیوانات، محتوا، اعلان و حریم خصوصی در کد دیده می‌شوند.
- سامانهٔ نقش ادمین، نقش سازمانی فروشنده/ارائه‌دهنده، محدودسازی عمودی ادمین، لاگ ممیزی، state machineهای متعددی در دامنه‌ها و پایهٔ دفتر کل دوطرفه وجود دارد.
- آپلود/دانلود خصوصی و URL امضاشده در لایهٔ storage، OTP و پیامک Faraz در لایهٔ provider، و feature gate برای Google OAuth وجود دارند.
- build فعلی `main` روی سرور `opetlife.ir` قابل مشاهده است و SHA سلامت آن با `main` یکسان است.

### آنچه نباید آماده تلقی شود

- هیچ evidence این ممیزی، فعال‌بودن واقعی درگاه پرداخت، نقشه/فاصله، ناوگان تاکسی، ارسال، بازارهای بیرونی، بیمه، اقامت، S3 یا Google OAuth را نشان نمی‌دهد.
- «کیف پول عمومی کاربر»، گردش اعتبار قابل برداشت، حساب بانکی/شبا و فلو کامل کارت‌به‌کارت با آپلود فیش و بررسی ادمین، مدل دامنهٔ تأییدشده و کامل ندارند.
- عملیات اضطراری ۲۴/۷، واگذاری حیوان به همراه انتقال مالکیت، ویدئوی اشتراکی خصوصی، سفر خارجی با SLA انسانی، و تسویهٔ واقعی شرکا نباید بدون تکمیل برنامهٔ این سند عرضه شوند.
- تصمیم حقوقی برای retention/delete/export داده هنوز صریحاً `DECISION_PENDING` است؛ حذف واقعی حساب عمداً اجرا نمی‌شود.

### اولویت پیشنهادی وابستگی

1. ایمنی و دادهٔ پایه: واقعیت محیط، role/tenant/audit، قرارداد پول و رسانه، سیاست retention.
2. حساب، خانوار، پت و آدرس/حریم خصوصی با حل تعارض محصول.
3. ارائه‌دهنده و رزرو با ظرفیت/قیمت/لغو/پرداخت قابل حسابرسی.
4. سلامت و کلینیک؛ سپس emergency با مسئولیت و escalation انسانی.
5. اشتراک و محتوای ویدئویی خصوصی.
6. فروشگاه و fulfillment؛ سپس سفر/تاکسی/حمایت حیوانات.
7. کیف‌پول/تسویه/ERP پس از تعریف واحد پول، ledger posting و policy مالی.
8. QA تولید، migration rehearsal و مشاهده‌پذیری؛ اپ موبایل بعد از تثبیت قرارداد وب/API.

---

## 3. شاهد نسخه، گیت و استقرار

| موضوع | شاهد | نتیجه |
| --- | --- | --- |
| شاخهٔ release | `origin/main`، SHA `b8c57c0…` | مرجع قابل استقرار فعلی است. |
| استقرار زنده | `GET https://opetlife.ir/api/health/version` در ۲۰۲۶-۱۰-۳۱ SHA بالا را برگرداند | live با همان کامیت `main` منطبق بوده است؛ این فقط سلامت نسخه است، نه تأیید همهٔ integrationها. |
| سلامت | `GET /api/health/live` پاسخ ۲۰۰/`ok`؛ صفحات `/fa` و `/en` پاسخ ۲۰۰ | لایهٔ وب/API در آن زمان در دسترس بوده‌اند. |
| CI | `.github/workflows/ci.yml` | Node 20، Prisma generate، lint، typecheck، migration deploy، unit، E2E و build را اجرا می‌کند. |
| deploy | `.github/workflows/deploy.yml` | فقط با `main` اجرا می‌شود؛ پس از CI با SHA مشخص روی VPS deploy و smoke می‌کند. |
| محیط اعلام‌شده در health | `staging` | نباید بدون readiness واقعی به معنی production business-ready تفسیر شود. |
| default branch در GitHub | `claude/pet-life-os-foundation-8synln` در زمان ممیزی | **ریسک حکمرانی:** default GitHub با شاخهٔ release (`main`) یکی نیست؛ PR اشتباه ممکن است به شاخهٔ نامربوط باز شود. |
| PR باز | #59، `claude/integrate-design-1c0280b` | شاخه‌ای بسیار واگرا و قدیمی است؛ مقایسهٔ درختی آن با main حدود ۹۷۵ فایل متفاوت نشان می‌دهد و **نباید wholesale merge شود**. |

### شاخه‌ها و پراکندگی تاریخی

- تغییرات شاخهٔ `codex/card-transfer-payments` به‌صورت squash در PR #92 وارد `main` شده‌اند؛ commit topology به علت squash، ظاهراً commitهای یکتا نشان می‌دهد، اما مقایسهٔ محتوای tree نشان می‌دهد ویژگی یکتای قابل انتقالی باقی نمانده است.
- `codex/admin-product-catalog` با `main` از نظر tree همگرا است و محتوای آن از طریق PR #93 در `main` است.
- پاک‌سازی worktreeها یا حذف remote branchها عملیاتی destructive است و باید فقط بعد از ثبت جدول «branch → تصمیم نگهداری/حذف» و تأیید مالک انجام شود. این ممیزی چیزی را حذف نکرده است.

---

## 4. معماری موجود و مرزهای مسئولیت

| لایه | واقعیت موجود | پیامد برای برنامه‌ریزی |
| --- | --- | --- |
| Web | Next.js 14 / React 18 در `apps/web`، app router، localeهای `fa` و `en` | همهٔ توسعه‌ها باید RTL/LTR، حالت mobile، loading/empty/error/permission را همراه route بسازند. |
| API | NestJS 10 در `apps/api`، حدود ۱۴۹ controller و ۱۰۰+ module/سطح controller | API موجود گسترده است؛ endpoint جدید نباید منطق tenant/role را دور بزند. |
| Database | PostgreSQL با PostGIS و Prisma 5؛ ۹۷ migration تا زمان ممیزی | هر migration باید additive، دارای backfill/rollback plan و rehearsal باشد. |
| Cache/queue | Redis برای rate-limit/OTP و اجزای runtime | نبود credential صحیح Redis باعث شکست setup E2E می‌شود؛ این dependency باید در runbook بماند. |
| Packages | `config`، `types`، `ui`، `design-tokens`، `validation` و بسته‌های مشترک | design-token یا contract مشترک محل ترجیحی تغییرهای cross-surface است. |
| Media | driver محلی و S3-compatible با URL امضاشده | local storage برای production مجاز نیست؛ private object/key و authorization باید حفظ شود. |
| Observability | health/version، audit/domain events و پنل system status | برای SLA/پرداخت/پیامک هنوز dashboards و alertهای عملیاتی کامل باید تأیید شوند. |

### سنجش کیفیت تکرارشده در فاز صفر

این اعداد در worktree تمیز از `origin/main`، با DB جداگانهٔ `petlife_os_test` و migrationهای کامل گرفته شده‌اند؛ هیچ دیتای production تغییر نکرد.

| فرمان | نتیجه |
| --- | --- |
| `pnpm install --frozen-lockfile --offline` | موفق |
| `pnpm --filter @petlife/api db:generate` | موفق؛ prerequisite Prisma client بود |
| `pnpm lint` | موفق؛ ۰ error، ۳ warning غیرمسدودکننده (دو `img` و یک dependency hook) |
| `pnpm typecheck` | موفق؛ ۹ task |
| `pnpm test` | موفق؛ API: ۱۸۷ test در ۳۱ suite، Web: ۹۸۳ test در ۲۲۷ file؛ جمعاً **۱۱۷۰** |
| E2E API با DB و Redis جدا/احراز‌شده | موفق؛ **۸۵۵ test در ۷۴ suite**، ۰ failure، حدود ۲۴۵ ثانیه |

نکتهٔ صحت‌سنجی: اجرای ابتدایی E2E بدون `prisma generate`/DB و سپس بدون credential Redis معتبر، شکست محیطی داد و به‌عنوان failure محصول ثبت نشده است. اجرای نهایی بعد از فراهم‌شدن همان prerequisiteها سبز شد. پیام‌های `GOOGLE_AUTH_DISABLED` در تست‌های feature-gate انتظار می‌رفتند.

---

## 5. نقشهٔ موجودیت‌های اصلی و اثر فیلدها

این جدول data dictionary تمام ۹۷ migration نیست؛ میدان‌های محصولی/حساس را مشخص می‌کند. مرجع قطعی نوع، nullable بودن و indexها: `apps/api/prisma/schema.prisma` در SHA این سند است. هیچ field حساس یا secret در این سند نمایش داده نشده است.

### 5.1 هویت، خانوار و پت

| موجودیت / field | کاربرد یک‌خطی | اثر جانبی یا قاعدهٔ مهم |
| --- | --- | --- |
| `User.id` | شناسهٔ پایدار کاربر | نباید با تلفن/ایمیل جایگزین شود؛ بسیاری از سوابق به آن ارجاع دارند. |
| `User.passwordHash` | هش Argon2 رمز عبور | هیچ API نباید رمز قابل بازیابی یا logشده تولید کند. |
| `AuthIdentity` | پیوند هویت Password/OTP/Google | linking باید از ساخت کاربر تکراری جلوگیری کند. |
| `Household` | مرز مالکیت خانواده برای پت/آدرس/اشتراک | delete یک عضو نباید بی‌صدا مالکیت دیگران را از بین ببرد. |
| `HouseholdMember.role` | preset نقش خانوادگی | منبع نهایی مجوز پت نیست؛ grantهای پت جداگانه‌اند. |
| `HouseholdInvitation` | دعوت و وضعیت عضویت | expiry/revoke باید audit شود و ارسال واقعی نیازمند provider است. |
| `Pet.householdId` | مالکیت خانوادگی پت | cascade database جایگزین policy انتقال/آرشیو نیست. |
| `Pet.name`, `species` | هویت پایهٔ پت | در فلوهای جدید باید mandatory policy و پیام migration برای رکوردهای قدیمی تعیین شود. |
| `Pet.sex` و `neuteredStatus` | وضعیت‌های قابل‌دانستن | `NULL` با `UNKNOWN` متفاوت است؛ UI نباید هر دو را «نامشخص» collapse کند. |
| `Pet.birthDate` / `approximateAgeMonths` | سن دقیق یا تقریبی | اعتبارسنجی باید تعارض بین سن/تاریخ را کنترل کند. |
| `Pet.photoUrl` | مرجع عکس پت | file باید private/signed باشد؛ URL عمومی دائمی برای رکورد خصوصی قابل قبول نیست. |
| `Pet.microchipNormalized` | نسخهٔ نرمال‌شدهٔ میکروچیپ | برای uniqueness استفاده می‌شود؛ مقدار raw را خراب نکنید. |
| `Pet.lifecycleStatus` | `ACTIVE/LOST/DECEASED/MEMORIAL` و مشابه | status واقعی با حذف UI فرق دارد؛ تغییر lifecycle باید event/audit و قواعد دسترسی داشته باشد. |
| `Pet.deletedAt` | soft-delete آماده‌شده | comment اسکیما می‌گوید endpoint archive/delete هنوز وجود ندارد؛ آن را قابلیت کامل تلقی نکنید. |
| `PetAccessGrant` | grant مستقل برای خانواده/کلینیک/موقت | دسترسی مؤثر union grantهای فعال است؛ revoke باید non-destructive بماند. |
| `ActivePetPreference` | انتخاب پت فعال برای یک context | فقط در surfaceهایی که feature واقعاً پشتیبانی می‌کند نمایش داده شود. |

### 5.2 آدرس، رزرو و ارائه‌دهنده

| موجودیت / field | کاربرد یک‌خطی | اثر جانبی یا قاعدهٔ مهم |
| --- | --- | --- |
| `CustomerAddress.householdId` | آدرس به خانواده، نه به کاربر منفرد | باید tenant-scoped خوانده/نوشته شود. |
| `addressLine`, `city`, `countryCode` | مختصات اصلی آدرس | دادهٔ شخصی محسوب می‌شود؛ retention/export/delete و masked display می‌خواهد. |
| `postalCode`, `phone`, `recipient` | اطلاعات delivery/booking | فقط با ضرورت عملیاتی جمع شود؛ مورد «اطلاعات آدرس نگیریم» هنوز تصمیم متعارض باز است. |
| `latitude`, `longitude` | موقعیت دقیق | از حساس‌ترین fieldهاست؛ log، public API و provider share باید حداقل‌سازی شوند. |
| `ProviderOrganization` | سازمان ارائه‌دهنده | membership/verification/status باید قبل از public discoverability چک شود. |
| `ProviderUser.role` | `OWNER/VET/STAFF` در یک سازمان | global admin role نیست؛ cross-org read ممنوع است. |
| `ProviderService` | خدمت، قیمت/مدت/ظرفیت provider | قیمت snapshot رزرو نباید با ویرایش بعدی provider عوض شود. |
| `Booking` | واحد رزرو | transitionهای لغو/تکمیل/پرداخت باید در transaction و audit باشند. |
| `BookingSeries` | تعریف رزرو تکرارشونده | لغو یک occurrence نباید کل series را حذف کند. |
| `CustomerAddress` روی `Booking` | مقصد/مبدا یا آدرس خدمت | حذف آدرس reference شده نباید تاریخچهٔ رزرو را بشکند. |

### 5.3 سلامت، کلینیک و emergency

| موجودیت / field | کاربرد یک‌خطی | اثر جانبی یا قاعدهٔ مهم |
| --- | --- | --- |
| `HealthProfile`, `Allergy`, `Condition`, `Medication` | سلامت ساختاریافتهٔ پت | permission پت و consent مقدم بر نمایش به provider است. |
| `MedicalDocument` | سند پزشکی آپلودی | به signed download، virus/file policy، retention و event دسترسی نیاز دارد. |
| `ClinicalVisit`, `Prescription`, `LabResult`, `ImagingStudy` | رکوردهای کلینیکی | ownership کلینیک/مالک و حق ویرایش باید policy حقوقی داشته باشد. |
| `PetEmergencyInfo` | اطلاعات emergency پت | **فقط اطلاعات پت است، نه پرونده/تریاژ/صف emergency ۲۴/۷.** |
| `HealthShareLink` / `PetAccessGrant` | share محدود سلامت | scope، زمان انقضا و revocation باید در UI کاملاً مشخص باشد. |

### 5.4 فروشگاه، پرداخت و دفتر کل

| موجودیت / field | کاربرد یک‌خطی | اثر جانبی یا قاعدهٔ مهم |
| --- | --- | --- |
| `Product` | کاتالوگ مرکزی محصول | قیمت فروشنده در این موجودیت نباید جای بگیرد؛ admin catalog فقط source-of-truth محصول است. |
| `ProductVariant` / media | variant و رسانهٔ محصول | media باید ترتیب، alt، moderation و ۳ تصویر مورد نیاز محصول را به‌طور جدا QA کند. |
| `SellerOrganization`, `SellerMembership` | فروشنده و اعضای آن | roleهای seller فقط در سازمان خودشان مجازند. |
| `SellerOffer` | قیمت/موجودی/وضعیت فروشنده برای محصول | price و stock را از catalog مرکزی جدا نگه می‌دارد؛ تغییر باید audit شود. |
| `Cart`, `Checkout`, `Order`, `OrderItem` | خرید تا سفارش | باید seller split، snapshot قیمت/مالیات/ارسال و وضعیت لغو را بدون overwrite نگه دارند. |
| `PaymentIntent.amount` | مبلغ intent به ریال integer | float ممنوع؛ amount باید با order/checkout snapshot سازگار باشد. |
| `PaymentAttempt` / `Transaction` | تلاش و نتیجهٔ gateway | retry باید row جدید/transition مجاز ایجاد کند؛ نتیجهٔ شبیه‌سازی success واقعی نیست. |
| `Refund` | درخواست/نتیجهٔ بازپرداخت | append-only؛ شکست refund نباید row تاریخی را overwrite کند. |
| `LedgerTransaction` / `LedgerEntry` | پایهٔ دفتر کل دوطرفه | debit و credit باید متوازن باشند؛ correction با entry معکوس، نه edit. |
| `SellerSettlement` و subledger | محاسبه/تأیید/پرداخت فروشنده | پرداخت بیرونی واقعی و سند بانکی باید جداگانه prove شود. |
| **Wallet (عمومی کاربر)** | — | مدل `Wallet` یا ledger per-user برای balance/withdrawal در schema فعلی دیده نشد؛ این gap مستقل است. |
| **رسید کارت‌به‌کارت** | — | مدل کاملِ card account + payment transfer + upload receipt + admin decision در core commerce تأیید نشد؛ با receipt کمک مالی اشتباه گرفته نشود. |

### 5.5 اشتراک، سفر، حمایت و اعتماد

| موجودیت / field | کاربرد یک‌خطی | اثر جانبی یا قاعدهٔ مهم |
| --- | --- | --- |
| `SubscriptionPlan`, `SubscriptionPlanPrice`, `SubscriptionEntitlement` | طرح، قیمت و حق‌استفادهٔ اشتراک | نرخ فقط برای subscription است؛ باید کشور/ارز/بازه و grandfathering مشخص باشد. |
| `TravelBooking`, `TravelBookingPet`, event/document-share | رزرو و مدارک سفر | credential شریک/اقامت و SLA انسانی در schema حل نمی‌شود. |
| `SupportCampaign`, `DonationIntent` | کمپین و قصد کمک | رسید کمک مالی خصوصی است؛ success خارجی نیازمند provider واقعی است. |
| `LostPetIncident` / sighting | مفقودی و گزارش مشاهده | موقعیت دقیق باید masked و moderation شود. |
| `AdminAuditLog` | who/what/when عملیات ادمین | دلیل و before/after برای actionهای حساس لازم است؛ لاگ جای policy retention نیست. |
| `PlatformSetting` | feature flag/config محصول | flag محیطی/secret نیست؛ تغییر flagهای خطرناک هم audit و rollout می‌خواهد. |

---

## 6. نقش‌ها و isolation که همین امروز در کد وجود دارند

### نقش ادمین

`AdminRole` شامل `SUPER_ADMIN`، `ADMIN`، `SUPPORT`، `TRUST_SAFETY`، `FINANCE`، `OPERATIONS`، `CONTENT`، `VERIFICATION`، `READ_ONLY`، `EDITOR`، `PARTNER_OPERATIONS`، `CLINIC_OPERATIONS`، `COMMERCE_OPERATIONS`، `ANALYTICS`، و نقش‌های محدود `CONTENT_ADMIN`، `SHOP_ADMIN`، `SERVICE_ADMIN`، `SUPPORT_AGENT` است.

- scope عمودی: `CLINIC`، `GROOMING`، `ACCOMMODATION`، `INSURANCE`، `SHOP`، `CONTENT`، `SUPPORT`.
- نقش محدود باید row-level scope داشته باشد؛ role name به‌تنهایی authorization قابل اعتماد نیست.
- عملیات ادمین موجود شامل فهرست کاربران، وضعیت/role، commerce catalog، moderation، finance operations، subscription، trust، support، audit و system readiness است.
- امکان reset رمز کاربر از طریق self-service auth وجود دارد، اما اعطای/بازنشانی دستی رمز توسط ادمین باید فقط با flow امن، اطلاع‌رسانی، audit و سیاست هویت طراحی شود؛ هرگز password plain-text نیست.

### نقش سازمانی

- ارائه‌دهنده: `OWNER`، `VET`، `STAFF`.
- فروشنده: `OWNER`، `ADMIN`، `OPERATIONS`، `CATALOG_MANAGER`، `ORDER_MANAGER`، `FINANCE`، `SUPPORT`، `VIEWER` و status عضویت `PENDING/ACTIVE/DEACTIVATED`.
- این نقش‌ها هیچ‌کدام admin platform نیستند. هر route باید organization id را از context authorization بگیرد، نه body/query کاربر.

### guardrailهایی که نباید در توسعه‌های بعدی دور زده شوند

1. query مستقیم Prisma از controller برای دادهٔ چندمستاجره ممنوع؛ service باید ownership/tenant check کند.
2. URL رسانه، شماره تلفن، آدرس و پروندهٔ پزشکی در لاگ plaintext یا response عمومی قرار نگیرد.
3. status transition فقط در service مرکزی و با transition table/validate مجاز است.
4. عملیات مالی، role، verification، payout، refund، moderation و share access باید audit row بسازند.
5. soft-delete/archival بر hard-delete ترجیح دارد مگر retention policy صریح داشته باشیم.

---

## 7. وضعیت دامنه‌ها: موجود، قابل ارائه، یا باز

| دامنه | شاهد موجود | وضعیت واقع‌محور | کار باقی‌ماندهٔ تعیین‌کننده |
| --- | --- | --- | --- |
| Auth و account | password، OTP provider abstraction، Google gate، session/privacy/export | **هسته موجود؛ external auth جزئی** | Faraz credential/pattern، Google client، policy reset/recovery، production rate-limit/monitoring. |
| User/admin/RBAC | admin users/access/audit controller، role/vertical schema | **قابل توسعه، نیازمند QA مجوز** | matrix endpoint×role، سناریوی super admin approval، audit review UI. |
| Household/pet | household، invite، pet access، lifecycle، health profile | **هستهٔ قوی اما policy ناقص** | required field policy، transfer/deceased flow، عکس خصوصی و audit upload. |
| آدرس | `CustomerAddress` و relation رزرو/checkout | **مدل موجود، تصمیم محصول متعارض** | روشن‌کردن «عدم دریافت آدرس» در برابر delivery/at-home، geo/privacy/retention. |
| Provider و booking | provider org/user/service، booking، series، transport | **پیاده‌سازی گسترده؛ production readiness اثبات نشده** | availability/capacity، tax/rounding، cancellation/refund، provider verification/real inventory. |
| Grooming/walking/training/boarding | service types و booking surfaces | **سطح دامنه موجود** | package/add-on، meet&greet، incident/claim، live provider data، full acceptance tests. |
| Clinic و health | health، clinical، documents، vet/clinic OS | **داده/route غنی؛ sensitive-domain** | consent، professional verification، legal record ownership/retention، live appointment rules. |
| Emergency | `PetEmergencyInfo` و UI/references | **ناقص برای وعدهٔ ۲۴/۷** | case state machine، triage انسانی، verified vet directory، geolocation/consent، SLA/failure fallback. |
| Subscription | plan/price/entitlement/billing and admin | **فلو پایه موجود، gateway sandbox** | entitlement migration، real billing, invoice/refund, private video library/streaming. |
| Marketplace | catalog، seller offer/inventory/order/checkout/shipping abstractions | **قوی در core؛ external operations ناقص** | multi-vendor rule، real payment/shipping، card-transfer receipt، product media policy، search/reviews. |
| Travel | travel booking/pet/event/document share | **مدل/flow موجود؛ partner-dependent** | verified inventory/accommodation, manual SLA, pricing authority, cancellation, external credentials. |
| Taxi | transport/booking facilities | **ناقص برای عملیات واقعی** | distance/map provider, driver/dispatch, quote expiry, subsidy & debt policy. |
| Insurance | application/claim-prep/insurer portal code | **preparation، نه بیمهٔ متصل** | insurer contract/API, quote/bind/claim lifecycle and legal agreements. |
| Animal support / shelter | campaign، donation، NGO portal/support needs | **مدل و برخی رسیدها موجود** | organization verification, campaign policy, 1% commission settlement, adoption ownership transfer. |
| Finance / ERP | payment intent/attempt/refund/reconciliation/ledger، seller finance | **foundation، نه مالی production-ready** | real merchant, user wallet, card-to-card, payout bank account/KYC, accounting close/export, reconciliation operations. |
| Notifications | preferences/templates/Faraz adapter | **ready for configuration** | approved pattern UIDs, delivery semantics, opt-in/opt-out matrix, production monitoring. |
| Content/community/support | content/admin, community, support/trust surfaces | **موجود در codebase** | moderation policy, ownership, retention/legal, real seed/operational workforce. |
| Design system / pages | ۳۳۲ page file و packageهای UI/token؛ design docs | **سطوح زیاد، کیفیت route-by-route متفاوت** | locked landing preservation, user-approved hero asset parity, visual regression, complete mobile/RTL/LTR states. |

### صفحه‌ها و surfaceهای ساخته‌شده

به جای فهرست گمراه‌کنندهٔ صدها route، این گروه‌ها در `apps/web/app/[locale]` موجودند و باید با inventory ماشینی `docs/qa/design-route-inventory.json` نگهداری شوند:

- عمومی: landing، جست‌وجو/discovery، مقاله/محتوا، FAQ، legal/status/support.
- حساب: login/register/OTP/password، profile، privacy/export/delete، settings، consent/security.
- خانواده و پت: household، invitations، pet profile، active pet، health/care reminders/calendar، memories و safety card.
- خدمات: provider discovery/detail، booking، transport، grooming/walking/training/boarding، clinic/vet panel و records.
- تجارت: shop/catalog/product، cart/checkout/order، seller OS/finance و admin catalog.
- سفر/تاکسی/بیمه: travel dashboard/booking، taxi-related services، insurance application/claim preparation.
- حمایت حیوانات: lost pet، needs/campaigns/donations، NGO portal.
- مدیریت: admin dashboard/users/access/commerce/finance/trust/support/content/settings/system و پرتال‌های provider/seller/clinic.

وجود page در این گروه، declaration of UX surface است؛ release هر route فقط پس از contract/API/integration/test مربوط به آن ممکن است.

---

## 8. یکپارچه‌سازی‌ها و وضعیت واقعی

| یکپارچه‌سازی | کد | وضعیت release قابل اتکا | مانع/قاعده |
| --- | --- | --- | --- |
| Faraz OTP و SMS pattern | client/adapter/provider و validation وجود دارد | `READY_FOR_CONFIGURATION` | نیازمند API key، sender و pattern UID تأییدشده؛ `SENT` به معنی تحویل‌شده نیست. |
| Google OAuth | OAuth client و `auth.googleEnabled` gate وجود دارد | `NOT_CONFIGURED` | client id/secret/callback لازم؛ dev simulate در production نباید فعال شود. |
| Standard gateway | abstraction/adapter وجود دارد | `NOT_CONFIGURED` / sandbox | adapter صراحتاً مسیر production network کامل نیست؛ merchant/official integration لازم است. |
| SnappPay / DigiPay | status release | `NOT_IMPLEMENTED` | بدون قرارداد/API نباید گزینهٔ پرداخت زنده شوند. |
| AloPeyk / SnappBox | shipping abstraction/status | `NOT_IMPLEMENTED` | rate/order/label/webhook واقعی نیاز دارد. |
| Torob / Digikala | marketplace channel abstraction/status | `NOT_IMPLEMENTED` | seller access و قرارداد رسمی لازم است. |
| S3-compatible storage | driver و presigned URL | `NOT_CONFIGURED` در default | production با driver محلی نباید boot کند؛ bucket/credential/retention لازم. |
| Map/distance | config path موجود | `NOT_CONFIGURED` | demo straight line معادل ETA/route واقعی نیست. |
| Provider/clinic/insurer/accommodation | data model و UI | **هیچ credential/live directory در repo ثابت نشد** | در UI فقط verified/active data واقعی نمایش داده شود. |

منبع انتشار این جدول: `docs/release/external-adapter-status.md` و validateهای runtime، نه نام یک integration در طراحی.

---

## 9. تعارض‌ها و ریسک‌های مهمی که نباید پنهان بمانند

| موضوع | تعارض/ریسک | تصمیم یا اقدام لازم |
| --- | --- | --- |
| آدرس | درخواست قبلی «اطلاعات آدرسی را هیچ جا نمی‌گیریم» با نیاز delivery، visit در محل و taxi ناسازگار است؛ schema `CustomerAddress` موجود است. | rule محصول را دقیق کنید: چه journeyهایی آدرس می‌گیرند، زمان نگهداری، mask/share و حذف. تا آن زمان expansion جمع‌آوری آدرس متوقف. |
| کیف‌پول | تصمیم‌های مالی جریان wallet/combined payment را می‌خواهند، ولی wallet عمومی در schema تأیید نشد. | model پیشنهادی، currency/rounding، double-entry posting، limits، reversal، KYC/withdrawal، UI و migration جداگانه. |
| کارت‌به‌کارت | نیاز محصول شامل کارت فعال ادمین، upload فیش و verification است؛ core commerce entity کامل برایش پیدا نشد. | immutable transfer receipt flow با virus scan، idempotency، review، expiry و audit طراحی/پیاده‌سازی شود؛ نه field پراکنده. |
| پول واقعی | test سبز با gateway simulated است. | هیچ order مالی live بدون adapter رسمی، webhook verification، reconciliation و merchant readiness منتشر نشود. |
| emergency | طراحی emergency با کد فعلی فراتر از `PetEmergencyInfo` است. | legal disclaimer، manual escalation، verified directory و failure states پیش از ادعای ۲۴/۷. |
| حذف/retention | execution حذف حساب عمداً اجرا نمی‌شود. | تصمیم حقوقی شش‌گانه و worker audit-friendly پیش از فعال‌سازی. |
| شاخهٔ پیش‌فرض GitHub | default branch با `main` متفاوت است. | پس از تأیید مالک، default branch/branch protection/PR base را یکپارچه و مستند کنید. |
| UI شبیه واقعیت | preview/local seed ممکن است با دادهٔ حقیقی اشتباه گرفته شود. | همهٔ simulation/preview را label کنید؛ دادهٔ production ساختگی ممنوع. |

---

## 10. برنامهٔ اجرای وابستگی‌محور

### فاز 0 — این سند

- [x] تعیین SHA و محیط مرجع، اجرای gateهای QA و ثبت نتیجه.
- [x] شناسایی integrationهای واقعی، sandbox و مسدود بیرونی.
- [x] ثبت شاخه‌های واگرا و ریسک default branch بدون حذف destructive.
- [x] ثبت تصمیم‌های باز و تعارض‌های محصول.

### فاز 1 — ایمنی، قرارداد داده و قابلیت مشاهده

1. ساخت matrix role × endpoint × tenant و تست‌های negative authorization برای routeهای حساس.
2. policy مشترک برای state machine، idempotency و domain event؛ inventory transitionهای پول/رزرو/اعتماد.
3. media policy: مالک، scope، size/mime/virus scan، signed URL، lifecycle deletion و audit download.
4. production readiness dashboard برای SMS/payment/storage/map با status صادقانه و alarmهای پایه.
5. رفع warningهای lint و افزودن visual/contract smoke برای routeهای ارزشمند.

### فاز 2 — حساب، خانواده، پت، حریم خصوصی

1. تصویب required fields پت و migration/backfill بدون حذف دادهٔ قدیمی.
2. تکمیل invite/household transfer و lifecycle `LOST/DECEASED/MEMORIAL` با permission/event.
3. پیاده‌سازی address policy منتخب یا حذف surfaceهای ناسازگار؛ mass collection ممنوع.
4. تبدیل retention decision به job قابل audit فقط بعد از تأیید Legal.

### فاز 3 — ارائه‌دهنده، رزرو و خدمات

1. verification، availability، provider calendar، price snapshot، cancellation/refund و capacity.
2. تست E2E برای customer/provider/admin، conflict زمانی، tenant bypass و no-show.
3. فقط پس از اتصال partner واقعی، listing عمومی active و fulfillment واقعی شود.

### فاز 4 — کلینیک و emergency

1. consent و access scope درمانی؛ ownership و retention record.
2. emergency case workflow با triage انسانی، privacy-preserving location، 24/7 SLA/coverage و fallback.
3. نظارت clinical و incident escalation؛ بدون diagnostic claim خودکار.

### فاز 5 — اشتراک و ویدئو

1. entitlement/renewal/refund/gifting به‌همراه pricing policy.
2. private video catalog/playback با signed access، progress و admin moderation.

### فاز 6 — فروشگاه

1. catalog مرکزی، ۳ رسانه/alt/order و admin moderation را در contract واحد کامل کنید.
2. multi-vendor cart rule، inventory reservation، order split، receipt/tax و fulfillment.
3. کارت‌به‌کارت را صرفاً پس از design مالی مستقل، سپس active card management در admin ارائه کنید.

### فاز 7 — سفر، تاکسی و حمایت حیوانات

1. سفر: manual quote/assignment SLA و سپس partner inventory/API.
2. تاکسی: map/ETA، dispatch، cancellation/debt/subsidy policy و driver/provider verification.
3. حمایت: NGO verification، donation reconciliation/payout و adoption انتقال مالکیت.

### فاز 8 — finance و ERP

1. general wallet/ledger، settlement، commission، payout/KYC، financial period close و reconciliation.
2. هر movement پول دارای idempotency key، immutable reference، reversible posting و audit باشد.
3. export فقط با authorization و data-minimization؛ transaction history ≠ wallet balance مگر مدل روشن داشته باشد.

### فاز 9 و 10 — QA تولید و mobile

1. migration rehearsal روی copy ناشناس‌شده، rollback/restore drill، security/access scan، load baseline و live smoke.
2. mobile فقط مصرف‌کنندهٔ API contract تثبیت‌شده باشد؛ منطق حساس duplicate نشود.

---

## 11. معیار عبور از «کد موجود» به «قابل انتشار»

هر تغییر محصولی پیش از deploy باید این minimumها را داشته باشد:

1. issue/decision source و acceptance criteria روشن.
2. contract API و permission/tenant rule مستند.
3. migration plan و backfill/rollback برای تغییر schema.
4. state transition، idempotency، audit و failure/retry برای عملیات حساس.
5. RTL/LTR، light/dark، mobile، loading/empty/error/permission و accessibility QA برای UI.
6. unit + integration/E2E سناریوی happy، denied، retry و failure؛ دادهٔ fake فقط dev/test label شده.
7. lint/typecheck/test/E2E/build سبز در CI؛ PR diff و release SHA قابل ردیابی.
8. فقط برای integration واقعی: credential/preflight، webhook/auth verification، monitor و runbook؛ سپس status `LIVE`.
9. پس از deploy: health version SHA، smoke هدفمند و rollback criterion ثبت شود.

---

## 12. نتیجه برای Product Manager

PET LIFE OS یک prototype تک‌صفحه‌ای نیست؛ یک platform با هستهٔ domain گسترده است. ارزش واقعی آن اکنون در مدل‌های پت/خانواده، permission، admin/audit، catalog/offer، رزرو، record سلامت و foundation مالی است. ریسک واقعی نیز دقیقاً همان‌جاست: بدون policy حقوقی، provider واقعی، payment واقعی، قرارداد داده و عملیات انسانی، UIهای گسترده نباید به‌عنوان سرویس live معرفی شوند.

بنابراین backlog صحیح نباید «همهٔ صفحه‌ها را کامل کن» باشد. باید یک برنامهٔ release-by-domain با dependencyهای این سند، owner تصمیم، status integration و معیار پذیرش قابل تست باشد. فهرست تصمیم‌های مانع در [open-decisions.fa.md](./open-decisions.fa.md) منبع برنامه‌ریزی بعدی است.
