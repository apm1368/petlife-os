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

## ۱۰. عملیات Clinic OS (G5)
همهٔ این مسیرها زیر `/provider/clinic` هستند و فقط به سازمان خود کاربر دسترسی دارند.

- **یادداشت مشتری:**
  - `GET`/`POST customers/:householdId/notes` با `{body ≤2000, visibleToOwner?}`، و `DELETE …/:noteId` که فقط نویسنده یا مدیر می‌تواند انجام دهد.
  - یادداشتی که `visibleToOwner` دارد، برای صاحب پت در `GET /me/clinic-notes` نمایش داده می‌شود.
- **برچسب‌ها:**
  - `GET`/`POST tags` با `{name}`؛ `DELETE tags/:id` فقط برای مدیر.
  - `POST`/`DELETE customers/:householdId/tags/:tagId`.
  - فهرست مشتریان: `GET customers?tagId=`؛ هر ردیف حالا `tags[]` هم دارد.
- **صف روزانه:** `GET queue?date=YYYY-MM-DD` (به وقت تهران). خروجی `{counts, buckets}` با این گروه‌ها:
  - `SCHEDULED`
  - `WAITING`
  - `IN_CONSULTATION`
  - `COMPLETED`
  - `NO_SHOW`
  - `CANCELLED`

  این صف از همان وضعیت‌های نوبت ساخته می‌شود و مدل جداگانه‌ای ندارد.
- **تخصیص نوبت:** `POST appointments/:bookingId/assign` با `{providerUserId?, resourceId?}` (مقدار null یعنی برداشتن تخصیص). خطاها: `STAFF_DOUBLE_BOOKED`، `RESOURCE_DOUBLE_BOOKED`، `BOOKING_NOT_ASSIGNABLE`.
- **کارهای داخلی:**
  - `GET tasks?status=OPEN|DONE|CANCELLED&mine=true` و `POST tasks` با `{type, title, dueAt?, assigneeProviderUserId?, householdId?, bookingId?}`.
  - `POST tasks/:id/done` و `POST tasks/:id/cancel`. هر ردیف فیلد `overdue` دارد.
  - typeها: `CALL_CUSTOMER`، `FOLLOW_UP_LAB`، `CONFIRM_APPOINTMENT`، `COLLECT_PAYMENT`، `OTHER`.
- **کمپین یادآور** (نیاز به `clinic.bulk_reminders`؛ پلن GROWTH به بالا):
  - پیش‌نمایش: `POST campaigns/preview` با `{segment: APPOINTMENTS_TOMORROW|VACCINES_DUE|FOLLOW_UP_DUE}`. خروجی: `{count, alreadySentToday, sample[]}`.
  - ارسال: `POST campaigns` با `{segment, title, note?, confirm: true, expectedCount}`.
  - خطاها: `AUDIENCE_CHANGED`، `ALREADY_SENT_TODAY`، `MONTHLY_REMINDER_CAP`.
  - ارسال فقط از سیستم اعلان‌ها انجام می‌شود؛ پیامک واقعی وجود ندارد.
- **ورود CSV** (فقط مدیر):
  - `POST contacts/import` با `{csv, dryRun?: true}`. ستون‌ها: `name, phone, email, petName, species, notes`؛ حداکثر ۱۰۰۰ ردیف.
  - خروجی: `{totalRows, validRows, errors[{row, field, reason}], duplicates[{row, matches: FILE|EXISTING, field}], imported}`.
  - `dryRun: false` فقط ردیف‌های سالم و غیرتکراری را وارد می‌کند. هیچ ادغامی با حساب‌های PET LIFE انجام نمی‌شود.
  - فهرست: `GET contacts?q`.
- **خروجی CSV** (فقط مدیر، نیاز به `clinic.exports`): `GET exports/:kind` که `kind` یکی از `customers`، `appointments`، `services` یا `contacts` است.
  - خروجی: `{filename, contentType, csv}`.
  - سلول‌های فرمول‌مانند (شروع با `=`، `+`، `-` یا `@`) با `'` خنثی می‌شوند.
  - تماس مشتریان پلتفرم هرگز در خروجی نمی‌آید.
