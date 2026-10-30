# PET LIFE OS — مرجع کامل محصول، داده، انتشار و برنامه‌ریزی

> **نسخهٔ سند:** ۱.۰ — ۳۰ اکتبر ۲۰۲۶  
> **مخاطب:** Product Manager، Operations Lead، Tech Lead و طراح محصول  
> **روش تهیه:** بررسی مستقیم repository، شاخه‌های GitHub، workflowهای CI/CD، routeهای Next.js، ماژول‌های NestJS و Prisma schema.  
> **قاعدهٔ خواندن:** «کد موجود» لزوماً «قابل‌استفاده در production» نیست. برای هر مورد وضعیت انتشار و وابستگی خارجی جداگانه آمده است.

---

## 0. خلاصهٔ مدیریتی

PET LIFE OS یک سوپراَپ برای اکوسیستم حیوانات خانگی است که هسته‌اش **کاربر ← خانوار ← حیوان ← سلامت/مراقبت** است. روی این هسته، خدمات، رزرو، فروشگاه، سفارش، سفر، بیمه، جامعه، حمایت از حیوانات و پنل‌های عملیاتی ساخته شده‌اند.

محصول از نظر کد، سطح بسیار گسترده‌ای دارد: وب عمومی، پنل کاربر، پنل ارائه‌دهنده، پنل فروشنده و پنل ادمین. اما سطح آماده‌بودن همهٔ این قابلیت‌ها یکسان نیست. بعضی جریان‌ها end-to-end و قابل آزمون‌اند؛ بعضی فقط UI/API داخلی دارند؛ و تعدادی بدون credential یا قرارداد رسمی provider عمداً fail-closed هستند.

### واقعیت انتشار در لحظهٔ نگارش

| موضوع | مقدار/وضعیت |
|---|---|
| دامنهٔ زنده | `https://opetlife.ir` |
| SHA زندهٔ تأییدشده | `32f206c5e5a7f27a2cee2e96e667207e97df2f1c` |
| مسیر release واقعی | `main` → CI → Deploy to VPS → کنترل `/api/health/version` |
| default branch GitHub | `claude/pet-life-os-foundation-8synln` (**با release branch متفاوت است**) |
| PR فعالِ مسیر اصلی | #93، از `codex/admin-product-catalog` به `main`؛ هنوز live نیست |
| دلیل دیده‌نشدن تغییر جدید | هر چیزی در PR/branch تا پیش از CI سبز، merge و تطابق SHA سرور، روی سایت زنده نمی‌رود |

### نتیجهٔ اجرایی کوتاه

1. **نباید default branch را معادل production تلقی کرد.** production از `main` می‌آید.
2. **نباید UI موجود را معادل اتصال واقعی provider دانست.** SMS، OAuth، پرداخت، نقشه و storage وضعیت مستقل دارند.
3. **قیمت محصول متعلق به فروشنده است، نه ادمین یا Product.** Product هویت کاتالوگ است و SellerOffer قیمت/موجودی دارد.
4. **آدرس یک تصمیم محصول حل‌نشده است.** حذف کامل آن با تحویل کالای فیزیکی و taxi/on-site service تناقض دارد.

---

## 1. هدف، کاربران و مرز محصول

### 1.1 مسئله‌ای که محصول حل می‌کند

صاحب حیوان در ایران و منطقه برای سلامت، رزرو، خرید، سفر، بیمه، مراقبت خانوادگی و پشتیبانی به سرویس‌های پراکنده نیاز دارد. PET LIFE OS یک context مشترک و کنترل‌شده برای حیوان/خانوار می‌سازد تا این خدمات بدون تکرار داده و بدون به‌اشتراک‌گذاری بیش از حد دادهٔ سلامت به هم متصل شوند.

### 1.2 بازیگران اصلی

| بازیگر | هدف اصلی | مرز دسترسی |
|---|---|---|
| مالک/کاربر | مدیریت حیوان، سلامت، رزرو، خرید و خانواده | فقط خانوار و پت‌هایی که به او access داده شده‌اند |
| عضو خانواده | کمک به مراقبت | مجوزهای دقیق PetAccessGrant، نه صرفاً نقش FAMILY |
| ارائه‌دهنده/کلینیک | ارائه خدمت، calendar، پرونده و رزرو | فقط سازمان انتخاب‌شده و بیمار/رزرو مجاز |
| فروشنده | offer، موجودی، سفارش و تسویه | فقط سازمان فروشندهٔ خود |
| اپراتور/ادمین | کنترل پلتفرم، trust، مالی، moderation، پشتیبانی | Admin permissionهای عمودی و audit‌شده |
| سازمان حمایت/بیمه/اقامت | vertical تخصصی خود | membership و verification مرتبط |

### 1.3 خارج از scope یا فاقد اتصال production

- GPS زنده/track کردن پیک یا taxi.
- تسویهٔ خودکار به همکار.
- اتصال رسمی Torob، Digikala، SnappBox، AloPeyk، SnappPay، DigiPay.
- provider پرداخت واقعی، تا زمان credential و قرارداد merchant.
- map/distance production، تا زمان انتخاب/تنظیم provider نقشه.
- تصمیم یا توصیهٔ پزشکی مبتنی بر AI بدون review بالینی.

---

## 2. معماری فنی و منبع حقیقت

### 2.1 ساختار repository

