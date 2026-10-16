# صف ادامهٔ تثبیت — وضعیت مبتنی بر کد

مبنا: `9f2048d8afa4da4b66e1a291b31d0998ac1cc8df`؛ این فهرست گزارش اجرای زندهٔ همهٔ صفحات نیست. مرجع هماهنگی [Issue #4](https://github.com/apm1368/petlife-os/issues/4).

## قابلیت‌های این ادامه

| قابلیت | وضعیت | قرارداد / شاهد | تست و PR |
|---|---|---|---|
| پروندهٔ نجات ادمین | ادغام‌شده در تثبیت با PR #30 | فهرست، جزئیات، ساخت، تغییر وضعیت؛ endpoint جدید ثبت مدرک پس از upload با قفل و محدودیت همان پرونده | [PR #30](https://github.com/apm1368/petlife-os/pull/30)، CI کامل و ۱۸ تست UI پاس، ادغام ace9496 |
| کمپین ادمین | ادغام‌شده با PR #30 | فهرست/جزئیات/ساخت/وضعیت/گزارش پیشرفت/مدرک/اشتراک در انجمن از APIهای موجود | تراکنش زنده اجرا نمی‌شود |
| صندوق سازمان | ادغام‌شده با PR #30 | ماندهٔ دفتر کل، مجوز payout جدا، ثبت پرداخت انجام‌شده؛ قفل همزمانی بکند | انتقال بانکی بیرونی در این قابلیت وجود ندارد |
| اطلاعات سازمان | ادغام‌شده با PR #30 | PATCH موجود؛ undefined حفظ، null پاک‌کردن متن اختیاری؛ رد نام null | تست قرارداد و UI |
| تنظیمات ادمین و اعلان عمومی | ادغام‌شده در تثبیت با PR #31 | پنج API موجود، مجوز جدا، تأیید دوم، نسخه‌بندی و مصرف اعلان عمومی | ۱۶ تست تنظیمات/منو/اعلان، ۲۲ تست پوسته و CI کامل f1851de پاس؛ ادغام 64d59e5 |
| فهرست همکاران | PR #32؛ بررسی نهایی | دو API فهرست موجود؛ صفحه‌بندی واقعی و مجوز خواندن مستقل | ۱۰ تست و ۸ تصویر نهایی + ۴ قبل پاس؛ نسخهٔ ترکیبی مجدداً بررسی می‌شود |
| استعلام رسمی KYC | مسدود به سرویس بیرونی | جریان دستی مدارک موجود است، استعلام رسمی وجود ندارد | نیازمند سرویس/قرارداد واقعی |
| پرداخت/پیامک/ارسال/بیمه/S3/HTTPS | آماده‌بودن واقعی تأیید نشده | docs/ops/external-readiness.md سابقه است و وضعیت فعلی باید مستقل خوانده شود | بدون کلید/قرارداد و تصمیم محصول، موفقیت جعل نمی‌شود |

## گروه‌های باز برای تطبیق دستی

جدول از کنترلرهای واقعی و سرویس/مصرف‌کنندهٔ فعلی ساخته شده است. «نیازمند تطبیق» مساوی نبود API یا UI نیست؛ alias، aggregate و عملیات داخلی باید با کد تعیین تکلیف شوند. `STATIC_UI_CHAIN_FOUND` نیز گواه تکمیل یا مجوز صحیح نیست. افزودن دکمهٔ خالی برای کاهش عدد ممنوع است.

| گروه | ردیف نیازمند تطبیق | قراردادهای نمونه | وضعیت / تست / PR |
|---|---:|---|---|
| `modules/account/account.controller.ts` | 1 | `GET /account/activity` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/activity/household-activity.controller.ts` | 1 | `GET /households/:param/activity` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/admin/animal-support` | 0 | upload لوگوی سازمان | در #30 به ویرایش سازمان متصل؛ ثبت پس از PUT موفق و مجوز manage |
| `modules/admin/commerce` | 1 | `GET /admin/commerce/promotions/:param` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/admin/content` | 2 | `GET /admin/content/media/:param`؛ `GET /admin/content/placements` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/admin/customer` | 4 | `GET /admin/customers/:param/overview`؛ `POST /admin/customers/:param/suspend`؛ `POST /admin/customers/:param/unsuspend` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/admin/finance` | 11 | `POST /admin/settlements/:param/adjustments`؛ `GET /admin/marketplace-reconciliation/:param`؛ `GET /admin/finance/trace` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/admin/insurance` | 1 | `POST /admin/insurance/providers/:param/logo-upload-url` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/admin/orgs` | 2 | `GET /admin/providers/:param`؛ `GET /admin/sellers/:param` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/admin/partners` | 8 | `GET /admin/providers/:param/overview`؛ `GET /admin/clinics`؛ `GET /admin/clinics/:param/operations` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/admin/pets` | 3 | `GET /admin/pets`؛ `GET /admin/pets/:param`؛ `POST /admin/pets/:param/grants/:param/revoke` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/admin/places` | 4 | `GET /admin/places/:param`؛ `POST /admin/places`؛ `PATCH /admin/places/:param` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/admin/services` | 2 | `POST /admin/provider-services/:param/deactivate`؛ `POST /admin/provider-services/:param/reactivate` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/admin/settings` | 0 | پنج قرارداد موجود تنظیمات | رابط/تست/تصاویر PR #31؛ خارج از ادعای تکمیل همه صفحات |
| `modules/admin/subscriptions` | 2 | `GET /admin/subscriptions/plans/:param`؛ `GET /admin/subscriptions/billing-attempts` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/admin/support` | 14 | `GET /admin/support/:param/extras`؛ `PUT /admin/support/:param/tags`؛ `POST /admin/support/:param/links` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/admin/system` | 1 | `GET /admin/system/integrations` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/admin/trust` | 3 | `POST /admin/trust/queue/claim`؛ `POST /admin/trust/queue/release`؛ `POST /admin/trust/queue/dismiss` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/animal-support/public-animal-support.controller.ts` | 1 | `GET /animal-support/rescue-cases/:param` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/animal-support/support-engagement.controller.ts` | 16 | `GET /animal-support/needs/:param/updates`؛ `GET /animal-support/needs/:param/activity`؛ `GET /animal-support/needs/:param/milestones` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/auth/google` | 2 | `POST /dev/auth/google/simulate`؛ `GET /auth/google` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/booking/bookings.controller.ts` | 2 | `POST /bookings/:param/report-provider-no-show`؛ `GET /provider-services/:param/eligibility` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/booking/engagement.controller.ts` | 3 | `POST /waitlist/:param/accept-offer`؛ `POST /waitlist/:param/decline-offer`؛ `GET /providers/:param/reviews` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/booking/transport` | 1 | `GET /provider-services/:param/transport-quote` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/care-calendar/care-calendar.controller.ts` | 1 | `GET /care-calendar` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/care-reminders/care-reminder.controller.ts` | 8 | `GET /pets/:param/care-items`؛ `GET /pets/:param/care-items/history`؛ `GET /pets/:param/care-items/:param` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/clinic-os/clinic-os.controller.ts` | 4 | `GET /provider/clinic/contacts`؛ `GET /admin/clinic-subscriptions/plans`؛ `GET /admin/clinic-subscriptions/:param` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/clinical-health/pet-observation.controller.ts` | 1 | `GET /pets/:param/observations/:param/download` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/clinical-health/provider-clinical.controller.ts` | 15 | `GET /provider/patients/:param`؛ `GET /provider/patients/:param/visits`؛ `POST /provider/labs/:param/amend` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/commerce/catalog` | 1 | `GET /shop/products/:param/offers` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/commerce/checkout` | 3 | `POST /checkout/:param/revalidate`؛ `PATCH /checkout/:param`؛ `GET /checkout/:param/financing-intent/:param` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/commerce/logistics` | 4 | `POST /shipping/dev/simulate/:param`؛ `GET /orders/:param/fulfillment`؛ `GET /orders/:param/shipment` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/commerce/marketplace` | 8 | `GET /seller-organizations/:param/channels/:param`؛ `POST /seller-organizations/:param/channels/:param/reconcile`؛ `POST /seller-organizations/:param/channels/:param/dev/simulate/order` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/commerce/orders` | 1 | `POST /orders/:param/refunds` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/commerce/reconciliation` | 2 | `POST /payments/reconcile/:param`؛ `POST /financing/reconcile/:param` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/commerce/refunds` | 2 | `GET /orders/:param/refunds`؛ `GET /refunds/:param` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/commerce/repeat-delivery` | 5 | `POST /repeat-deliveries/:param/skip`؛ `POST /repeat-deliveries/:param/pause`؛ `POST /repeat-deliveries/:param/resume` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/community/chat` | 9 | `POST /chat/conversations`؛ `GET /chat/conversations/:param/messages`؛ `POST /chat/conversations/:param/archive` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/community/community.controller.ts` | 3 | `POST /community/posts/:param/save`؛ `DELETE /community/posts/:param/save`؛ `GET /community/saved-posts` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/consumer-hub/consumer-hub.controller.ts` | 5 | `GET /search`؛ `GET /me/saved`؛ `GET /me/recently-viewed` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/content/public-blog.controller.ts` | 4 | `GET /blog/articles/:param/related`؛ `GET /blog/articles/:param/feedback`؛ `POST /blog/articles/:param/feedback` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/content/public-content-placement.controller.ts` | 1 | `GET /content/placements/:param` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/health-depth/health-depth.controller.ts` | 1 | `GET /pets/:param/care-suggestions` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/home/home.controller.ts` | 1 | `GET /home` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/insurance/claim-prep.controller.ts` | 6 | `GET /pets/:param/claim-preps`؛ `POST /pets/:param/claim-preps`؛ `GET /pets/:param/claim-preps/:param` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/insurance/insurance.controller.ts` | 1 | `GET /pets/:param/insurance-applications/:param` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/insurance/public-insurance.controller.ts` | 2 | `GET /insurance/providers`؛ `GET /insurance/providers/:param` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/lost-pet/lost-pet.controller.ts` | 1 | `POST /pets/:param/lost-incidents/:param/identity-card` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/member-trust/member-trust.controller.ts` | 4 | `GET /me/moderation-decisions`؛ `POST /me/moderation-decisions/:param/appeal`؛ `GET /me/appeals` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/memories/memory.controller.ts` | 1 | `GET /pets/:param/memories` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/notifications/notification-dev.controller.ts` | 3 | `POST /dev/notifications/simulate`؛ `POST /dev/notifications/deliveries/:param/force-attempt`؛ `POST /dev/notifications/deliveries/process-due` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/notifications/notification-preference.controller.ts` | 2 | `GET /notification-preferences/digest`؛ `PUT /notification-preferences/digest` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/notifications/notifications.controller.ts` | 3 | `GET /notifications/grouped`؛ `POST /notifications/read`؛ `POST /notifications/groups/read` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/partner-verification/partner-verification.controllers.ts` | 10 | `GET /provider/verification`؛ `POST /provider/verification/uploads`؛ `POST /provider/verification/documents` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/pet-safety/pet-safety.controller.ts` | 15 | `GET /pets/:param/completeness`؛ `GET /pets/:param/emergency-info`؛ `PUT /pets/:param/emergency-info` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/place-suggestions/place-suggestions.controller.ts` | 6 | `POST /place-suggestions`؛ `POST /place-suggestions/changes`؛ `GET /place-suggestions/mine` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/platform-settings/platform-settings.controller.ts` | 0 | `GET /settings/public` | مصرف اعلان اعضا در PR #31؛ GET زنده فقط اعلان را برگرداند |
| `modules/privacy-governance/privacy-governance.controller.ts` | 3 | `GET /admin/privacy/deletion-requests`؛ `POST /admin/privacy/deletion-requests/:param/transition`؛ `GET /admin/release-gate` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/provider-os/provider-bookings.controller.ts` | 2 | `GET /provider/bookings/:param/ride`؛ `POST /provider/bookings/:param/ride-events` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/provider-os/provider-catalog.controller.ts` | 1 | `POST /provider/waitlist/:param/offer` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/providers/providers.controller.ts` | 3 | `GET /providers/vets`؛ `GET /providers/vets/:param`؛ `GET /providers/vets/:param/availability` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/seller-os/seller-context.controller.ts` | 1 | `GET /seller-organizations` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/seller-os/seller-offer.controller.ts` | 1 | `GET /seller-organizations/:param/offers/:param` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/seller-os/seller-promotion.controller.ts` | 1 | `GET /seller-organizations/:param/promotions/:param` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/service-intake/service-intake.controller.ts` | 13 | `GET /provider-services/:param/intake-form`؛ `GET /bookings/:param/attachments`؛ `POST /bookings/:param/attachments/upload-url` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/services/services.controller.ts` | 2 | `GET /services/categories`؛ `GET /providers/services` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/storage/downloads.controller.ts` | 1 | `GET /downloads/:param` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/storage/uploads.controller.ts` | 1 | `PUT /uploads/:param` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/subscriptions/subscription.controller.ts` | 2 | `GET /households/:param/subscription/summary`؛ `GET /households/:param/subscription/downgrade-preview` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/travel-external/travel-external.controllers.ts` | 4 | `GET /travel/external/stays/:param/out`؛ `POST /admin/travel/external/sources/:param/probe`؛ `POST /admin/travel/external/matches/:param/approve` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/travel-marketplace/travel-provider.controller.ts` | 1 | `POST /provider/travel/listings/:param/archive` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/travel/travel.controller.ts` | 1 | `GET /pets/:param/trips/:param/requirements` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/travel/trip-extras.controller.ts` | 13 | `GET /pets/:param/trips/:param/preparation`؛ `POST /pets/:param/trips/:param/reminder-proposals/apply`؛ `GET /pets/:param/trips/:param/checklist` | باز؛ بررسی دستی و تست قابلیت لازم است |
| `modules/vet-panel/vet-panel.controller.ts` | 9 | `PATCH /provider/clinical/note-templates/:param`؛ `GET /provider/clinical/patients/:param/vitals/trends`؛ `GET /provider/clinical/patients/:param/problems` | باز؛ بررسی دستی و تست قابلیت لازم است |

جزئیات endpoint، کنترلر، محل منبع و مصرف‌کننده در `apps/web/design-review/approved-rollout/backend-ui-coverage.json` و مسیرهای app در `ui-coverage-audit.json` ثبت شده‌اند. وضعیت تصویری مسیرها در `route-design-status.json` است؛ اعمال پوستهٔ مشترک جای بررسی تک‌تک آن‌ها را نمی‌گیرد.

## موارد واقعی نیازمند ادامه

- رسانهٔ دستهٔ محصول: API نوشتن دسته و قرارداد image/alt هنوز باید با کد فعلی تطبیق و در صورت نبود، با مجوز رسانه و migration افزودنی طراحی شود.
- شروع چت از مقاله/مطلب: resolve مقصد بر اساس شناسهٔ محتوا باید سمت سرور باشد؛ authorUserId خصوصی عمومی نشود.
- null/undefined در سایر PATCHها: فقط فیلدهای قابل پاک‌شدن با بررسی مدل و تست تغییر کنند؛ این PR معنای تمام PATCHهای مخزن را تغییر نمی‌دهد.
- تنظیمات ادمین در PR #31 پیگیری شده است؛ ابزارهای همکاران، عملیات تخصصی بالینی و باقی گروه‌های جدول همچنان باز هستند. مستند قدیمیِ «clinic plans باز است» با وجود ClinicPlans.tsx و تست‌های فعلی باید اصلاح شود؛ وجود فایل به‌تنهایی تکمیل همهٔ طرح/تخصیص‌ها را ثابت نمی‌کند.
- کوپن، نمودار رشد و trending قرارداد معتبر/تصمیم محصول می‌خواهند؛ افزودن ادعای ساختگی برای تطبیق تصویر مجاز نیست.