- **entitlementهای جدید:** `clinic.bulk_reminders` و `clinic.exports`؛ در BASIC بسته و در GROWTH و PRO باز.
- **از قبل موجود بود:**
  - ویزیت بالینی (encounter) و علائم حیاتی؛
  - نسخه و پیوند نتیجهٔ آزمایش یا تصویربرداری به ویزیت؛
  - کاتالوگ خدمات و ساعت کاری، از Provider OS.
- **دادهٔ نمایشی** (درمانگاه مهر):
  - دو یادداشت، یکی از آن‌ها قابل‌مشاهده برای صاحب پت؛
  - برچسب‌های VIP، «پیگیری» و «پیگیری پرداخت»؛
  - سه کار: یکی overdue، یکی باز، یکی انجام‌شده؛
  - دو مخاطب واردشده.

## ۱۱. سفر، مکان‌ها و بیمه (G6)
- **ویژگی‌های مکان:** فیلدهای `shadeAvailable`، `fencedArea`، `wasteBins`، `smallDogArea`، `parkingAvailable`، `entryFeeIrr` (۰ یعنی رایگان، null یعنی نامعلوم) و `petFriendlyLevel` (`FULL` | `PARTIAL` | `OUTDOOR_ONLY`).
  - null همیشه یعنی «نامعلوم» و نباید «ندارد» نمایش داده شود.
  - فیلتر فهرست مکان‌ها: `GET /places?fencedArea=true&smallDogArea=true&free=true`.
- **پیشنهاد مکان جدید:**
  - صاحب پت: `POST /place-suggestions` با `{name, category, city, address?, latitude?, longitude?, notes?}`، و `GET /place-suggestions/mine`.
  - ادمین: `GET /admin/place-suggestions?status` و `POST …/:id/approve|reject` با `{note?}`.
  - تأیید پیشنهاد، مکان را **تأییدنشده و غیرعمومی** می‌سازد. برای عمومی شدن، ادمین باید آن را تکمیل و منتشر کند.
  - اصلاح یا گزارش بسته شدن مکان موجود، همچنان از مسیر `POST /places/:id/reports` انجام می‌شود.
- **چک‌لیست سفر:**
  - `GET`/`POST /pets/:petId/trips/:tripId/checklist` با `{label, category}`.
  - `POST …/checklist/defaults` شش مورد پیشنهادی را فقط یک بار اضافه می‌کند.
  - `PATCH …/checklist/:itemId` با `{done}` و `DELETE`.
  - categoryها: `DOCUMENTS` | `MEDICATION` | `FOOD` | `CARRIER` | `BOOKING` | `EMERGENCY` | `OTHER`.
  - مدارک رسمی سفر همچنان در requirements هستند و مدرک پزشکی به آن‌ها لینک می‌شود.
- **همراهان سفر:**
  - `GET`/`POST …/participants` با `{petId}` یا `{userId}`، فقط از اعضای همان خانوار؛ و `DELETE …/participants/:id`.
  - خروجی: `{primaryPet, pets[], members[]}`.
- **پوشهٔ آماده‌سازی ادعای بیمه:**
  - `GET`/`POST /pets/:petId/claim-preps` با `{title, incidentDate?, notes?}`.
  - `POST …/:id/items` با `{kind: MEDICAL_DOCUMENT|BOOKING, refId}`، فقط از همان پت.
  - `PATCH …/:id` با `{status: DRAFT|READY}`.
  - همیشه `submission: "NOT_AVAILABLE"` است و چیزی برای بیمه‌گر ارسال نمی‌شود.
- **از قبل موجود بود:** آمادگی سفر، پاسپورت پت، مقایسهٔ بیمه (پوشش، فرانشیز، سقف سالانه، دورهٔ انتظار، گونه و سن)، و چرخهٔ عمر درخواست بیمه.
- **دادهٔ نمایشی:** سفر تهران به رامسر با چک‌لیست ۴ موردی (یکی انجام‌شده)، یک پیشنهاد مکان در انتظار، یک پوشهٔ ادعا، و ویژگی‌های پارک‌ها.