| لایه | فناوری | مسئولیت |
|---|---|---|
| `apps/web` | Next.js 14، React 18، Tailwind، next-intl | وب عمومی، پنل کاربر، provider، seller و admin |
| `apps/api` | NestJS 10، Prisma 5، PostgreSQL، Redis | API ماژولار، ruleها، authorization، jobs/events |
| `packages/ui` | React components مشترک | Button, Input, Dialog، stateهای مشترک |
| `packages/design-tokens` | CSS semantic tokens | رنگ/typography/light/dark و RTL/LTR |
| `packages/types` | DTO و enum مشترک | قرارداد Web/API |
| `packages/validation` | Zod | validation سمت client |
| `packages/config` | env validation | config fail-fast |

### 2.2 اصول داده و امنیت

- شناسه‌ها UUID و تاریخ‌ها UTC هستند؛ UI فارسی آن‌ها را جلالی نمایش می‌دهد.
- مبلغ‌های مالی integer/decimal هستند؛ float برای پول استفاده نمی‌شود.
- session در database نگه‌داری و cookie امضا/HttpOnly می‌شود.
- mutationها CSRF و برای مسیرهای حساس idempotency/transition guard دارند.
- audit log برای عملیات ادمین، trust، مالی و moderation مسیر دارد.
- فایل‌های خصوصی از public static mount جدا هستند؛ سند سلامت با signed download ارائه می‌شود.
- stateهای سلامت باید تفاوت `unknown`، `not recorded`، `known negative` و `known present` را حفظ کنند.

### 2.3 استاندارد وضعیت feature

| برچسب | معنی |
|---|---|
| **LIVE** | کد در `main`، CI سبز، deploy موفق، SHA سرور منطبق و provider لازم فعال است |
| **DEPLOYED CODE / EXTERNAL BLOCKED** | UI/API در production هست، اما provider/credential خارجی ندارد؛ نباید موفقیت جعلی نشان دهد |
| **IN PR** | پیاده‌سازی روی branch/PR است؛ روی سایت نیست |
| **CODED / NEEDS QA** | کد و route وجود دارد، اما سناریوی واقعی/داده/role در staging یا live هنوز تأیید نشده |
| **PLANNED** | requirement ثبت شده ولی هنوز پیاده‌سازی کامل ندارد |

---

## 3. GitHub، شاخه‌ها و قواعد توسعه

### 3.1 قواعد درست توسعه

1. از **`main`** branch بگیرید؛ نه از default branch قدیمی GitHub و نه از worktreeهای محلی.
2. هر PR باید CI را کامل بگذراند: shared build، Prisma generate، lint، typecheck، migration، unit test، API e2e و production build.
3. merge فقط به `main` انجام می‌شود.
4. انتشار فقط بعد از موفقیت workflow `Deploy to VPS` معتبر است.
5. پیش از اعلام live شدن، پاسخ `/api/health/version` باید SHA merge را نشان دهد.
6. branch فقط پس از بررسی merge-base/diff حذف شود؛ branchهای قدیمی ممکن است کد یا evidence مفید داشته باشند.

### 3.2 وضعیت شاخه‌های مهم در زمان نگارش

| شاخه / PR | وضعیت | تصمیم پیشنهادی |
|---|---|---|
| `main` | خط واقعی integration و production | تنها مبنای کار جدید |
| `claude/pet-life-os-foundation-8synln` | default branch GitHub، قدیمی‌تر از `main` | تغییر default branch یک کار مدیریتی جداست؛ تا تصویب، delete نشود |
| `codex/admin-product-catalog` / PR #93 | کاتالوگ ادمین + hero انگلیسی؛ CI در حال اجرا/نیازمند green | بعد از CI و visual QA merge شود |
| `claude/integrate-design-1c0280b` / PR #59 | auth/Faraz/SMS قدیمی و conflict با main | **merge نشود**؛ فقط commitهای سازگار پس از review جداگانه cherry-pick شوند |
| `codex/card-transfer-payments` | برخی اصلاحاتش در PR #92 merge شده؛ branch محلی/remote مانده | پس از inventory و اطمینان از عدم diff لازم، archive/delete |
| `stabilization/wave-1` | شاخهٔ تاریخی wave | نگه‌داری read-only تا پایان audit، نه مبنای توسعه |
| شاخه‌های `gone` محلی | remote ندارند و بخشی از آن‌ها قبلاً merge شده‌اند | فقط worktree cleanup پس از inventory؛ delete کور ممنوع |

### 3.3 مشکل ساختاری GitHub

default branch GitHub هنوز `claude/pet-life-os-foundation-8synln` است، در حالی که CI/CD از `main` انتشار می‌دهد. Side effect این اختلاف:

- PR جدید اگر base را انتخاب نکند ممکن است به شاخهٔ اشتباه باز شود.
- README/default compare و مسیر clone برای همکار جدید گمراه‌کننده می‌شود.
- branch protection ممکن است روی شاخهٔ اشتباه اعمال شود.

**تصمیم لازم:** بعد از review branch protection، `main` به default branch تغییر کند؛ سپس protection، required checks و auto-delete merged branches روی `main` تنظیم شوند.

---

## 4. فهرست صفحات ساخته‌شده (route inventory)

> مسیرها با prefix locale هستند: `/fa/...` و `/en/...`. مسیرهای dynamic با `[id]` نشان داده می‌شوند. کل route inventory generated در `docs/qa/design-route-inventory.json` و `docs/product/sitemap.md` قابل کنترل است.

### 4.1 صفحات عمومی و کشف

