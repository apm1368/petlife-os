# معماری Clinic OS (پنل کلینیک دامپزشکی)

## ۱. اصل طراحی
Clinic OS یک محصول جدا نیست؛ لایه‌ی B2B روی زیرساخت‌های موجود است:

| قابلیت | منبع حقیقت | وضعیت |
|---|---|---|
| هویت کلینیک، اعضا و نقش‌ها (OWNER / VET / STAFF) | `ProviderOrganization`, `ProviderUser` (Provider OS) | موجود |
| نوبت‌دهی | `Booking` + `/provider/bookings/*` (قبول، رد، پذیرش، شروع، اتمام، غیبت) | موجود، بازاستفاده |
| پرونده‌ی پزشکی | vet-panel: `/provider/clinical/*` (علائم حیاتی، مشکلات، نسخه، بستری، برآورد، خلاصه‌ی ترخیص، هشدار) | موجود، بازاستفاده |
| دسترسی به داده‌ی پت | `PetAccessGrant` + `PetAccessGuard` | موجود؛ Clinic OS هیچ‌وقت آن را دور نمی‌زند |
| اشتراک کلینیک | `ClinicPlan`, `ClinicPlanEntitlement`, `ClinicPlanPrice`, `ClinicSubscription`, `ClinicSubscriptionChange` | **جدید** |
| فهرست مشتریان | `/provider/clinic/customers` (کوئری روی Booking/ClinicalVisit) | **جدید** |
| یادآور و پیام به صاحب پت | `ClinicReminder` + NotificationOrchestrator | **جدید** |
| گزارش مالی | `/provider/clinic/reports/finance` (Booking + PaymentIntent + LedgerEntry) | **جدید** |

## ۲. جدایی کامل از اشتراک مصرف‌کننده
- جدول‌های اشتراک کلینیک کاملاً جدا هستند. یک خانوار هرگز پلن کلینیک نمی‌بیند یا نمی‌خرد، و یک کلینیک هرگز به پلن خانوار resolve نمی‌شود (این در تست بررسی شده است).
- هر سازمان یک ردیف `ClinicSubscription` دارد که به‌صورت lazy روی پلن پیش‌فرض (`CLINIC_BASIC`) ساخته می‌شود.
- اگر وضعیت CANCELLED/EXPIRED شود یا `currentPeriodEndsAt` بگذرد، کلینیک به entitlementهای پلن پیش‌فرض برمی‌گردد.
- بررسی‌ها فقط روی ردیف‌های entitlement انجام می‌شود و هیچ کدی `plan.code` را مقایسه نمی‌کند.

### Entitlementهای پیشنهادی (قابل تغییر از دیتابیس)
| کلید | BASIC | GROWTH | PRO |
|---|---|---|---|
| `clinic.patients` / `clinic.appointments` / `clinic.medical_records` / `clinic.customers` | ✔ | ✔ | ✔ |
| `clinic.reminders` (یادآور و پیام به صاحبان) | ✘ | ✔ | ✔ |
| `clinic.reminders.monthly.max` | — | ۳۰۰ | نامحدود |
| `clinic.finance.reports` | ✘ | ✔ | ✔ |
| `clinic.staff.max` (همهٔ اعضا، شامل مدیر) | ۳ | ۱۰ | نامحدود |
| `clinic.branches.max` | ۱ | ۳ | نامحدود |

- امکانات موجود (نوبت، پرونده‌ی پزشکی، فهرست بیماران) در همه‌ی پلن‌ها باز است. هیچ paywall جدیدی روی قابلیت‌های فعلی گذاشته نشده است.
- سقف کارکنان و شعبه (مصوب مالک، ۱۴۰۵/۰۷/۱۳) سمت سرور اعمال می‌شود. شمارش و ثبت زیر قفل ردیف سازمان انجام می‌شود، پس دو درخواست هم‌زمان نمی‌توانند هر دو آخرین جای خالی را بگیرند. اعضا یا شعبه‌های موجودِ بیش از سقف حذف نمی‌شوند؛ فقط افزودن جدید متوقف می‌شود.

### قیمت‌گذاری و پرداخت
- **وضعیت قیمت: `PRODUCT_DECISION_LATER`.** هیچ قیمتی seed نشده است. `prices: []` یعنی UI باید بگوید «قیمت اعلام نشده» و هرگز قیمت نسازد.
- تا وقتی درگاه واقعی وصل نشده، تنها راه رفتن به GROWTH/PRO تخصیص توسط ادمین است:
  - `POST /admin/clinic-subscriptions/:organizationId/assign`، با مجوز `subscription.manage`؛
  - دلیل اجباری؛
  - ثبت در audit log در همان تراکنش؛
  - ثبت تاریخچه در `ClinicSubscriptionChange`.