## ۱۲. حمایت از حیوانات: تعامل (G7)
- **به‌روزرسانی هر نیاز:**
  - عمومی: `GET /animal-support/needs/:id/updates`.
  - مدیر نیاز: `POST …/updates` با `{body}` و `DELETE …/updates/:updateId`.
  - به‌روزرسانی برای این گروه‌ها اعلان `animal_support.need_update` می‌فرستد: دنبال‌کنندگان سازمان، کمک‌کنندگانی که پیشنهادشان پذیرفته یا انجام شده، و اهداکنندگان همان نیاز.
- **نقاط عطف:** `GET /animal-support/needs/:id/milestones` خروجی `[{key, at}]` می‌دهد. کلیدها:
  - `FUNDING_50`
  - `FUNDING_100`
  - `FIRST_HELP_RECEIVED`
  - `FULFILLED`
  - `CLOSED`

  همه از داده‌های واقعی محاسبه می‌شوند و هیچ‌کدام ذخیره یا ساخته نمی‌شوند.
- **دنبال کردن سازمان:** `POST`/`DELETE /animal-support/organizations/:id/follow` (فقط سازمان تأییدشده)، و `GET /me/followed-organizations`.
- **ذخیرهٔ نیاز:** `POST`/`DELETE /animal-support/needs/:id/save`، و `GET /me/saved-needs`. نیازی که پنهان یا حذف شود، از این فهرست خارج می‌شود.
- **علاقه به داوطلبی:**
  - کاربر: `POST`/`DELETE /animal-support/organizations/:id/volunteer` با `{kinds:[TRANSPORT|TEMPORARY_FOSTER|DELIVERY|ON_SITE_HELP], city, availability?, note?, shareContact?}`، و `GET /me/volunteer-interests`.
  - پنل NGO: `GET /ngo/volunteers?status` و `POST /ngo/volunteers/:id/status` با `{NEW|CONTACTED|CLOSED}`.
  - تماس داوطلب فقط وقتی برای سازمان نمایش داده می‌شود که `shareContact` درست باشد.
- **کمک مالی تکرارشونده:** فقط معماری‌اش آماده است. پرداخت تکرارشونده وجود ندارد، چون درگاه واقعی هنوز `SANDBOX` است، و چیزی هم شبیه‌سازی نمی‌شود.
- **دادهٔ نمایشی:**
  - یک به‌روزرسانی روی نیاز «فقط نقدی»؛
  - یک دنبال‌کننده؛
  - یک نیاز ذخیره‌شده؛
  - یک داوطلب با تماس اشتراکی.

## ۱۳. انجمن: عمق (G8 بخش ۱)
- **ایجاد پست:** `POST /community/posts` حالا این دو فیلد را هم می‌پذیرد:
  - `topics[]` (حداکثر ۳، از میان `DOGS`، `CATS`، `HEALTH`، `TRAINING`، `LOST_PETS`، `TRAVEL`، `ADOPTION`، `NUTRITION`، `OTHER`)؛
  - `city` (فقط نام شهر و بدون مختصات).

  هر دو فیلد در خروجی پست هم برمی‌گردند.
- **فیلتر فید:** `GET /community/posts?topic=&city=` (شهر بدون حساسیت به حروف بزرگ و کوچک).
- **پاسخ به نظر:**
  - `POST /community/posts/:id/comments` با `{body, parentCommentId?}`. پاسخ فقط به نظرهای سطح اول ممکن است؛ پاسخ به پاسخ ۴۰۴ می‌دهد.
  - `GET …/comments` نظرهای سطح اول را صفحه‌بندی‌شده برمی‌گرداند و هر کدام `replies[]` دارد.
  - هر نظر فیلد `parentCommentId` دارد.