| خانواده | مسیرهای ساخته‌شده | وضعیت محصول |
|---|---|---|
| Landing/brand | `/`, `/credits`, `/contact`, `/guides`, `/guides/[slug]` | landing قفل است؛ hero در PR #93 تغییر locale دارد |
| محتوا | `/blog`, `/blog/[slug]`, `/blog/category/[slug]`, `/blog/tag/[slug]` | CMS/SEO موجود |
| خدمات | `/services`, `/services/search`, `/services/[category]`, `/services/[category]/[serviceId]/book` | discovery و booking entry موجود |
| دامپزشک | `/vet/find`, `/vet/[providerId]`, `/vet/[providerId]/book` | discovery/booking موجود |
| فروشگاه | `/shop`, `/shop/products`, `/shop/products/[id]` | catalog/offer/cart entry موجود |
| سفر | `/travel`, `/travel/search`, `/travel/compare`, `/travel/stays/[id]`, `/travel/external/**` | internal و external source views موجود؛ adapterها جداگانه بررسی شوند |
| بیمه | `/insurance`, `/insurance/[productId]`, `/insurance/compare` | product/application surface موجود |
| مکان‌ها | `/places`, `/places/[placeId]` | directory و favorite/report route موجود |
| جامعه | `/community`, `/community/new`, `/community/posts/[postId]` | post/comment/report surface موجود |
| حمایت حیوانات | `/animal-support/**` | organization/campaign/need/help path موجود |
| عمومی با توکن | `/health-share/[token]`, `/pet-card/[token]`, `/lost-pets/**` | امنیت و expiry باید QA شود |

### 4.2 صفحات کاربر/خانوار

| خانواده | مسیرهای ساخته‌شده | هدف |
|---|---|---|
| ورود | `/account`, `/account/forgot`, `/account/reset`, `/auth`, `/register`, `/welcome` | password/OTP/OAuth depending feature flag/provider |
| خانه | `/home`, `/explore`, `/favorites`, `/notifications` | context کاربر/حیوان و discovery |
| پروفایل | `/profile`, `/personal`, `/household`, `/privacy`, `/security`, `/activity`, `/membership`, `/notifications` | حساب، خانواده، رضایت و امنیت |
| خانواده | `/profile/household`, `/profile/household/pets/[petId]/access`, `/lifecycle` | invitation، access و lifecycle |
| حیوان | `/pets`, `/pets/new`, `/pets/active`, `/pets/[id]` | CRUD، active pet، هویت |
| سلامت | `/pets/[id]/health/**` | basics، medication، allergy، condition، vaccine، documents، labs، imaging، visits، nutrition، rehab، timeline، sharing |
| مراقبت | `/care-calendar`, `/pets/[id]/care/**`, `/reminders` | calendar، care plan و suggestion |
| رزرو | `/bookings`, `/bookings/[id]`, `/clinic-invitations`, `/travel/book/**` | booking history و flows |
| خرید | `/cart`, `/checkout`, `/checkout/[id]/confirmation`, `/orders`, `/orders/[id]`, `/repeat-delivery/**` | commerce lifecycle |
| سفر/بیمه | `/pets/[id]/travel/**`, `/pets/[id]/insurance`, `/travel/trips/**` | trip/requirements/application |
| جامعه/پشتیبانی | `/community/messages/**`, `/support/**`, `/donations/**` | conversation, ticket, donation |

### 4.3 پنل ارائه‌دهنده و کلینیک

`/provider`, `/provider/bookings/**`, `/provider/calendar`, `/provider/availability`, `/provider/patients/**`, `/provider/clinical`, `/provider/clinic`, `/provider/services`, `/provider/team`, `/provider/reviews`, `/provider/shared-records/**`, `/provider/verification`, `/provider/waitlist`, `/provider/travel/**` و `/provider/analytics`.

این پنل calendar، availability، service، booking queue، patient context، clinical records، team و travel partner flow را پوشش می‌دهد. هر route فقط با membership/context سازمان مجاز باید QA شود.

### 4.4 پنل فروشنده

`/seller`, `/seller/orders/**`, `/seller/offers`, `/seller/inventory`, `/seller/promotions`, `/seller/channels`, `/seller/finance`, `/seller/finance/transactions`, `/seller/finance/settlements/**`, `/seller/team`, `/seller/settings`, `/seller/verification`.

هدف: فروشنده فقط offer، inventory، سفارش، مالی و تیم سازمان خودش را ببیند. قیمت و تخفیف فروش در این لایه است، نه admin catalog.

### 4.5 پنل ادمین

خانواده‌های اصلی route:

- **کاربران و دسترسی:** `/admin/users/**`, `/admin/customers/**`, `/admin/access/**`, `/admin/crm`, `/admin/customer-affairs`
- **تجارت و مالی:** `/admin/commerce/**`, `/admin/transactions`, `/admin/settlements/**`, `/admin/seller-finance/**`, `/admin/reconciliation`, `/admin/marketplace-statements/**`
- **ارائه‌دهندگان و خدمات:** `/admin/providers`, `/admin/sellers`, `/admin/services/**`, `/admin/verification/**`
- **اعتماد/پشتیبانی:** `/admin/support/**`, `/admin/trust/**`, `/admin/disputes/**`, `/admin/audit`, `/admin/tasks`
- **محتوا:** `/admin/content/**`
- **اشتراک:** `/admin/subscriptions/**`
- **verticalها:** `/admin/animal-support/**`, `/admin/insurance/**`, `/admin/places`, `/admin/lost-pets/**`, `/admin/travel/**`, `/admin/community`, `/admin/settings`