## ۳. فهرست مشتریان
- «مشتری» یعنی خانواری که این کلینیک دست‌کم یک بار برای یکی از پت‌هایش نوبت ثبت کرده یا ویزیت بالینی داشته است.
- خروجی فقط شامل این موارد است:
  - نام نمایشی صاحب پت؛
  - پت‌هایی که همین کلینیک دیده؛
  - تعداد ویزیت تکمیل‌شده؛
  - آخرین ویزیت و نوبت بعدی؛
  - تاریخچه‌ی نوبت‌ها با همین کلینیک.
- **تلفن، ایمیل و داده‌ی سلامت برنمی‌گردد.** پرونده‌ی پزشکی همچنان فقط از مسیر PetAccessGuard باز می‌شود.
- خانوار کلینیک دیگر و خانوار ناموجود هر دو پاسخ یکسان 404 می‌گیرند، تا وجود یا عدم وجود خانوار لو نرود.

## ۴. یادآور و پیام به صاحب پت
- فقط برای پت‌هایی که بیمار همین کلینیک هستند.
- انواع: VACCINATION / CHECKUP / MEDICATION / FOLLOW_UP / MESSAGE (پیام فوری).
- **زمان‌بندی:** اگر `dueAt` خالی باشد، پیام همان لحظه ارسال می‌شود. در غیر این صورت worker هر دقیقه یادآورهای سررسیده را می‌فرستد.
- **ارسال دقیقاً یک‌بار:** claim اتمیک (SCHEDULED→SENT) به‌همراه شناسه‌ی رویداد قطعی به ازای هر گیرنده.
- **گیرندگان:** همه‌ی OWNERهای خانوار. اگر خانوار OWNER نداشته باشد، وضعیت FAILED می‌شود.
- **کانال‌ها:** فقط NotificationOrchestrator. اعلان درون‌برنامه همیشه ارسال می‌شود؛ SMS/ایمیل فقط وقتی MessagingGateway ارائه‌دهنده‌ی واقعی داشته باشد و ترجیحات کاربر اجازه بدهد. **هیچ SMS جعلی‌ای ثبت نمی‌شود** (SMS فراز = BLOCKED_EXTERNAL).
- **دسته و لینک:** دسته‌ی اعلان HEALTH است، بنابراین کاربر با تنظیمات اعلان می‌تواند خاموشش کند. deep link: `/pets/:petId`.
- لغو فقط در وضعیت SCHEDULED ممکن است.
- سقف ماهانه از entitlement با کلید LIMIT خوانده می‌شود.

## ۵. گزارش مالی (فقط OWNER کلینیک)
همه‌ی اعداد از کوئری واقعی می‌آیند و هیچ تخمینی در کار نیست:
- `billedAmount`: جمع (قیمت snapshot منهای تخفیف) نوبت‌های COMPLETED.
- `payAtClinic`: بخشی از آن که در خود کلینیک پرداخت شده (PAY_AT_PROVIDER).
- `collectedOnline`: PaymentIntentهای CAPTURED متصل به نوبت‌های این بازه.
- `ledgerPosted`: بدهکاری‌های CASH_GATEWAY_RECEIVABLE که ledger برای همان checkoutها ثبت کرده. اگر با `collectedOnline` نخواند، اختلاف دیده می‌شود.
- شمارش وضعیت‌ها (تکمیل، لغو، غیبت، بازپرداخت)، تفکیک بر اساس خدمت و سری روزانه.
- بازه حداکثر ۳۶۶ روز است و پیش‌فرض ۳۰ روز اخیر.
- **تسویه با کلینیک وجود ندارد:** `SELLER_PAYABLE` هنوز placeholder است و تصمیم مالی/حقوقی مالک را لازم دارد. برای همین «مانده‌ی بدهی به کلینیک» گزارش نمی‌شود.

## ۶. امنیت
- همه‌ی مسیرهای `/provider/clinic/*` پشت `SessionAuthGuard` و `ProviderAuthGuard` هستند و سازمان از عضویت فعال کاربر resolve می‌شود، نه از ورودی.
- گزارش مالی فقط برای OWNER است؛ VET و STAFF خطای `PROVIDER_ACCESS_DENIED` می‌گیرند.
- ماتریس امنیت بین‌دامنه‌ای (`final-cross-domain-security.e2e-spec.ts`) مسیرهای جدید را هم پوشش می‌دهد.