- **اعلان‌ها:** `community.post_comment` (برای نویسندهٔ پست) و `community.comment_reply` (برای نویسندهٔ نظر). هیچ‌کس برای کار خودش اعلان نمی‌گیرد.
- **مسدودسازی:** بین دو عضوی که یکی دیگری را مسدود کرده، نظر و پاسخ ممکن نیست. خطا: `COMMUNITY_INTERACTION_BLOCKED` (403).
- **پست ذخیره‌شده:** `POST`/`DELETE /community/posts/:id/save` و `GET /community/saved-posts`. این فهرست فقط برای خود کاربر است و پست حذف‌شده از آن خارج می‌شود.
- **پست پنهان یا حذف‌شده:** هیچ تعامل تازه‌ای نمی‌پذیرد.
- **دادهٔ نمایشی:**
  - سه پست با موضوع و شهر؛
  - یک نظر با یک پاسخ؛
  - یک پست ذخیره‌شده.

## ۱۴. چت: کنترل‌های شخصی و محتوا (G8 بخش ۲)
**کنترل‌های شخصی چت** فقط روی همان عضو اثر دارند و طرف مقابل هیچ تغییری نمی‌بیند. هر عضو دیگری برای همهٔ این مسیرها ۴۰۴ می‌گیرد.

- **بایگانی:**
  - `POST /chat/conversations/:id/archive` و `/unarchive`.
  - `GET /chat/conversations?archived=true` فقط گفت‌وگوهای بایگانی‌شده را برمی‌گرداند. فهرست پیش‌فرض بایگانی‌ها را نشان نمی‌دهد.
  - **قاعده:** پیام تازهٔ ورودی گفت‌وگو را خودکار از بایگانی بیرون می‌آورد.
- **بی‌صدا کردن:**
  - `POST /chat/conversations/:id/mute` با `{duration: ONE_HOUR|EIGHT_HOURS|ONE_DAY|FOREVER}`؛ لغو با `DELETE /chat/conversations/:id/mute`.
  - خلاصهٔ گفت‌وگو فیلد `mutedUntil` دارد (FOREVER برابر سال ۹۹۹۹ است).
  - فقط اعلان قطع می‌شود؛ پیام می‌رسد و شمارندهٔ خوانده‌نشده هم تغییر نمی‌کند.
- **حذف برای خودم:**
  - `POST /chat/conversations/:id/delete-for-self` گفت‌وگو و تاریخچه‌اش را فقط برای همین عضو پنهان می‌کند. هیچ پیامی از دیتابیس حذف نمی‌شود و گزارش‌ها قابل‌پیگیری می‌مانند.
  - پیام تازهٔ ورودی یا باز کردن دوبارهٔ گفت‌وگو، آن را برمی‌گرداند، اما پیام‌های قبلی همچنان برای همین عضو پنهان می‌مانند.
- **خلاصهٔ گفت‌وگو:** فیلدهای جدید `archived` و `mutedUntil`.

**محتوا:**
- **زمان مطالعه:** هر مقاله (فهرست و جزئیات) فیلد `estimatedReadingMinutes` دارد که سمت سرور حساب می‌شود (۲۰۰ کلمه در دقیقه، حداقل ۱). UI نباید آن را خودش حساب کند.
- **مقالات مرتبط:** `GET /blog/articles/:slug/related?locale` حداکثر ۴ مقاله برمی‌گرداند.
  - امتیازدهی فقط بر اساس دسته (۳ امتیاز) و برچسب مشترک (هر کدام ۱ امتیاز) است.
  - ترتیب پایدار است و مقالهٔ خودش هرگز در فهرست نمی‌آید.
- **بازخورد:**
  - `GET /blog/articles/:slug/feedback?locale` خروجی `{helpfulCount, notHelpfulCount, mine}` می‌دهد و هیچ هویتی را نشان نمی‌دهد.
  - `POST` (فقط کاربر واردشده) با `{vote: HELPFUL|NOT_HELPFUL, reason?}`. هر کاربر برای هر مقاله فقط یک رأی دارد و تغییر رأی همان رکورد را به‌روز می‌کند.
  - `reason` فقط برای NOT_HELPFUL ذخیره می‌شود.
  - هیچ نظر عمومی‌ای روی محتوای پزشکی ساخته نمی‌شود.
- **دادهٔ نمایشی:**
  - برای `batch2-review@example.test`: یک گفت‌وگوی بی‌صدا (فرستندهٔ مشکوک) و یک گفت‌وگوی «حذف برای خودم» (با «مینا»).
  - برای `clinic-demo-customer@example.test`: یک گفت‌وگوی بایگانی‌شده.
  - دو بازخورد روی راهنمای `dog-vaccination-schedule`.