---

## 5. ماژول‌های backend و وضعیت کسب‌وکاری

| حوزه | ماژول‌های API | آنچه وجود دارد | ریسک/کار باز |
|---|---|---|---|
| Identity | `auth`, `users`, `account` | session، password، OTP/OAuth setting، profile | credential/provider و browser E2E login |
| خانوار/پت | `households`, `pets`, `pet-access`, `onboarding` | invitation، active pet، grant، تصویر، onboarding | archive واقعی pet و QA invitation |
| سلامت | `health`, `health-depth`, `clinical-health`, `vet-share`, `vet-panel` | health basics تا clinical artifacts | policy retention و clinical authorization QA |
| مراقبت | `care-profile`, `care-calendar`, `care-reminders` | calendar/reminder/care context | تکمیل تاریخ/زمان شمسی در تمام فرم‌ها |
| خدمات | `providers`, `services`, `booking`, `provider-os`, `clinic-os` | availability، hold، booking، provider workspace | map/payment/transport external dependency |
| فروشگاه | `commerce`, `seller-os`, `seller-finance` | catalog, offer, inventory, checkout, order, settlement | product media admin، payment live، fulfilment partner |
| سفر/بیمه | `travel*`, `places`, `insurance` | trips/listing/policy/insurance application | source/provider external config |
| community/support | `community`, `support`, `notifications`, `member-trust` | post/ticket/chat/notification/moderation | SMS delivery/provider و anti-abuse live QA |
| کمک حیوانات | `animal-support`, `lost-pet` | org/case/campaign/need/donation/lost flow | payment/disbursement policy |
| ادمین | `admin`, `platform-settings`, `partner-verification` | RBAC/audit/control-plane | role approval policy و operational runbook |
| privacy | `privacy-governance`, `storage` | consent/export/deletion request/signed storage | retention/deletion policy approval |

---

## 6. دیکشنری داده و side effectها

### 6.0 فیلدهای پایهٔ مشترک

| فیلد | معنی یک‌خطی | side effect / قاعده |
|---|---|---|
| `id` | UUID یکتای record | در API/رابط شناسهٔ مرجع است؛ نباید به‌عنوان اطلاعات کاربر نمایش عمومی شود |
| `createdAt` | زمان ایجاد UTC | مبنای timeline/audit، در UI locale-format می‌شود |
| `updatedAt` | زمان آخرین تغییر | معیار «آخرین فعالیت» نیست مگر صریحاً گفته شده باشد |
| `status` | state machine business | تغییر آن باید از transition مجاز عبور کند، نه patch آزاد |
| `...Id` | foreign key | side effect حذف وابسته به `onDelete` دارد؛ برای history عموماً `RESTRICT/SET NULL` ترجیح دارد |

### 6.1 هویت، حساب و خانوار

#### `User`

| فیلد | معنی | side effect |
|---|---|---|
| `email`, `phone` | راه تماس/ورود، unique و nullable | حداقل یکی لازم است؛ verified نبودن برای linking قابل اعتماد نیست |
| `username`, `normalizedUsername` | نام ورود دلخواه و نسخهٔ lowercase آن | uniqueness روی normalized مانع برخورد حروف بزرگ/کوچک می‌شود |
| `passwordHash` | hash Argon2id، نه رمز خام | null یعنی password تنظیم نشده؛ reset/set password session/security implication دارد |
| `emailVerifiedAt`, `phoneVerifiedAt` | زمان اثبات تماس | فقط contact اثبات‌شده باید برای account linking استفاده شود |
| `displayName`, `avatarUrl` | هویت نمایشی | در surfaces اجتماعی/خانواده نمایش می‌یابد؛ moderation/privacy لازم است |
| `locale`, `themePreference` | ترجیح UI | locale مسیر/متن و theme semantic tokenها را تغییر می‌دهد |
| `accountStatus`, `suspendedAt`, `suspendedReason` | وضعیت فعال/تعلیق حساب | تعلیق مانع sign-in و resolve session می‌شود؛ حذف داده نیست |
| `welcomeTrialConsumedAt` | مصرف یک‌بارهٔ trial | نباید reset شود؛ اثر مستقیم بر entitlement دارد |
| `lastActiveAt` | فعالیت coarse برای ادمین | حداکثر هر ۱۵ دقیقه به‌روز می‌شود؛ برای auth/billing استفاده نشود |

#### `Household`, `HouseholdMember`, `HouseholdInvitation`

| فیلد | معنی | side effect |
|---|---|---|
| `Household.name/city/region/countryCode` | context خانوار و مکان کلی | نباید با shipping address یکی گرفته شود |
| `Household.welcomeTrialConsumedAt` | trial خانوار | مانع trial تکراری می‌شود |
| `HouseholdMember.role` | `OWNER/FAMILY` preset | به‌تنهایی permission پت نیست؛ هنگام grant فقط preset می‌دهد |
| `Invitation.contact` | مقصد دعوت | دادهٔ تماس حساس است؛ invitation status/expiry باید enforce شود |
| `Invitation.tokenHash` | hash توکن دعوت | token خام هرگز database نیست؛ link قابل replay بعد از expiry نیست |
| `Invitation.initialAccess` | preset دسترسی پیشنهادی | هنگام پذیرش باید به grantهای واقعی تبدیل/اعتبارسنجی شود |
| `expiresAt/acceptedAt/declinedAt/cancelledAt` | چرخهٔ عمر دعوت | تعیین‌کنندهٔ معتبر بودن invitation و نمایش UI است |