## ۷. موارد مسدود / نیازمند تصمیم
| مورد | وضعیت |
|---|---|
| قیمت پلن‌های کلینیک | PRODUCT_DECISION_LATER |
| پرداخت آنلاین اشتراک کلینیک | BLOCKED_EXTERNAL (درگاه واقعی) |
| SMS یادآور | BLOCKED_EXTERNAL (فراز) |
| تسویه‌ی درآمد آنلاین با کلینیک | تصمیم مالی/حقوقی |

## ۸. API برای Codex (UI)
| متد | مسیر | توضیح |
|---|---|---|
| GET | `/provider/clinic/plans` | فهرست پلن‌ها شامل entitlements و prices (فعلاً خالی) |
| GET | `/provider/clinic/subscription` | `{status, plan, assignedPlanCode, currentPeriodEndsAt, usage:{remindersThisMonth}}` |
| GET | `/provider/clinic/staff` | `{items:[{providerUserId, displayName, role, displayTitle, joinedAt}], pendingInvitations:[…], usage:{used, pending, limit}}`؛ limit null یعنی نامحدود |
| POST | `/provider/clinic/staff` | فقط OWNER؛ **دعوت** می‌سازد و عضویت مستقیم ایجاد نمی‌کند. بدنه: `{email, role: VET\|STAFF, displayTitle?}`. خروجی: `{invitation, items, pendingInvitations, usage}`. خطاها: ۴۰۴ کاربر ناموجود، ۴۰۹ `CLINIC_STAFF_ALREADY_MEMBER`، ۴۰۹ `CLINIC_INVITATION_CONFLICT` (`ALREADY_PENDING`)، ۴۰۹ سقف |
| POST | `/provider/clinic/staff/invitations/:id/revoke` | فقط OWNER؛ لغو دعوت در انتظار |
| DELETE | `/provider/clinic/staff/:providerUserId` | فقط OWNER؛ حذف نرم عضو VET یا STAFF. مدیر قابل حذف نیست (۴۰۹ `CLINIC_MEMBER_NOT_REMOVABLE`) |
| GET | `/me/clinic-invitations` | دعوت‌های در انتظار خود کاربر |
| POST | `/me/clinic-invitations/:id/accept` · `/decline` | فقط خود دعوت‌شده می‌تواند پاسخ بدهد؛ دعوت دیگران ۴۰۴ می‌دهد. خطای ۴۰۹ با `EXPIRED` یا `NOT_PENDING` |
| GET | `/provider/clinic/branches` | `{items:[{id, name, addressLine, city, region, latitude, longitude, phone, timezone}], usage}` |
| POST | `/provider/clinic/branches` | فقط OWNER: `{name, addressLine, city, region?, latitude?, longitude?, phone?}` |
| DELETE | `/provider/clinic/branches/:locationId` | فقط OWNER. ۴۰۹ `CLINIC_BRANCH_IN_USE` با یکی از دلیل‌های `LAST_BRANCH`، `HAS_BOOKINGS` یا `HAS_SERVICES_OR_SCHEDULE` |
| GET | `/provider/clinic/customers?q&page&pageSize` | `{items:[{householdId, ownerDisplayName, pets[], completedVisitCount, lastVisitAt, nextAppointment}], total}` |
| GET | `/provider/clinic/customers/:householdId` | همان، به‌علاوه‌ی `bookings[]` و `reminders[]` |
| GET | `/provider/clinic/reminders?status&petId&page` | فهرست یادآورها |
| POST | `/provider/clinic/reminders` | `{petId, kind, title(≤120), note?(≤1000), dueAt?}` و اگر `dueAt` نباشد، ارسال فوری |
| POST | `/provider/clinic/reminders/:id/cancel` | لغو یادآور SCHEDULED |
| GET | `/provider/clinic/reports/finance?from&to` | گزارش مالی (فقط OWNER) |
| GET | `/admin/clinic-subscriptions/plans` | `subscription.view` |
| GET | `/admin/clinic-subscriptions/:organizationId` | وضعیت فعلی به‌علاوه‌ی history (`subscription.view`) |
| POST | `/admin/clinic-subscriptions/:organizationId/assign` | `{planCode, reason, periodEndsAt?}` (`subscription.manage`) |