## ۱۵. اعلان‌ها، فعالیت و اشتراک (G9)
- **گروه اعلان:**
  - هر اعلان فیلد `group` دارد. مقدارهای ممکن:
    - `HEALTH`
    - `CARE`
    - `BOOKING`
    - `ORDER`
    - `TRAVEL`
    - `COMMUNITY`
    - `SUPPORT`
    - `CLINIC`
    - `SUBSCRIPTION`
    - `SECURITY`
    - `OTHER`
  - گروه از روی دسته و نوع اعلان ساخته می‌شود و دسته‌های ذخیره‌شده تغییر نکرده‌اند. مثلاً یادآورهای مراقبت در گروه CARE و پیام‌های کلینیک در CLINIC قرار می‌گیرند.
  - فیلتر: `GET /notifications?group=CARE`.
- **خواندن گروهی:**
  - `POST /notifications/read-all` همهٔ اعلان‌ها را خوانده می‌کند. نسخهٔ `?group=` فقط یک گروه را.
  - `POST /notifications/groups/read` با `{groupKey}`.
  - همه فقط روی اعلان‌های خود کاربر اثر دارند.
- **گروه‌بندی سمت سرور:** `GET /notifications/grouped`
  - خروجی: `[{groupKey, group, type, entityType, entityId, groupCount, unreadCount, latestAt, title, body, deepLink, notificationIds}]`.
  - فقط اعلان‌های هم‌نوع دربارهٔ یک موجودیت با هم ادغام می‌شوند؛ مثلاً ۳ پیام در یک گفت‌وگو.
  - UI نباید خودش گروه‌بندی کند.
- **ترجیح دریافت:**
  - `GET`/`PUT /notification-preferences/digest` با `{group, mode: INSTANT|DAILY|OFF}`.
  - `deliveryStatus: "STORED_ONLY"`: ترجیح فقط ذخیره می‌شود، چون کانال ارسال خلاصهٔ روزانه هنوز وجود ندارد. UI باید همین را صادقانه بگوید.
- **خلاصهٔ اشتراک:** `GET /households/:id/subscription/summary`. خروجی:
  - `status` و `plan`؛
  - `trial: {startsAt, endsAt, daysRemaining}` (سمت سرور حساب می‌شود)؛
  - `renewalAt` و `cancelEffectiveAt`؛
  - `usage[]` به شکل `{key, used, limit, remaining}`.
- **پیش‌نمایش کاهش پلن:** `GET /households/:id/subscription/downgrade-preview?planCode=`. خروجی:
  - `overLimitResources[]` به شکل `{resource, usage, targetLimit, behavior: EXISTING_READABLE_NEW_CREATION_BLOCKED}`؛
  - `lostFeatures[]` با `behavior: FEATURE_UNAVAILABLE_EXISTING_DATA_KEPT`؛
  - `dataDeleted: false`.
- **فید فعالیت خانوار:** `GET /households/:id/activity?cursor&limit` (جدیدترین اول؛ صفحهٔ بعد با `nextCursor`).
  - هر آیتم: `{id, kind, messageKey: "activity.<KIND>", entityType, entityId, petId, petName, occurredAt, deepLink, actor: {displayName, isMe} | null}`.
  - kindها:
    - `PET_ADDED`
    - `PET_UPDATED`
    - `MEMORY_ADDED`
    - `TRIP_CREATED`
    - `CARE_HANDOFF_GRANTED`
    - `SHARE_CARD_CREATED`
    - `CARE_COMPLETED`
    - `DOCUMENT_ADDED`
    - `HEALTH_RECORD_ADDED`
    - `VISIT_COMPLETED`
    - `BOOKING_CONFIRMED`
    - `BOOKING_COMPLETED`
  - فیلتر دسترسی برای هر پت جدا اعمال می‌شود: موارد سلامت فقط برای کسی که `canViewHealth` دارد نمایش داده می‌شوند و موارد مراقبت فقط برای کسی که `canViewCareProfile` دارد.
  - اطلاعات ادمین، مالی، امنیتی، یادداشت‌های داخلی کلینیک و محتوای چت هرگز در فید نمی‌آیند.