#### `Pet`

| فیلد | معنی | side effect |
|---|---|---|
| `householdId` | مالکیت خانوار | مبنای discoverability و اعمال default grantها |
| `name/species/breed/sex` | هویت حیوان | compatibility، UI و برخی ruleها به species وابسته‌اند |
| `birthDate/approximateAgeMonths` | سن دقیق یا تقریبی | display/eligibility باید تفاوت دقیق و تقریبی را حفظ کند |
| `photoUrl` | تصویر عمومی پروفایل پت | باید MIME/size/key public validate شود؛ WebP اکنون پشتیبانی می‌شود |
| `latestWeightValue/latestWeightUnit` | آخرین وزن | ruleهای service/health ممکن است از آن استفاده کنند؛ float نیست |
| `colorMarkings/neuteredStatus` | مشخصات ظاهری/وضعیت | `null` با `UNKNOWN` متفاوت است |
| `microchipNumber/microchipNormalized` | microchip خام و normalized | normalized برای duplicate check استفاده می‌شود؛ خام حفظ می‌شود |
| `lifecycleStatus` | ACTIVE/LOST/DECEASED/MEMORIAL | timeline و lost/memorial flow را تغییر می‌دهد، معادل delete نیست |
| `deletedAt` | soft archive marker | pet از operational list حذف می‌شود؛ history نباید hard-delete شود |

#### `PetAccessGrant`

| فیلد | معنی | side effect |
|---|---|---|
| `petId/userId` | موضوع و دریافت‌کنندهٔ grant | چند grant هم‌زمان مجاز است؛ unique pair عمداً وجود ندارد |
| `canViewIdentity/canEditIdentity` | مشاهده/ویرایش هویت پت | guard آن را در هر route بررسی می‌کند |
| `canViewHealth/canEditHealth` | health basics مالک/خانواده | با clinical authoring یکی نیست |
| `canRecordClinicalData` | ثبت دادهٔ بالینی توسط provider | فقط grant موقت VET باید آن را بدهد |
| `canBookCare/canViewCareProfile/canEditCareProfile` | booking و care | توانایی booking با سلامت برابر نیست |
| `canViewLocation/canManageAccess` | location یا delegation | حساس؛ باید explicit باشد |
| `healthScopes/selectedDocumentIds` | محدودهٔ share با provider | محدود به scope/اسناد انتخاب‌شده، نه کل پرونده |
| `startsAt/expiresAt/revokedAt` | بازهٔ اعتبار و revoke نرم | authorization برابر union همهٔ grantهای active است؛ revoke row را حذف نمی‌کند |
| `source/reason/grantedByUserId/revokedByUserId` | منشأ و audit grant | برای traceability است و نباید authorization را bypass کند |

### 6.2 سلامت و مراقبت

| model / فیلدهای کلیدی | معنی | side effect |
|---|---|---|
| `HealthProfile` | خلاصه سلامت متعلق به pet | completeness/unknown state روی recommendation و share اثر می‌گذارد |
| `Allergy.name/severity/status` | ماده/عامل حساسیت و شدت/وضعیت | compatibility محصول/service می‌تواند نیاز به review بدهد؛ medical advice خودکار نیست |
| `Condition.name/status/diagnosedAt` | بیماری/شرط ثبت‌شده | در share و clinical context فقط با permission دیده می‌شود |
| `Medication.name/dose/unit/frequency/startAt/endAt/status` | داروی حیوان و برنامه مصرف | reminder/timeline ممکن است از آن تغذیه کند؛ dosage باید logical LTR نمایش داده شود |
| `VaccinationSummary` | جمع‌بندی واکسن | status نمایش سلامت و reminder را تحت‌تأثیر می‌گذارد |
| `MedicalDocument.objectKey/status` | سند خصوصی سلامت | public URL ندارد؛ download باید signed و permissioned باشد |
| `ClinicalVisit`, `LabResult`, `ImagingStudy`, `Referral` | artifactهای بالینی | فقط role/provider مجاز می‌تواند ثبت/ببیند؛ retention/legal policy لازم است |
| `CareProfile` | رفتار، handling و care preference | برای provider service context است، نه medical diagnosis |
| `CareCalendarEvent.sourceType/sourceId/startAt/endAt/timezone` | projection read-only تقویم | source اصلی (booking/reminder) باید تغییر کند؛ event مستقیم edit نمی‌شود |
| `CareReminder` | یادآوری مراقبت | notification preference/quiet hours باید رعایت شود |

### 6.3 ارائه‌دهنده، خدمت و رزرو

