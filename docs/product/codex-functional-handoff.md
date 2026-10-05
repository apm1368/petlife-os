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

---

## ۶. پروفایل پت: ایمنی و کامل بودن (G1)
- `GET /pets/:petId/completeness`: خروجی `{completedFields[], missingFields[], completionScore}`. کلیدهای ممکن:
  - `photo`
  - `species`
  - `breed`
  - `sex`
  - `birthDate`
  - `weight`
  - `microchip`
  - `emergencyContact`
  - `vaccinationHistory`
  - `medicalDocument`

  امتیاز سمت سرور حساب می‌شود و UI نباید آن را خودش محاسبه کند.
- **اطلاعات اضطراری:**
  - `GET` و `PUT /pets/:petId/emergency-info` با فیلدهای `{contactName, contactPhone, contactRelation, bloodType, criticalNotes}`.
  - برای ویرایش، `canEditIdentity` لازم است.
- **کارت‌های اشتراکی** (`canManageAccess`):
  - `GET`/`POST /pets/:petId/share-cards` با بدنهٔ `{kind: EMERGENCY|ID_TAG, expiresInHours?, includeContact?}`.
  - توکن خام **فقط یک بار** در پاسخ ساختن کارت می‌آید: `token` و `publicPath: /pet-card/<token>`. برای QR از همین استفاده کنید.
  - چرخش و ابطال: `POST …/share-cards/:id/rotate` و `/revoke`.
  - `state` در فهرست کارت‌ها: `ACTIVE` | `EXPIRED` | `REVOKED`. `accessCount` و `lastAccessedAt` هم برگردانده می‌شوند.
  - صفحهٔ عمومی `/{locale}/pet-card/:token` بدون ورود باز می‌شود، index نمی‌شود، و داده‌اش از API `GET /public/pet-cards/:token` می‌آید.
  - EMERGENCY حساسیت‌ها، بیماری‌های فعال، داروهای فعال و تماس اضطراری را نشان می‌دهد. ID_TAG فقط هویت و `isReportedLost` را نشان می‌دهد و هیچ دادهٔ سلامتی ندارد.
- **سپردن مراقبت** (`canManageAccess`):
  - `GET`/`POST /pets/:petId/care-handoffs` با بدنهٔ `{email, scopes:[CARE|EMERGENCY_HEALTH|BOOKINGS], startsAt?, expiresAt}`؛ حداکثر ۳۰ روز.
  - ابطال: `DELETE …/:grantId`.
  - `state`: `UPCOMING` | `ACTIVE` | `EXPIRED` | `REVOKED`.
  - گیرنده با `GET /me/care-handoffs` فهرست پت‌های سپرده‌شده را می‌بیند، و اگر scope `EMERGENCY_HEALTH` داشته باشد با `GET /pets/:petId/emergency-snapshot` خلاصهٔ اضطراری را.
- **نقش‌ها:** نقش‌های خانوار (OWNER/FAMILY) به‌علاوهٔ دسترسی جدا برای هر پت از قبل وجود داشت. ADULT_MEMBER، CARETAKER و VIEW_ONLY همه با presetهای همان دسترسی پیاده‌شدنی هستند و مدل جدیدی لازم نبود.
- **دادهٔ نمایشی:** پت اول `batch2-review@example.test`؛ کارت ID در `/fa/pet-card/demo-e230f78e021c492b8cecd9f2e001aef8`.

## ۷. مراقبت: اتوماسیون بدون AI (G2)
- **وضعیت‌ها:** `UPCOMING` | `DUE` | `OVERDUE` | `SNOOZED` | `COMPLETED` | `SKIPPED` | `CANCELLED`.
- **اکشن‌ها:** `COMPLETE` | `SKIP` | `CANCEL` | `SNOOZE` | `RESCHEDULE`.
  - SKIP یعنی این نوبت انجام نشد و نوبت بعدی ساخته می‌شود.
  - تکمیل هم‌زمانِ دوباره رد می‌شود (۴۰۰).
- **تکرار:** `ONCE` | `DAILY` | `WEEKLY` | `WEEKDAYS` (همراه `weekdays:[0..6]`، به وقت تهران) | `MONTHLY` | `YEARLY` | `CUSTOM` (همراه `intervalDays`). پایان سری با `untilDate` یا `maxOccurrences` تعیین می‌شود. `occurrenceIndex` شمارهٔ نوبت در سری است.
- **مراقبت مشترک:** فیلدهای `assignedToUserId` (عضوی که دسترسی ویرایش مراقبت دارد) و `completedByUserId`. یادآور به فرد مسئول می‌رسد، و تخصیص هم اعلان `care.assigned` می‌فرستد.
- **تاریخچه:** `GET /pets/:petId/care-items/history?page&pageSize`، که نام انجام‌دهنده را هم برمی‌گرداند.
- **قالب‌ها:**
  - `GET /care-templates` شش قالب را برمی‌گرداند. موارد با `confirmWithVet: true` باید در UI برچسب «با دامپزشک تأیید کنید» داشته باشند.
  - `POST /pets/:petId/care-templates/apply` با `{templateKey, startAt, items:[{key, title?, recurrence?, intervalDays?, maxOccurrences?}]}` **فقط موارد تأییدشده** را می‌سازد.
