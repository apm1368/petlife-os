# هندآف کارکردی برای Codex (طراحی)

همهٔ داده‌های این سند روی سرور اصلی هستند: http://185.231.112.154/
حساب‌های نمایشی با ایمیل `…@example.test` و کد یک‌بارمصرف ایمیلی وارد می‌شوند.

**قاعده‌های کلی:**
- مبالغ همیشه به ریال (IRR) و به‌صورت عدد صحیح یا رشتهٔ دسیمال می‌آیند. تبدیل به تومان فقط در لایهٔ نمایش انجام می‌شود.
- هر جا داده‌ای «پیکربندی‌نشده» است، UI باید همین را صادقانه بگوید و هرگز عدد نسازد.
- منطق یا قرارداد API را تغییر نده. اگر نیاز به فیلد تازه داری، درخواستش را برای Claude بفرست.

---

## ۱. حمایت از حیوانات
**وضعیت‌های نیاز:**
- `PUBLISHED`
- `PARTIALLY_FULFILLED`
- `FULFILLED`
- `PAUSED`
- `EXPIRED`
- `CLOSED`

**نوع کمک** با `contactMode` مشخص می‌شود: `DONATE` یعنی فقط نقدی، `OFFER_HELP` یعنی فقط کالا یا خدمت، `BOTH` یعنی ترکیبی.

**پیشرفت نیاز:** از `GET /animal-support/needs/:id/summary` گرفته می‌شود. دو خط پیشرفت مستقل از هم دارد:
- **نقدی:** `targetAmountIrr`، `raisedAmountIrr`، `remainingAmountIrr`، `donationCount`. این اعداد از دفتر حساب کمک‌ها می‌آیند.
- **کالایی:** `neededQuantity`، `fulfilledQuantity`، و شمارش پیشنهادهای کمک.

**وضعیت‌های پیشنهاد کمک:**
- `PENDING`
- `ACCEPTED` (تعهد فعال)
- `IN_PROGRESS`
- `COMPLETED` (کمک دریافت‌شده)
- `DECLINED`
- `CANCELLED`

**نیازهای نمایشی:**

| حالت | شناسه |
|---|---|
| فقط نقدی، بخشی تأمین‌شده (۳۰ از ۸۰ میلیون ریال) | `8ed15d8f-6954-4333-866f-1f5ca2d43a7f` |
| فقط کالایی (۸ از ۲۰ کیلو؛ یک تعهد فعال، یک کمک دریافت‌شده، یک پیشنهاد در انتظار) | `601db658-91f2-4289-8767-b336e6d32612` |
| ترکیبی (۱۵ از ۴۰ میلیون ریال و ۴ از ۱۰ بسته) | `22fd64a0-7803-4ff1-8207-21bd7b53bbdd` |
| کاملاً تأمین و تحویل‌شده | `d191e357-76e9-457a-8381-38a653678de0` |

**حریم خصوصی:** هویت کمک‌کنندگان در صفحهٔ عمومی نمی‌آید و فقط شمارش‌ها نمایش داده می‌شوند.

## ۲. پت‌تاکسی
**درخواست قیمت:** `GET /provider-services/:serviceId/transport-quote?pickupAddressId&dropoffAddressId`. پاسخ شامل این فیلدهاست:
- `pricingStatus`:
  - `CONFIGURED`: نرخ مسافتی فعال است و قیمت از مسافت حساب شده.
  - `NOT_CONFIGURED`: نرخ مسافتی تعریف نشده. **وضعیت فعلی سرور زنده همین است.**
  - `DISTANCE_UNAVAILABLE`: نرخ هست، اما مسافت قابل اندازه‌گیری نیست.
- `estimateBasis`: پایهٔ عدد تخمینی. `DISTANCE_TARIFF` یعنی نرخ مسافتی؛ `SERVICE_FIXED_PRICE` یعنی قیمت ثابتی که خود ارائه‌دهنده برای خدمت گذاشته؛ `NONE` یعنی هیچ‌کدام.
- `distanceSource`: یکی از `MAP_PROVIDER`، `STRAIGHT_LINE_DEMO` یا `UNAVAILABLE`. نقشهٔ واقعی فعلاً `BLOCKED_EXTERNAL` است.
- `distanceMeters`، `pricing` (`baseFareIrr`، `perKmRateIrr`، `serviceAdjustmentIrr`، `minimumFareIrr`)، `estimatedFareIrr`، `pickup` و `dropoff` (متن، lat، lng).

**قاعدهٔ نمایش:**
- وقتی `NOT_CONFIGURED` است، **هرگز** «کرایهٔ مسافتی» نشان نده.
- اگر `estimateBasis = SERVICE_FIXED_PRICE` است، بنویس «قیمت ثابت ارائه‌دهنده».

**رزرو:** هر رزرو یک `transportRoute` دارد. این یک snapshot ثابت است و بعداً تغییر نمی‌کند.

**سفرهای نمایشی** (مشتری `clinic-demo-customer@example.test`):

| وضعیت | شناسه |
|---|---|
| REQUESTED | `6e51b433-94b4-4d8e-8632-9e273a881455` |
| CONFIRMED | `6a94ad0d-2211-45c5-8247-67d06208e6e0` |
| COMPLETED | `7a49b856-9f18-4c5a-8a71-ea3df8fa0479` |

قیمت این سفرها با **تعرفهٔ QA** حساب شده و قیمت تجاری نیست.

## ۳. بلاگ و راهنما
**مسیرها:**
- `/{locale}/blog` و `/{locale}/blog/:slug`
- `/{locale}/guides` و `/{locale}/guides/:slug`