- **اتوماسیون‌ها** (هر کدام فقط یک بار ارسال می‌شود):
  - `subscription.trial_ending`: ۲ روز پیش از پایان دورهٔ آزمایشی.
  - `booking.review_invite`: بعد از تکمیل نوبت.
  - `travel.trip_approaching`: ۳ روز پیش از سفر، همراه تعداد موارد باز چک‌لیست.
- **دادهٔ نمایشی:** چهار رویداد فعالیت (خاطره، انجام مراقبت توسط «علی»، حساسیت، به‌روزرسانی پروفایل) برای پت اول `batch2-review@example.test`.

## ۱۶. اعتماد، نظرها، جست‌وجو و حریم خصوصی (G10)

- **اعتراض به تصمیم‌های نظارتی (سمت عضو):**
  - `GET /me/moderation-decisions`: فقط تصمیم‌هایی که روی خود عضو اثر گذاشته‌اند (حساب کاربری، پست/کامنت خودش، نیازهای حمایتی که ساخته، سازمان یا کسب‌وکاری که مالک آن است). هر آیتم: `{actionId, actionType, subjectType, subjectId, reason, decidedAt, appealDeadline, canAppeal, appeal}`.
  - `POST /me/moderation-decisions/:actionId/appeal {reason: 10–2000}`: هر تصمیم فقط یک بار و تا ۳۰ روز. تصمیم دیگران ۴۰۴ می‌دهد. خطاها: `ALREADY_APPEALED` و `APPEAL_WINDOW_CLOSED`.
  - `GET /me/appeals` و `POST /me/appeals/:id/withdraw` (فقط در وضعیت `SUBMITTED`؛ در غیر این صورت `NOT_WITHDRAWABLE`).
  - وضعیت‌ها: `SUBMITTED`، `UNDER_REVIEW`، `APPROVED`، `REJECTED`، `WITHDRAWN` (همراه `partial` برای پذیرش بخشی). ثبت اعتراض هیچ تصمیمی را خودکار برنمی‌گرداند؛ تصمیم با ادمین است.
- **نظرهای ساختاریافته:**
  - خدمات: `POST /bookings/:id/review {rating, quality?, communication?, timeliness?, body?}` (هر بُعد ۱ تا ۵). `summary.dimensions` میانگین هر بُعد است (اگر کسی آن بُعد را نداده باشد `null`).
  - سفر: فیلد `accuracy` در کنار `petFriendliness` و `cleanliness` اضافه شد.
  - پاسخ ارائه‌دهنده: هر نظر فقط یک پاسخ دارد (`POST /provider/reviews/:id/respond`). ویرایش پاسخ `responseEditedAt` را ثبت می‌کند و متن قبلی در رویداد ممیزی می‌ماند. پاسخ به نظر پنهان‌شده ممکن نیست (`REVIEW_NOT_PUBLISHED`) و روی نظر پنهان نمایش داده نمی‌شود.
- **جست‌وجوی سراسری (عمومی):** `GET /search?q&types&city&locale&limit`.
  - انواع: `PROVIDER`، `SERVICE`، `PRODUCT`، `TRAVEL_LISTING`، `PLACE`، `ARTICLE`، `SUPPORT_NEED`، `ORGANIZATION`.
  - فقط آیتم‌های عمومی و تأییدشده؛ هیچ دادهٔ خصوصی (پت، سلامت، سفارش، چت) جست‌وجو نمی‌شود.
  - خروجی: `{q, total, results: [{type, id, preview: {title, subtitle, deepLink}, facets}], counts}`.