- **دادهٔ نمایشی:** پت اول `batch2-review@example.test`. شامل یک کار روزانه سپرده‌شده به «علی»، مسواک WEEKDAYS، دوره‌ی دارو (نوبت ۳ از ۷)، یک مورد OVERDUE، و تاریخچه‌ای با یک انجام‌شده و یک ردشده.

## ۸. خدمات و نوبت (G3)
- **فرم پذیرش (intake):**
  - **سمت عمومی:** `GET /provider-services/:serviceId/intake-form` فرم فعال را برمی‌گرداند: `{id, version, questions[]}`. اگر خدمت فرمی نداشته باشد خروجی `null` است، و برای خدمت ناموجود ۴۰۴.
  - **انواع سؤال:** `TEXT` (تا ۲۰۰ نویسه)، `LONG_TEXT` (تا ۲۰۰۰)، `YES_NO`، `SINGLE_CHOICE`، `MULTI_CHOICE` (همراه `options`)، و `required`.
  - **هنگام رزرو:** `POST /bookings` فیلد `intakeAnswers: {key: value}` را می‌پذیرد. خطا `VALIDATION_ERROR` با `details.errors[]` برمی‌گردد و در این حالت **hold نمی‌سوزد**.
  - **نمایش پاسخ‌ها:** صاحب پت در `GET /bookings/:id` فیلد `intake: {formVersion, answers:[{key, label, type, value}]}` را می‌بیند؛ ارائه‌دهنده در `GET /provider/bookings/:id/intake`.
  - **مدیریت فرم (فقط مدیر):** `PUT /provider/services/:serviceId/intake-form` با `{questions}` نسخهٔ جدید می‌سازد؛ `DELETE` فرم را برمی‌دارد.
- **پیوست نوبت (خصوصی، هر دو طرف):**
  - **مراحل آپلود:** اول `POST …/attachments/upload-url` با `{contentType: pdf|jpeg|png|webp, fileSizeBytes ≤ 20MB}`، بعد `PUT` فایل، بعد `POST …/attachments` با `{key, mimeType, sizeBytes, title?}`.
  - **مسیرهای صاحب پت:** `/bookings/:id/attachments` (GET، POST، `:aid/download`، `DELETE :aid` فقط برای فایل خودش).
  - **مسیرهای ارائه‌دهنده:** `/provider/bookings/:id/attachments` با همان عملیات. فایلی که ارائه‌دهنده اضافه کند، اعلان `booking.provider_document` به صاحب پت می‌فرستد.
  - `side` یکی از `OWNER` | `PROVIDER` است. سقف ۱۰ فایل برای هر طرف.
- **دستورالعمل پس از خدمت:** `POST /provider/bookings/:id/complete` حالا `aftercareInstructions` (تا ۲۰۰۰ نویسه) را هم می‌پذیرد. صاحب پت آن را در `GET /bookings/:id` می‌بیند.
- **علت ساختاریافتهٔ لغو:** `reasonCode`.
  - صاحب پت: `OWNER_CHANGED_PLANS` | `OWNER_PET_UNWELL` | `OWNER_FOUND_ALTERNATIVE` | `OWNER_OTHER`
  - ارائه‌دهنده: `PROVIDER_UNAVAILABLE` | `PROVIDER_VEHICLE_ISSUE` | `PROVIDER_SAFETY_CONCERN` | `PROVIDER_OTHER`

  در `BookingDto` با نام `cancellationReasonCode` برمی‌گردد.
- **از قبل موجود بود:** variant، شرایط گونه/سن/وزن، چند پت در یک نوبت، لیست انتظار، تغییر زمان، check-in/start/complete/no-show، یادداشت داخلی جدا از یادداشت قابل‌مشاهده، و پیگیری بالینی پس از ویزیت (follow-up).

## ۹. پت‌تاکسی (G4)
- **هنگام رزرو** (فقط TRANSPORT):
  - `transportRequirements[]` از میان `CRATE_REQUIRED`، `LARGE_PET`، `MEDICAL_TRANSPORT`، `MULTIPLE_PETS` (خودکار وقتی بیش از یک پت باشد)، `ASSISTANT_REQUIRED`.
  - `pickupContact: {name, phone, consentConfirmed: true}`.
- **خروجی برای صاحب پت:** `transportRoute.requirements`، `transportRoute.pickupContact`، و `rideTimeline[]`.
- **تایم‌لاین دستی (بدون GPS):**
  - ارائه‌دهنده با `GET /provider/bookings/:id/ride` اطلاعات سفر را می‌بیند و با `POST /provider/bookings/:id/ride-events {type, note?}` مرحله ثبت می‌کند.
  - مراحل: `DRIVER_ASSIGNED` ← `ARRIVING` ← `PICKED_UP` ← `DROPPED_OFF`. فقط رو به جلو، و هر مرحله یک بار. خطای ترتیب: `RIDE_EVENT_OUT_OF_ORDER`.
  - اعلان: `booking.ride_arriving`، `booking.ride_picked_up` و `booking.ride_dropped_off`.
- **قیمت:** همچنان `NOT_CONFIGURED`.
- **دادهٔ نمایشی:** سفر CONFIRMED (فقط DRIVER_ASSIGNED) و سفر COMPLETED (هر چهار مرحله)، هر دو با `CRATE_REQUIRED`.