اگر مقالهٔ راهنما از مسیر blog باز شود، به `/guides` هدایت می‌شود. یک slug ناموجود EmptyState نشان می‌دهد.

**API:**
- `GET /blog/articles?locale&categorySlug=guides` برای راهنماها؛
- `GET /blog/articles?locale&excludeCategorySlug=guides` برای بلاگ.

هر مقاله `canonicalPath` دارد و لینک‌ها باید از همین ساخته شوند.

**slugهای نمایشی:**

| بخش | slug |
|---|---|
| راهنما | `dog-vaccination-schedule` |
| راهنما | `signs-to-see-a-vet` |
| راهنما | `dog-cat-dental-care` |
| بلاگ | `cat-nutrition-by-age` |
| بلاگ | `teaching-dog-to-stay-alone` |

**پرسش‌های متداول و راهنمای پشتیبانی:** مرکز پشتیبانی جداست (`/support`) و جزو مقالات حساب نمی‌شود.

## ۴. چت انجمن
**Endpointها** (جزئیات کامل در `docs/product/community-chat-architecture.md`):
- `POST /chat/conversations` با بدنهٔ `{participantUserId}`
- `GET /chat/conversations`
- `GET` و `POST` روی `/chat/conversations/:id/messages`
- `POST /chat/conversations/:id/read`
- `GET /chat/unread-count`
- `GET` و `POST` روی `/chat/blocks`، و `DELETE /chat/blocks/:userId`
- گزارش پیام: `POST /reports` با `targetType: "CHAT_MESSAGE"`

**وضعیت گفت‌وگو:**
- `blocked` یعنی گفت‌وگو از هر طرفی مسدود شده است.
- `blockedByMe` یعنی خود کاربر مسدود کرده. دکمهٔ «رفع مسدودی» فقط در این حالت نمایش داده شود.
- `unreadCount` تعداد پیام‌های خوانده‌نشده است.

**خطاها:**
- `CHAT_BLOCKED` (403)
- 404 برای گفت‌وگوی غیرمجاز یا ناموجود
- `VALIDATION_ERROR` برای پیام خالی یا بیش از ۲۰۰۰ نویسه
- 429 برای ارسال بیش از حد مجاز

**گفت‌وگوهای نمایشی** (با حساب `batch2-review@example.test`):

| سناریو | شناسه |
|---|---|
| گفت‌وگوی عادی، یک پیام خوانده‌نشده | `25eca4b0-2b66-4361-8e88-59c54571265f` |
| پیام مشکوک گزارش‌شده و فرستندهٔ مسدودشده | `5d99f6cd-6ee8-4291-8a17-ba658eb4985b` |

## ۵. Clinic OS
جزئیات کامل در `docs/product/clinic-os-architecture.md` (بخش ۸) است.

**پلن‌ها:**
- `CLINIC_BASIC`، `CLINIC_GROWTH` و `CLINIC_PRO`.
- قیمت این پلن‌ها هنوز تعیین نشده (`PRODUCT_DECISION_LATER`) و `prices` خالی است. UI باید بنویسد «قیمت اعلام نشده».

**سقف‌ها:**

| پلن | کارکنان | شعبه |
|---|---|---|
| CLINIC_BASIC | ۳ | ۱ |
| CLINIC_GROWTH | ۱۰ | ۳ |
| CLINIC_PRO | نامحدود | نامحدود |

- پاسخ `usage` به شکل `{used, limit}` است و `limit = null` یعنی نامحدود.
- یادآور و گزارش مالی از پلن GROWTH به بالا فعال می‌شوند.

**endpointهای کارکرد کلینیک:**

| کارکرد | Endpoint |
|---|---|
| کارکنان | `GET`/`POST /provider/clinic/staff` |
| شعبه‌ها | `GET`/`POST /provider/clinic/branches` |
| مشتریان | `/provider/clinic/customers` و `/:householdId` |
| نوبت‌ها | `/provider/bookings/*` (بدون تغییر) |
| پروندهٔ پزشکی | `/provider/clinical/*` (بدون تغییر) |
| یادآور و پیام | `/provider/clinic/reminders` |
| گزارش مالی (فقط OWNER) | `/provider/clinic/reports/finance` |

**خطاهایی که UI باید مدیریت کند:**
- `SUBSCRIPTION_FEATURE_NOT_INCLUDED`: قابلیت در پلن فعلی نیست.
- `SUBSCRIPTION_ENTITLEMENT_LIMIT_EXCEEDED`: سقف پلن پر شده.
- `CLINIC_STAFF_ALREADY_MEMBER`: این شخص از قبل عضو تیم است.
- `PROVIDER_ACCESS_DENIED`: نقش کاربر کافی نیست.

**داده‌های نمایشی:**
- **کلینیک:** «درمانگاه دامپزشکی مهر» روی پلن CLINIC_PRO.
  - مدیر: `batch3-clinic-owner@example.test`
  - دامپزشک: `clinic-demo-vet@example.test`
- **مشتری:** `clinic-demo-customer@example.test`
  - خانوار: `b517e7a1-915a-45fc-89cb-c387c56c8546`
  - پت «پیشی»: `56e95971-872b-407f-8359-df6ddd939fce`
- **نوبت‌ها:**
  - دو نوبت تکمیل‌شده: `2b1234be-b540-4702-89b8-128175cbfe25` و `0517cda3-ed12-40b5-8943-20be2712a0ed`
  - نوبت پیش‌رو: `ab0b906d-97f8-4216-8482-8c9dc63a573f`
- **ویزیت بالینی** با علائم حیاتی: `9e631f8f-74cb-4aee-84e0-976afa095e2e`
- **یادآور واکسن:** `3c7fc849-d14c-45f0-8149-a013de8103ff`
