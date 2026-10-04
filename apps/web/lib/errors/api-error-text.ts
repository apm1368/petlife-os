import { ApiError } from "@/lib/api/client";

/**
 * What to tell a person when an API call fails. The API's own message is English (it is written for
 * people, so English pages keep it); Persian pages get the Persian sentence for that error code, or
 * a code-family rule, or the caller's own fallback — never an English sentence on a Persian page.
 */
const FA: Record<string, string> = {
  ACCESS_EXPIRED: "این دسترسی به پایان رسیده است.",
  ACCOUNT_LINKING_CONFLICT: "این حساب قبلاً به روش ورود دیگری متصل شده است.",
  ADDRESS_REQUIRED: "برای رزرو این خدمت، ابتدا نشانی را وارد کنید.",
  ALREADY_HOUSEHOLD_MEMBER: "این فرد از قبل عضو خانوادهٔ شماست.",
  AVAILABILITY_CONFLICT: "این تغییر با نوبت‌های قطعی‌شده تداخل دارد.",
  BOOKING_CONFLICT: "این زمان همین حالا توسط فرد دیگری رزرو شد. زمان دیگری انتخاب کنید.",
  BOOKING_NOT_CANCELLABLE: "این نوبت دیگر قابل لغو نیست.",
  CART_EMPTY: "سبد خرید شما خالی است.",
  CHECKOUT_EXPIRED: "مهلت این پرداخت تمام شده است. دوباره شروع کنید.",
  CLINICAL_RECORDING_NOT_AUTHORIZED: "اجازهٔ ثبت اطلاعات بالینی برای این حیوان را ندارید.",
  COMMUNITY_CONTENT_NOT_VISIBLE: "این مطلب دیگر نمایش داده نمی‌شود.",
  COMPATIBILITY_REVIEW_REQUIRED: "پیش از خرید برای این حیوان، این کالا را بررسی و تأیید کنید.",
  CONSENT_REQUIRED: "پذیرش این توافق برای استفاده از پت‌لایف لازم است. برای توقف، حذف حساب را درخواست کنید.",
  CONTACT_UNAVAILABLE: "از این ایمیل یا شماره نمی‌توان برای حساب شما استفاده کرد.",
  CONTACT_UNCHANGED: "این همان راه ارتباطی تأییدشدهٔ فعلی شماست.",
  CURRENT_PASSWORD_INCORRECT: "رمز فعلی درست نیست.",
  DELETION_BLOCKED: "پیش از حذف حساب، چند مورد باید تعیین تکلیف شود.",
  DOCUMENT_TOO_LARGE: "حجم این فایل بیش از حد مجاز برای سند پزشکی است.",
  DONATION_AMOUNT_INVALID: "مبلغ کمک باید عددی مثبت و بدون اعشار باشد.",
  DUPLICATE_HELP_OFFER: "برای این نیاز، پیشنهاد باز دیگری دارید.",
  DUPLICATE_REPORT: "قبلاً این مورد را گزارش کرده‌اید و در حال بررسی است.",
  EXPORT_LIMIT_REACHED: "امروز چند بار خروجی گرفته‌اید. فردا دوباره امتحان کنید.",
  FINANCING_DECLINED: "سرویس اقساط این درخواست را نپذیرفت.",
  FINANCING_EXPIRED: "مهلت این درخواست اقساط تمام شده است.",
  FINANCING_NOT_AVAILABLE: "پرداخت اقساطی برای این مبلغ یا ارائه‌دهنده در دسترس نیست.",
  FINANCING_NOT_ELIGIBLE: "این خرید شرایط پرداخت اقساطی را ندارد.",
  GOOGLE_AUTH_DISABLED: "ورود با گوگل فعلاً در دسترس نیست.",
  GOOGLE_AUTH_FAILED: "ورود با گوگل کامل نشد. دوباره تلاش کنید.",
  HOLD_EXPIRED: "مهلت نگه‌داشتن این زمان تمام شد. دوباره زمان را انتخاب کنید.",
  HOUSEHOLD_ACCESS_DENIED: "به این خانواده دسترسی ندارید.",
  INSUFFICIENT_INVENTORY: "برای این تعداد، موجودی کافی نیست.",
  INVALID_CREDENTIALS: "نام کاربری یا رمز عبور درست نیست.",
  INVALID_PHONE_NUMBER: "این شمارهٔ موبایل معتبر نیست.",
  INVALID_TRAVEL_DATE_RANGE: "این تاریخ‌ها معتبر نیستند.",
  INVALID_UPLOAD_KEY: "این فایل برای همین مورد بارگذاری نشده است. دوباره بارگذاری کنید.",
  INVALID_VITALS_VALUE: "این مقدار خارج از بازه‌ای است که این فیلد ثبت می‌کند.",
  INVENTORY_CHANGED_AFTER_PAYMENT: "موجودی پس از پرداخت تغییر کرد و سفارش به‌طور خودکار تأیید نشد. پشتیبانی پیگیری می‌کند.",
  INVENTORY_MOVEMENT_INVALID: "این تغییر، موجودی را منفی می‌کند.",
  INVITATION_ALREADY_USED: "به این دعوت قبلاً پاسخ داده شده است.",
  INVITATION_EXPIRED: "این دعوت منقضی شده است. دعوت تازه بخواهید.",
  INVITATION_NOT_FOR_YOU: "این دعوت برای ایمیل یا شمارهٔ دیگری فرستاده شده است.",
  INVITATION_REVOKED: "خانواده این دعوت را لغو کرده است.",
  LAST_HOUSEHOLD_OWNER: "هر خانواده باید دست‌کم یک مدیر داشته باشد. ابتدا عضو دیگری را مدیر کنید.",
  LOST_PET_INCIDENT_ALREADY_OPEN: "برای این حیوان، گزارش گم‌شدن باز دیگری وجود دارد.",
  OFFER_NOT_AVAILABLE: "این پیشنهاد فروش فعلاً در دسترس نیست.",
  ORDER_NOT_CANCELLABLE: "این سفارش دیگر قابل لغو نیست؛ به پیک تحویل داده شده است.",
  OTP_INVALID: "کد واردشده درست نیست یا منقضی شده است.",
  OTP_RATE_LIMITED: "تلاش‌ها بیش از حد بود. کمی بعد دوباره امتحان کنید.",
  AUTH_RATE_LIMITED: "تلاش‌های ورود بیش از حد بود. چند دقیقهٔ دیگر دوباره امتحان کنید.",
  PASSWORD_RESET_TOKEN_INVALID: "این پیوند تغییر رمز معتبر نیست یا منقضی شده است.",
  PAYMENT_ALREADY_COMPLETED: "این پرداخت قبلاً انجام شده است.",
  PAYMENT_AUTHORIZATION_FAILED: "درگاه پرداخت این تراکنش را تأیید نکرد.",
  PAYMENT_FAILED: "پرداخت انجام نشد.",
  PAYMENT_IN_PROGRESS: "این پرداخت در حال انجام است.",
  PAYMENT_ORDER_CONFIRMATION_ISSUE: "پرداخت انجام شد اما سفارش به‌طور خودکار تأیید نشد. پشتیبانی پیگیری می‌کند.",
  PAYMENT_PENDING: "پرداخت هنوز در حال تأیید است.",
  PAYMENT_PROVIDER_UNAVAILABLE: "این درگاه پرداخت فعلاً در دسترس نیست.",
  PAYMENT_STATE_UNKNOWN: "وضعیت پرداخت هنوز مشخص نیست.",
  PET_ACCESS_DENIED: "به این حیوان دسترسی ندارید.",
  PET_CONTEXT_INCOMPLETE: "برای رزرو این خدمت، اطلاعات بیشتری از حیوان لازم است.",
  PET_NOT_SUPPORTED: "این ارائه‌دهنده این خدمت را برای این گونه ارائه نمی‌دهد.",
  PRICE_CHANGED: "قیمت این کالا از زمان افزودن به سبد تغییر کرده است.",
  PRODUCT_NOT_AVAILABLE: "این کالا فعلاً در دسترس نیست.",
  PROVIDER_ACCESS_DENIED: "به این بخش از پنل ارائه‌دهنده دسترسی ندارید.",
  PROVIDER_NOT_VERIFIED: "این ارائه‌دهنده هنوز تأیید نشده است.",
  PROVIDER_RECORD_NOT_OWNER_EDITABLE: "این مورد را ارائه‌دهنده ثبت کرده و مستقیماً قابل ویرایش نیست؛ درخواست اصلاح ثبت کنید.",
  REAUTHENTICATION_REQUIRED: "برای ادامه، با رمز عبور یا کد ارسالی هویت خود را تأیید کنید.",
  REFUND_FAILED: "بازپرداخت انجام نشد.",
  REFUND_NOT_SUPPORTED: "این بازپرداخت از سوی درگاه پشتیبانی نمی‌شود.",
  REFUND_REQUEST_NOT_ALLOWED: "درخواست بازپرداخت برای این سفارش فعلاً ممکن نیست.",
  REPORT_LIMIT_REACHED: "امروز گزارش‌های زیادی فرستاده‌اید. فردا دوباره امتحان کنید.",
  SAFETY_CONFLICT: "این کالا ممکن است برای این حیوان مناسب نباشد. پیش از ادامه بررسی کنید.",
  SELLER_ACCESS_DENIED: "به این فروشگاه دسترسی ندارید.",
  SELLER_LAST_OWNER: "هر فروشگاه باید دست‌کم یک مالک فعال داشته باشد.",
  SELLER_NOT_AVAILABLE: "این فروشنده فعلاً فعال نیست.",
  SERVICE_HAS_FUTURE_BOOKINGS: "تا وقتی نوبت آینده برای این خدمت وجود دارد، این تغییر ممکن نیست.",
  SERVICE_NOT_AVAILABLE: "این خدمت فعلاً در دسترس نیست.",
  SHIPMENT_CANCEL_NOT_ALLOWED: "این ارسال دیگر قابل لغو نیست.",
  SHIPMENT_CREATION_FAILED: "سرویس ارسال نتوانست این مرسوله را ثبت کند.",
  SHIPPING_PROVIDER_UNAVAILABLE: "این سرویس ارسال فعلاً در دسترس نیست.",
  SHIPPING_QUOTE_ALREADY_SELECTED: "روش ارسال دیگری قبلاً انتخاب و قطعی شده است.",
  SHIPPING_QUOTE_EXPIRED: "اعتبار این هزینهٔ ارسال تمام شده است. دوباره انتخاب کنید.",
  SLOT_UNAVAILABLE: "این زمان دیگر آزاد نیست. زمان دیگری انتخاب کنید.",
  SUBSCRIPTION_ALREADY_CANCELLED: "عضویت در وضعیت فعلی قابل لغو یا ادامه نیست.",
  SUBSCRIPTION_ENTITLEMENT_LIMIT_EXCEEDED: "این کار از سقف طرح فعلی شما بیشتر است.",
  SUBSCRIPTION_PLAN_NOT_AVAILABLE: "این طرح فعلاً برای عضویت در دسترس نیست.",
  SUBSCRIPTION_TRIAL_NOT_ELIGIBLE: "این خانواده شرایط دورهٔ آزمایشی این طرح را ندارد.",
  SUBSCRIPTION_FEATURE_NOT_INCLUDED: "این امکان در طرح فعلی شما نیست.",
  SUPPORT_CAMPAIGN_NOT_ACCEPTING_DONATIONS: "این کمپین فعلاً کمک نمی‌پذیرد.",
  SUPPORT_CASE_INVALID_REFERENCE: "این مورد به درخواست پشتیبانی شما متصل نشد.",
  SUPPORT_NEED_DEADLINE_INVALID: "مهلت باید در آینده و حداکثر ۱۸۰ روز بعد باشد.",
  SUPPORT_NEED_LISTING_ACCESS_DENIED: "به این آگهی دسترسی ندارید.",
  SUPPORT_NEED_LISTING_NOT_EDITABLE: "این آگهی دیگر قابل ویرایش نیست.",
  TRAVEL_BOOKING_ACCESS_DENIED: "به این رزرو دسترسی ندارید.",
  TRAVEL_DATES_UNAVAILABLE: "این تاریخ‌ها دیگر آزاد نیستند.",
  TRAVEL_DOCUMENT_SHARE_NOT_ALLOWED: "اسناد فقط برای رزرو فعال قابل اشتراک‌اند.",
  TRAVEL_HOLD_EXPIRED: "مهلت نگه‌داشتن این تاریخ‌ها تمام شد. دوباره انتخاب کنید.",
  TRAVEL_LISTING_ACCESS_DENIED: "مدیریت این اقامتگاه با شما نیست.",
  TRAVEL_MODIFICATION_NOT_ALLOWED: "رزروهای غیرقابل‌استرداد قابل تغییر نیستند.",
  TRAVEL_MODIFICATION_REQUIRES_REBOOKING: "اقامت جدید مبلغ را تغییر می‌دهد. طبق شرایط رزرو لغو کنید و دوباره رزرو کنید.",
  TRAVEL_PAYMENT_WINDOW_EXPIRED: "مهلت پرداخت این رزرو تمام شده است.",
  TRAVEL_PET_POLICY_VIOLATION: "قوانین حیوانات این اقامتگاه اجازهٔ این رزرو را نمی‌دهد.",
  TRAVEL_REQUEST_EXPIRED: "این درخواست منقضی شده است.",
  TRAVEL_REQUIREMENT_DOCUMENT_MISMATCH: "این سند متعلق به حیوانِ این سفر نیست.",
  TRAVEL_REVIEW_NOT_ALLOWED: "فقط اقامت‌های تمام‌شده را می‌توان یک‌بار نقد کرد.",
  UNAUTHENTICATED: "برای این کار وارد حساب شوید.",
  UNSUPPORTED_DOCUMENT_TYPE: "این نوع فایل برای سند پزشکی پشتیبانی نمی‌شود.",
  USERNAME_TAKEN: "این نام کاربری قبلاً گرفته شده است.",
  VALIDATION_ERROR: "اطلاعات واردشده کامل یا درست نیست. موارد را بررسی کنید.",
  WEAK_PASSWORD: "رمز عبور باید دست‌کم ۸ نویسه باشد.",
  PAYLOAD_TOO_LARGE: "حجم فایل یا اطلاعات بیش از حد مجاز است.",
  RATE_LIMITED: "درخواست‌ها بیش از حد بود. کمی بعد دوباره امتحان کنید.",
  FORBIDDEN: "اجازهٔ این کار را ندارید.",
  NOT_FOUND: "این مورد پیدا نشد.",
};

function familyRule(code: string): string | null {
  if (code.endsWith("_NOT_FOUND")) return "این مورد پیدا نشد؛ ممکن است حذف شده باشد.";
  if (code.startsWith("INVALID_") && code.endsWith("_TRANSITION")) return "این کار در وضعیت فعلی ممکن نیست.";
  if (code.endsWith("_ACCESS_DENIED")) return "اجازهٔ این کار را ندارید.";
  return null;
}

const GENERIC = { fa: "انجام نشد. دوباره تلاش کنید.", en: "That didn't work. Please try again." };

/**
 * The sentence to show for a failed call: localized by error code in fa, the API's own words in en.
 * Without a locale it reads the page language (only ever called from client-side error handlers).
 */
export function apiErrorText(err: unknown, locale?: string, fallback?: string): string {
  const fa = (locale ?? (typeof document === "undefined" ? "" : document.documentElement.lang)) === "fa";
  if (err instanceof ApiError) {
    if (!fa) return err.message || fallback || GENERIC.en;
    return FA[err.code] ?? familyRule(err.code) ?? fallback ?? GENERIC.fa;
  }
  return fallback ?? (fa ? GENERIC.fa : GENERIC.en);
}