| model / فیلد | معنی | side effect |
|---|---|---|
| `ProviderOrganization.status/verification` | هویت و قابلیت عرضه سازمان | فقط verified + active باید discoverable/bookable باشد |
| `ProviderLocation.timezone` | منطقه زمانی محل خدمت | booking slot در timezone provider محاسبه می‌شود، نه timezone viewer |
| `ProviderUser.role` | عضویت فرد در سازمان | context سازمانی برای data isolation ضروری است |
| `ProviderService.category/type/locationMode` | نوع خدمت و محل ارائه | compatibility، address requirement و booking flow را تعیین می‌کند |
| `ProviderService.bookingMode/paymentMode` | instant/request و سیاست پرداخت | state machine booking و payment expectation را عوض می‌کند |
| `ProviderService.depositAmount/cancellationPolicy/freeCancellationHours` | سیاست مالی/لغو | باید هنگام booking snapshot شود تا تغییر بعدی history را دستکاری نکند |
| `ProviderAvailabilityRule.dayOfWeek/startLocalTime/endLocalTime/timezone` | قاعدهٔ recurring slots | slotها computed هستند، row slot جدا ذخیره نمی‌شود |
| `ProviderAvailabilityException.startAt/endAt/type` | block/open یک‌باره | rule recurring را override می‌کند |
| `Booking.householdId/petId/userId` | طرف مشتری رزرو | history باید با Restrict حفظ شود |
| `Booking.provider*` | سازمان/مکان/فرد/سرویس ارائه‌دهنده | isolation و context اجرایی رزرو را تعیین می‌کند |
| `Booking.category/locationMode` | snapshot سرویس در لحظه رزرو | edit سرویس در آینده history را تغییر نمی‌دهد |
| `Booking.customerAddressId/dropoffAddressId` | pickup/dropoff یا on-site address | حذف address بدون redesign taxi/delivery ممکن نیست؛ FK restrict است |
| `Booking.startAt/endAt/timezone` | زمان ثبت‌شده رزرو | calendar، availability، cancellation و RTL/Jalali display را تغذیه می‌کند |
| `Booking.bookingStatus/paymentStatus` | state رزرو و پرداخت | transitionها event/timeline/notification دارند |
| `Booking.priceAmount/discountAmount/depositAmount/currency` | snapshot مبلغ خدمت | price آیندهٔ سرویس نباید booking قدیمی را تغییر دهد |
| `Booking.reasonForVisit/ownerNotes/intakeAnswers` | context customer/intake | دادهٔ حساس؛ provider scope و retention لازم است |
| `Booking.completedAt/completionNote/aftercareInstructions` | پایان کار و متن قابل‌مشاهده مالک | internal provider note جداست و به مالک نمایش داده نمی‌شود |
| `BookingPetAccess` | link رزرو به grant موقت پت | لغو/پایان booking باید access lifecycle را کنترل کند |

### 6.4 فروشگاه، سفارش و مالی

| model / فیلد | معنی | side effect |
|---|---|---|
| `ProductCategory.name/slug/status/parentId` | taxonomy مرکزی کاتالوگ | category inactive نباید برای product جدید قابل انتخاب باشد |
| `Product.title/slug/description/specifications` | هویت مرکزی کالا | SEO/catalog؛ قیمت یا inventory ندارد |
| `Product.supportsDog/supportsCat/additionalSpecies` | compatibility پایه | product filter/recommendation را مشخص می‌کند |
| `Product.allergenTags/requiresHealthReview` | rule deterministic سلامت | ممکن است offer را hide نکند اما NEEDS_REVIEW نمایش دهد |
| `Product.status` | active/inactive/archived | discoverability کاتالوگ را عوض می‌کند و audit می‌خواهد |
| `ProductVariant.sku/title/attributes/weight*` | واحد قابل‌خرید | SKU unique؛ وزن/attribute برای logistics/compatibility است |
| `ProductMedia.productId/variantId/url/alt/sortOrder` | رسانهٔ کالا | باید repository/storage-owned باشد؛ حداکثر ۳ تصویر requirement باز است |
| `SellerOrganization.status/verification` | هویت فروشنده | seller unverified/suspended نباید offer قابل خرید داشته باشد |
| `SellerOffer.productVariantId/sellerOrganizationId` | رابطه variant و فروشنده | محل اصلی ownership تجاری کالا است |
| `SellerOffer.priceAmount/compareAtAmount/currency` | قیمت و قیمت قبل فروشنده | **فقط اینجا** قیمت فروش قرار دارد؛ admin product نباید آن را set کند |
| `SellerOffer.status/moderationStatus` | عرضه/تأیید offer | moderation discoverability را تغییر می‌دهد |
| `InventoryItem.onHand/reserved` | موجودی و مقدار رزرو شده | checkout reservation باید oversell را جلوگیری کند |
| `Cart/CartLine` | سبد کاربر و lines | تغییر offer/stock باید در checkout دوباره validate شود |
| `Checkout.shippingAddressId/amounts/status` | snapshot آماده سفارش | checkout address با profile address یکی نیست؛ payment/order dependency دارد |
| `Order.status/subtotal/delivery/discount/total` | قرارداد مالی سفارش | after creation historical amounts mutable نیستند جز flow مجاز refund/cancel |
| `OrderItem.*Snapshot` | snapshot کالا/offer هنگام خرید | تغییر title/price امروز نباید فاکتور قبلی را تغییر دهد |
| `PaymentIntent/PaymentAttempt/Transaction` | intention، تلاش و ledger payment | gateway event باید idempotent و reconcile شود |
| `Refund/OrderRefundRequest/AdminRefundApproval` | درخواست و اجرای refund | approval و execution جدا هستند؛ segregation of duties لازم است |
| `SellerSettlement/SellerAdjustment/SellerLedger*` | بدهی/بستانکاری و تسویه فروشنده | settlement خودکار نیست؛ adjustment نیازمند reason/audit است |
| `Promotion/PromotionRedemption` | تخفیف campaign | scope/period/redemption limit باید در checkout validate شود |

### 6.5 اعلان، پشتیبانی، اعتماد و ادمین