**خطاهایی که UI باید مدیریت کند:**
- `SUBSCRIPTION_FEATURE_NOT_INCLUDED` (409، `details.context = "CLINIC"`): قابلیت در پلن فعلی نیست؛ به پلن‌های بالاتر ارجاع بده.
- `SUBSCRIPTION_ENTITLEMENT_LIMIT_EXCEEDED` (409): سقف ماهانه پر شده.
- `PROVIDER_ACCESS_DENIED` (403): نقش کاربر کافی نیست.
- 404: مشتری یا پت در فهرست این کلینیک نیست.

**مبالغ:** رشته‌ی دسیمال به ریال (IRR) هستند و تبدیل به تومان فقط در لایه‌ی نمایش انجام می‌شود.

## ۹. عضویت: دعوت، پذیرش و حذف
- **دعوت:** مدیر کلینیک یک حساب موجود را دعوت می‌کند و دعوت در وضعیت PENDING می‌ماند. عضویت فقط وقتی ساخته می‌شود که خود دعوت‌شده آن را بپذیرد.
- **انقضا و ظرفیت:** هر دعوت ۷ روز اعتبار دارد. دعوت در انتظار یک جای خالی از سقف `clinic.staff.max` را رزرو می‌کند.
- **حذف عضو** نرم است: ردیف عضو می‌ماند (چون سوابق بالینی به آن ارجاع دارند)، اما `removedAt` تمام دسترسی را قطع می‌کند و همهٔ ۱۹ نقطه‌ای که عضویت خوانده می‌شود این فیلتر را دارند. همراه حذف:
  - دسترسی‌هایی که این شخص از رزروهای همین کلینیک گرفته بود باطل می‌شود؛
  - نوبت‌های باز او بدون پزشک می‌مانند تا کلینیک دوباره تخصیص دهد؛
  - نوبت‌های گذشته نویسندهٔ خود را حفظ می‌کنند.
- **بازگشت عضو:** دعوت دوباره و پذیرش آن، همان ردیف قبلی را دوباره فعال می‌کند.
- **حذف شعبه** فقط وقتی ممکن است که شعبه آخرین شعبه نباشد، هیچ نوبتی در آن ثبت نشده باشد، و هیچ خدمت، منبع یا برنامهٔ زمانی‌ای به آن وصل نباشد.
- **ردگیری:** همهٔ این رویدادها به‌صورت domain event ثبت می‌شوند: ClinicStaffInvited، ClinicInvitationAccepted، ClinicInvitationDeclined، ClinicInvitationRevoked، ClinicStaffRemoved، ClinicBranchRemoved.

## ۱۰. تسویهٔ درآمد آنلاین کلینیک — `PRODUCT_DECISION_REQUIRED`
**وضع موجود:**
- پرداخت آنلاین نوبت فقط دو حساب را در دفتر کل اصلی ثبت می‌کند: `CASH_GATEWAY_RECEIVABLE` (بدهکار) و `CUSTOMER_PAYMENT_CLEARING` (بستانکار).
- هیچ حساب مالی‌ای برای ارائه‌دهنده (کلینیک) وجود ندارد.
- `SELLER_PAYABLE` و `PLATFORM_REVENUE` برای پرداخت‌های نوبت هرگز ثبت نمی‌شوند.
- ابزارهای تسویه (قانون کمیسیون، دفتر فروشنده، دورهٔ تسویه، پرداخت دستی) فقط برای فروشندگان فروشگاه ساخته شده‌اند و به کلینیک وصل نیستند.

**تصمیم‌هایی که لازم است** (هیچ‌کدام حدس زده نمی‌شود):
1. نرخ یا مدل کمیسیون پلتفرم روی نوبت‌ها: درصدی، ثابت، یا وابسته به پلن کلینیک؟
2. دورهٔ تسویه (هفتگی یا ماهانه) و حداقل مبلغ تسویه.
3. رفتار بازپرداختی که بعد از تسویه رخ می‌دهد (کسر از تسویهٔ بعدی؟).
4. پیش‌پرداخت (deposit) و جریمهٔ لغو دیرهنگام: سهم کلینیک چقدر است؟
5. اطلاعات حساب بانکی یا شبای کلینیک و روش احراز آن.
6. مالیات و صورتحساب رسمی.

**پس از تصمیم:** می‌توان الگوی تسویهٔ فروشندگان (`SellerFinancialAccount`، `CommissionRule`، `SellerSettlement`) را برای ارائه‌دهندگان تکرار کرد. پیش از آن، گزارش مالی کلینیک فقط «جمع‌آوری‌شده» و «ثبت‌شده در دفتر» را نشان می‌دهد و هیچ «مانده‌ی قابل پرداخت» گزارش نمی‌کند.