- **ذخیره‌شده‌ها:** `GET /me/saved` همهٔ موارد ذخیره‌شده را از همهٔ بخش‌ها (مکان، ارائه‌دهنده، محصول، اقامتگاه، نیاز حمایتی، پست) با `type` و پیش‌نمایش برمی‌گرداند. آیتمی که دیگر عمومی نیست حذف می‌شود.
- **بازدیدهای اخیر:** `GET`/`POST`/`DELETE /me/recently-viewed` (حداکثر ۵۰ مورد؛ فقط آیتم عمومی؛ پاک‌کردن کامل با `DELETE`).
- **حریم خصوصی:**
  - خروجی داده شامل این موارد هم می‌شود: پست‌ها و کامنت‌ها و بازخورد مقاله، متادیتای گفتگوها و پیام‌های ارسالی خود عضو، ذخیره‌شده‌ها، کمک‌ها و داوطلبی و حمایت‌ها، سپردن مراقبت، یادداشت‌های کلینیک که با عضو به اشتراک گذاشته شده، چک‌لیست سفر و اعتراض‌ها.
  - `GET /account/privacy/deletion/preview` حالا `impact[]` دارد به شکل `{domain, count, classification}` و classification یکی از این‌هاست: `DELETABLE`، `ANONYMIZABLE`، `RETENTION_REQUIRED_DECISION`. این فقط گزارش است و چیزی حذف نمی‌کند. سیاست نگهداری هنوز تصمیم محصول است.
- **دادهٔ نمایشی:**
  - یک نظر ساختاریافته روی سفر تاکسی تکمیل‌شده، همراه پاسخ ارائه‌دهنده؛
  - یک هشدار نظارتی با اعتراض ثبت‌شده برای `batch2-review@example.test`؛
  - یک مکان ذخیره‌شده و دو بازدید اخیر برای همان کاربر.

## ۱۷. حالت نگهبان: حساب‌های QA، تغییر امنیتی و ورودی‌های تاریخ

- **حساب‌های آزمون دودی (فقط برای اسکریپت‌های smoke؛ برای طراحی از حساب‌های نمایشی قبلی استفاده کنید):**
  - `qa-smoke-free@example.test`: پلن رایگان؛ یادآور مراقبت و اشتراک با دامپزشک با `409 SUBSCRIPTION_FEATURE_NOT_INCLUDED` و `details.key` رد می‌شوند. این حالت «ارتقا لازم است» را برای طراحی نشان می‌دهد.
  - `qa-smoke-paid@example.test`: پلن plus؛ همان قابلیت‌ها کار می‌کنند.
- **تغییر امنیتی (`8f712ec`):** مسیرهای شبیه‌سازی (`/dev/notifications/*`، `shipping|marketplace …/dev/simulate`) و وبهوک‌های بدون امضای sandbox روی سرور بسته‌اند.
  - اثر روی UI: در checkout، دکمه‌ی «شبیه‌سازی پرداخت در انتظار» روی سرور یک پرداخت `PENDING` می‌سازد که دیگر با وبهوک تأیید نمی‌شود. دکمه‌های «موفق» و «ناموفق» مثل قبل کار می‌کنند.
  - هیچ endpoint محصول تغییر نکرده است.
- **خلاصه‌ی اعلان‌ها:** `deliveryStatus` همچنان `STORED_ONLY` است. متن صفحه باید بگوید ترجیح ذخیره می‌شود ولی ارسال خلاصه فعال نیست (`docs/product/notification-digest-audit.md`).
- **ورودی‌های تاریخ بومی مرورگر (فقط فهرست، برای بازطراحی شما):** این صفحه‌ها هنوز `type="date|time|datetime-local"` دارند. date-picker جلالی در `features/shared/date-picker` موجود است:
  - `features/provider/ProviderCalendarView.tsx` (۳)
  - `features/provider/ProviderAvailabilityView.tsx` (۲)
  - `features/provider/ProviderBookingDetailView.tsx` (۱)
  - `features/notifications/NotificationPreferencesView.tsx` (۲، ساعت سکوت)
  - `features/commerce/PromotionManager.tsx` (۲)
  - `features/onboarding/steps/AgeStep.tsx` (۱)
  - `features/health/VetShareView.tsx` (۱)
  - `features/account/PetAccessView.tsx` (۱)
  - `features/admin/AdminSupportQueueView.tsx`، `AdminSellerFinanceDetailView.tsx`، `AdminMarketplaceReconciliationView.tsx` (هر کدام ۲؛ این‌ها بخش ادمین Batch 7 و متعلق به شما هستند)