| model / فیلد | معنی | side effect |
|---|---|---|
| `Notification.category/title/body/deepLink` | اعلان in-app | link باید localized/safe باشد |
| `NotificationDelivery.channel/status/providerMessageId` | delivery attempt | `SENT` به معنی accepted است، نه delivered؛ provider status لازم است |
| `NotificationPreference` | opt-in/out برحسب category/channel | ارسال manual/automatic باید preference را رعایت کند |
| `NotificationQuietHours` | بازهٔ سکوت کاربر | orchestrator باید defer/suppress کند مگر critical policy |
| `SupportCase.status/priority/category/requesterUserId` | تیکت و صف رسیدگی | status change/message/audit با SLA و visibility مرتبط است |
| `SupportMessage/InternalNote` | پیام مشتری و note داخلی | note داخلی هرگز در consumer UI نمایش داده نشود |
| `AdminUser.role/status` | ادمین و وضعیت عضویت | role داخلی با role همکار یکی نیست |
| `AdminAuditLog.action/entityType/entityId/beforeSummary/afterSummary/requestId` | trace عملیات حساس | مبنای investigation است؛ message secret/PII غیرلازم در summary نباید ثبت شود |
| `TrustCase/Dispute/Appeal` | workflow اعتماد و اعتراض | transition و evidence باید قابل audit باشند |
| `PartnerVerificationProfile/Document` | مشخصات/مدارک همکار | approval باید policy-driven و evidence expiry-aware باشد |

### 6.6 اشتراک، سفر، بیمه، جامعه و حمایت

| model / فیلد | معنی | side effect |
|---|---|---|
| `SubscriptionPlan/Price/Entitlement` | plan، قیمت و حق دسترسی | تنها قلمی که central pricing آن قابل‌قبول است |
| `Subscription/Period/BillingAttempt/Trial` | وضعیت عضویت و billing history | entitlement باید از period معتبر derive شود |
| `Trip.startDate/endDate/status` | سفر حیوان/خانوار | checklist/booking/document را به تاریخ سفر متصل می‌کند |
| `TravelListing/TravelAvailability/TravelRatePlan` | اقامتگاه، ظرفیت، نرخ | travel partner context و booking lock لازم دارد |
| `TravelBooking/TravelBookedNight` | رزرو اقامت | شب‌ها snapshot هستند؛ cancellation/refund policy لازم دارد |
| `InsuranceProduct/Application` | محصول و درخواست بیمه | carrier integration/decision external dependency است |
| `PetFriendlyPlace` | مکان مناسب پت | report/favorite/update confirmation لازم دارد |
| `CommunityPost/Comment/Reaction/Report` | محتوای جامعه | block/report/moderation و visibility policy دارد |
| `AnimalSupportOrganization/RescueCase/SupportCampaign` | سازمان و کیس/کمپین | verification و transparency برای اعتماد لازم است |
| `DonationIntent/Transaction/Ledger*` | نیت و ledger کمک | payment/payout policy و reconciliation لازم دارد |
| `LostPetIncident/Sighting` | گم‌شدن و مشاهده | location privacy و public media policy بسیار حساس است |
| `PetMemory/PetLifecycleTransition` | خاطره و گذار lifecycle | private/public visibility و memorial policy را رعایت کند |

---

## 7. طراحی، content و behavior

### 7.1 قواعد قطعی طراحی

- Landing page در ساختار/کپی/motion قفل است؛ فقط asset hero مصوب طبق locale تغییر می‌کند.
- لوگوی PET LIFE در header تمام سطوح consumer، partner و admin است.
- header sticky، سبک و قابل استفاده در mobile است.
- فارسی RTL و انگلیسی LTR است؛ URL، email، SKU، phone، dose و amount به‌صورت logical نمایش داده می‌شوند.
- Dark mode همان زبان warm/premium است، نه cyber/neon.
- loading، empty، error و permission state باید واقعی باشند؛ شخصیت/پت/رزرو ساختگی در production نباید به جای state واقعی نشان داده شود.
- برای هر UI که backend capability ندارد، باید `Implementation dependency` یا disabled/future state روشن داشته باشد.

### 7.2 طراحی اجراشده در main

- tokens semantic light/dark و typography فارسی/لاتین.
- shellهای sticky/brand برای public، account، booking، health/care، support، community، seller، provider و admin در releaseهای اخیر وارد main شده‌اند.
- الگوی table/list برای ادمین کاربران و access membership در `32f206c` منتشر شده است.
- Calendarهای عملیات ادمین مشخص‌شده به shared Jalali `DateField` منتقل شده‌اند.

### 7.3 بدهی طراحی/QA

1. همهٔ ۱۵۰+ route هنوز visual parity با تصاویر reference ندارند.
2. account navigation نیاز به ساده‌سازی بیشتر دارد؛ میان‌بر family invite اضافه شده ولی architecture کامل بازطراحی نشده است.
3. fieldهای با `datetime-local` باقی‌مانده باید به component شمسی/زمان محلی migrate شوند.
4. visual QA باید روی data واقعی، role واقعی و mobile انجام شود؛ snapshot/unit test جای browser QA نیست.

---

## 8. اتصال‌های بیرونی و تصمیم‌های لازم

| اتصال | وضعیت code | مانع | رفتار صحیح در production |
|---|---|---|---|
| Faraz SMS | IMPLEMENTED / ready configuration | API key، line، pattern UID و preflight server | فقط accepted send = SENT؛ delivered جعل نشود |
| OTP | ready configuration | credential/pattern/provider setup | اگر ناقص است fail-closed/disabled |
| Google OAuth | implementation/feature flag | OAuth client credential/callback config | toggle ادمین بدون credential نباید flow شکسته بسازد |
| Payment gateway | sandbox/not configured | merchant account و API | payment live اعلام نشود |
| کارت‌به‌کارت | requirement، کامل نیست | policy کارت active، upload فیش، reviewer/SLA | بدون review/audit نباید order paid شود |
| S3/object storage | abstraction exists، config-dependent | bucket/credential/CDN | private object public نشود |
| Map/distance | not configured | provider/keys/legal choice | taxi quote باید UNAVAILABLE یا demo باشد، نه مبلغ واقعی |
| Logistics/marketplaces | not implemented | official API/contract | state شفاف blocked/unavailable |

---

## 9. برنامهٔ کار با اولویت و معیار پذیرش

### Wave 0 — release hygiene (فوری)

1. PR #93: CI سبز، merge، deploy، SHA live، و screenshot فارسی/انگلیسی hero.
2. تثبیت `main` به‌عنوان default branch GitHub با branch protection پس از approval.
3. تعریف release note و یک dashboard سادهٔ «PR → SHA → deployment».

**معیار پذیرش:** health SHA برابر merge SHA؛ hero فارسی/انگلیسی با asset صحیح؛ no failed required check.

### Wave 1 — Admin Catalog و commerce operational readiness

1. UI ایجاد/ویرایش product در admin (API اولیه در PR #93 هست).
2. سه تصویر product: request upload URL، validate JPG/PNG/WebP/size، confirm، alt، sort، remove، max=3.
3. category/variant lifecycle و product publish workflow.
4. seller offer/price/stock separation و permission test.

**معیار پذیرش:** ادمین محصول بدون قیمت مرکزی ایجاد می‌کند؛ seller برای همان variant offer/price می‌گذارد؛ customer فقط offer approved/in-stock را می‌بیند؛ هر mutation audit می‌شود.

### Wave 2 — Payments, address و notification policy

1. تصمیم address: `pickup-only` یا `checkout-only address with retention`.
2. payment architecture: gateway، کارت‌به‌کارت یا هر دو؛ state machine و refund/reconciliation.
3. کارت‌به‌کارت: card registry ادمین، فیش private upload، two-person/role review، notification.
4. Faraz pattern registry، SMS audit/delivery status و opt-in/quiet hours.

**معیار پذیرش:** هیچ payment/SMS success کاذب؛ همهٔ failure/retry/audit paths قابل مشاهده‌اند.

### Wave 3 — Partner activation و data isolation

1. lifecycle همکار: draft → profile → evidence → review → verified/active → suspended.
2. role matrix برای clinic/provider/seller/NGO/insurance/travel.
3. QA tenant isolation برای order/booking/finance/admin access.

**معیار پذیرش:** یک actor سازمان A به دادهٔ سازمان B دسترسی ندارد؛ approval در audit است؛ UI رفتار permission denied صحیح دارد.

### Wave 4 — experience convergence و production readiness

1. route-by-route visual QA از تصاویر reference؛ mobile/desktop/light/dark/RTL/LTR.
2. login/password/OTP browser E2E؛ رفع گزارش «فرم نام کاربری و رمز کامل باز نمی‌شود» با reproduction واقعی.
3. retention/export/deletion policy؛ backup/monitoring/alerting/runbook.
4. production credentials و failover/incident process.

---

## 10. تصمیم‌های محصولی که PM باید بگیرد

1. آیا address برای **فقط checkout** مجاز است یا همهٔ deliveryها pickup-only شوند؟
2. آیا discount فقط seller promotion است یا platform campaign هم مجاز است؟ owner/approval هر کدام چیست؟
3. payment order: کارت‌به‌کارت اول یا gateway اول؟ چه کسی فیش را review می‌کند و SLA چیست؟
4. تعریف دقیق «همکار فعال»: مدارک لازم و شروط هر vertical چیست؟
5. notification matrix: کدام eventها in-app/push/SMS/email هستند و چه eventی bypass quiet hours می‌کند؟
6. آیا activation Google/OTP در admin صرفاً feature flag است یا نیازمند approval/config checklist؟
7. retention: health document، payment receipt، address، audit و export تا چه مدت و با چه deletion policy نگه‌داری می‌شوند؟
8. کدام routeها باید در MVP عمومی شوند و کدام‌ها internal/preview بمانند؟

---

## 11. Definition of Done برای هر آیتم بعدی

یک feature فقط وقتی «تمام و منتشرشده» است که:

1. acceptance criteria و owner محصول مشخص باشد.
2. API/authorization/error/empty/loading state پیاده شده باشد.
3. unit/integration/e2e متناسب اضافه یا به‌روزرسانی شده باشد.
4. CI کامل green باشد.
5. تغییر به `main` merge شده باشد.
6. deployment workflow موفق باشد.
7. health SHA با merge SHA تطبیق داشته باشد.
8. در browser با role و دادهٔ واقعی/مجاز QA شده باشد.
9. audit/privacy/retention/external dependency بررسی شده باشد.
10. release note و وضعیت adapter به‌روزرسانی شده باشد.

تا پیش از همهٔ این بندها، وضعیت درست «در توسعه»، «در PR» یا «وابسته به provider» است؛ نه «live» یا «کامل».
