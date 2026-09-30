import type { Locale } from "@petlife/types";

/**
 * Code-defined notification copy — deliberately NOT the `NotificationTemplate`
 * table the spec marks "Potential". Every other piece of transactional copy
 * in this codebase already lives in source (next-intl's fa.json/en.json),
 * never a database; this mirrors that convention for backend-authored copy
 * (SMS has no frontend to render it, so the backend must own real localized
 * text at send time, not just a status code). `NotificationTemplate` stays
 * in the schema for a future content-managed system — a resolver swap, not
 * a schema change, would be needed to switch to it.
 *
 * Resolution order (spec: "fallback behavior must be explicit... do not
 * silently return broken template content"): exact `locale` → "en" → throw.
 * This project only has two locales (fa/en, no regional variants), so the
 * "fa-IR → fa → default" chain the spec describes collapses to one fallback
 * step here.
 *
 * `smsBody` is deliberately separate from `body` wherever health/medical
 * context could otherwise leak into SMS (spec: "SMS should not expose
 * detailed medical information by default") — when omitted, callers must
 * not send this template over SMS at all (NotificationOrchestrator only
 * attempts SMS when `smsBody` is present for the resolved locale).
 */
export interface NotificationTemplateVariant {
  title: string;
  body: string;
  smsBody?: string;
}

type TemplateParams = Record<string, string | number>;

const TEMPLATES: Record<string, Partial<Record<Locale, NotificationTemplateVariant>>> = {
  "booking.confirmed": {
    fa: { title: "نوبت شما تأیید شد", body: "نوبت شما تأیید شد. جزئیات را در اپلیکیشن ببینید.", smsBody: "نوبت شما در پت‌لایف تأیید شد." },
    en: { title: "Your booking is confirmed", body: "Your booking is confirmed. See the app for details.", smsBody: "Your PET LIFE OS booking is confirmed." },
  },
  "booking.cancelled": {
    fa: { title: "نوبت شما لغو شد", body: "نوبت شما لغو شد.", smsBody: "نوبت شما در پت‌لایف لغو شد." },
    en: { title: "Your booking was cancelled", body: "Your booking was cancelled.", smsBody: "Your PET LIFE OS booking was cancelled." },
  },
  "booking.requested": {
    fa: { title: "درخواست نوبت ثبت شد", body: "درخواست شما برای ارائه‌دهنده ارسال شد و تا زمان پاسخ، قطعی نیست.", smsBody: "درخواست نوبت شما در پت‌لایف ثبت شد و منتظر تأیید است." },
    en: { title: "Booking request sent", body: "Your request was sent to the provider. It is not confirmed until they accept.", smsBody: "Your PET LIFE OS booking request is awaiting the provider." },
  },
  "booking.awaitingPayment": {
    fa: { title: "برای قطعی شدن نوبت، پرداخت را کامل کنید", body: "نوبت شما تا پایان مهلت پرداخت نگه داشته می‌شود.", smsBody: "برای قطعی شدن نوبت پت‌لایف، پرداخت را کامل کنید." },
    en: { title: "Complete payment to confirm", body: "Your appointment is held until the payment window ends.", smsBody: "Complete payment to confirm your PET LIFE OS booking." },
  },
  "booking.rejected": {
    fa: { title: "درخواست نوبت پذیرفته نشد", body: "ارائه‌دهنده امکان پذیرش این درخواست را نداشت. می‌توانید زمان دیگری انتخاب کنید.", smsBody: "درخواست نوبت شما در پت‌لایف پذیرفته نشد." },
    en: { title: "Booking request declined", body: "The provider could not accept this request. You can choose another time.", smsBody: "Your PET LIFE OS booking request was declined." },
  },
  "booking.expired": {
    fa: { title: "مهلت نوبت به پایان رسید", body: "این نوبت چون در مهلت تعیین‌شده تأیید یا پرداخت نشد، آزاد شد.", smsBody: "مهلت نوبت شما در پت‌لایف به پایان رسید." },
    en: { title: "Booking expired", body: "This booking was released because it was not accepted or paid in time.", smsBody: "Your PET LIFE OS booking expired." },
  },
  "booking.rescheduled": {
    fa: { title: "زمان نوبت تغییر کرد", body: "نوبت شما به زمان جدید منتقل شد.", smsBody: "زمان نوبت شما در پت‌لایف تغییر کرد." },
    en: { title: "Booking rescheduled", body: "Your appointment moved to its new time.", smsBody: "Your PET LIFE OS booking was rescheduled." },
  },
  "provider.bookingRequest": {
    fa: { title: "درخواست نوبت جدید", body: "یک درخواست نوبت جدید منتظر بررسی شماست.", smsBody: "درخواست نوبت جدیدی در پت‌لایف منتظر بررسی است." },
    en: { title: "New booking request", body: "A new booking request is waiting for your review.", smsBody: "A new PET LIFE OS booking request awaits your review." },
  },
  "provider.bookingCancelled": {
    fa: { title: "نوبت لغو شد", body: "یکی از نوبت‌های شما توسط مشتری لغو شد.", smsBody: "یکی از نوبت‌های شما در پت‌لایف لغو شد." },
    en: { title: "Booking cancelled", body: "A customer cancelled one of your bookings.", smsBody: "A PET LIFE OS booking was cancelled." },
  },
  "waitlist.slotAvailable": {
    fa: { title: "زمانی در لیست انتظار آزاد شد", body: "زمانی که منتظرش بودید آزاد شد. برای رزرو اقدام کنید؛ این زمان برای شما نگه داشته نشده است.", smsBody: "در لیست انتظار پت‌لایف، زمانی آزاد شد." },
    en: { title: "A waitlisted time opened", body: "A time you were waiting for opened up. Book it soon — it is not held for you.", smsBody: "A PET LIFE OS waitlisted time opened." },
  },
  "payment.succeeded": {
    fa: { title: "پرداخت با موفقیت انجام شد", body: "پرداخت شما با موفقیت ثبت شد.", smsBody: "پرداخت شما در پت‌لایف با موفقیت انجام شد." },
    en: { title: "Payment successful", body: "Your payment was completed successfully.", smsBody: "Your PET LIFE OS payment was successful." },
  },
  "payment.failed": {
    fa: { title: "پرداخت ناموفق بود", body: "پرداخت شما انجام نشد. لطفاً دوباره تلاش کنید.", smsBody: "پرداخت شما در پت‌لایف ناموفق بود." },
    en: { title: "Payment unsuccessful", body: "Your payment could not be completed. Please try again.", smsBody: "Your PET LIFE OS payment was unsuccessful." },
  },
  "refund.completed": {
    fa: { title: "بازگشت وجه انجام شد", body: "مبلغ سفارش شما بازگردانده شد.", smsBody: "بازگشت وجه سفارش شما در پت‌لایف انجام شد." },
    en: { title: "Refund completed", body: "Your order's amount has been refunded.", smsBody: "Your PET LIFE OS refund was completed." },
  },
  "order.received": {
    fa: { title: "سفارش جدید دریافت شد", body: "یک سفارش پرداخت‌شده جدید برای آماده‌سازی دارید.", smsBody: "یک سفارش جدید در پت‌لایف برای شما ثبت شد." },
    en: { title: "New order received", body: "You have a new paid order to prepare.", smsBody: "You received a new PET LIFE OS order." },
  },
  "order.cancelled": {
    fa: { title: "سفارش لغو شد", body: "سفارش شما لغو شد و مبلغ آن بازگردانده شد.", smsBody: "سفارش شما در پت‌لایف لغو و مبلغ آن بازگردانده شد." },
    en: { title: "Order cancelled", body: "Your order was cancelled and its amount refunded.", smsBody: "Your PET LIFE OS order was cancelled and refunded." },
  },
  "order.cancelled_by_customer": {
    fa: { title: "مشتری سفارش را لغو کرد", body: "یک سفارش پیش از ارسال توسط مشتری لغو شد. آن را ارسال نکنید.", smsBody: "یک سفارش در پت‌لایف توسط مشتری لغو شد؛ ارسال نکنید." },
    en: { title: "Customer cancelled an order", body: "An order was cancelled by the customer before dispatch. Do not ship it.", smsBody: "A PET LIFE OS order was cancelled by the customer — do not ship it." },
  },
  "refund_request.received": {
    fa: { title: "درخواست بازگشت وجه ثبت شد", body: "مشتری برای یکی از سفارش‌های شما درخواست بازگشت وجه ثبت کرد. تیم پت‌لایف آن را بررسی می‌کند." },
    en: { title: "Refund request opened", body: "A customer opened a refund request on one of your orders. PET LIFE will review it." },
  },
  "refund_request.approved": {
    fa: { title: "درخواست بازگشت وجه تأیید شد", body: "درخواست شما تأیید شد و برای پرداخت به واحد مالی ارسال شد.", smsBody: "درخواست بازگشت وجه شما در پت‌لایف تأیید شد." },
    en: { title: "Refund request approved", body: "Your request was approved and sent to finance for payment.", smsBody: "Your PET LIFE OS refund request was approved." },
  },
  "refund_request.rejected": {
    fa: { title: "درخواست بازگشت وجه رد شد", body: "درخواست بازگشت وجه شما رد شد. دلیل را در جزئیات سفارش ببینید." },
    en: { title: "Refund request declined", body: "Your refund request was declined. See the order for the reason." },
  },
  "repeat_delivery.due": {
    fa: { title: "زمان ارسال دوره‌ای نزدیک است", body: "سفارش دوره‌ای بعدی شما نزدیک است. قیمت و موجودی را بررسی و سفارش را تأیید کنید.", smsBody: "زمان سفارش دوره‌ای شما در پت‌لایف رسیده است؛ برای تأیید وارد شوید." },
    en: { title: "Your repeat delivery is due", body: "Your next repeat delivery is coming up. Check the price and stock, then confirm the order.", smsBody: "Your PET LIFE OS repeat delivery is due — open the app to confirm." },
  },
  "travel.booking_request_received": {
    fa: { title: "درخواست رزرو جدید", body: "یک درخواست رزرو اقامت برای بررسی دارید." },
    en: { title: "New booking request", body: "You have a new stay request to review." },
  },
  "travel.booking_requested": {
    fa: { title: "درخواست رزرو ارسال شد", body: "درخواست شما برای میزبان ارسال شد. پاسخ او را اطلاع می‌دهیم." },
    en: { title: "Booking request sent", body: "Your request was sent to the host. We'll let you know when they answer." },
  },
  "travel.payment_required": {
    fa: { title: "پرداخت رزرو لازم است", body: "برای قطعی شدن رزرو، پرداخت را در مهلت تعیین‌شده انجام دهید." },
    en: { title: "Payment needed", body: "Complete the payment within the window to confirm your stay." },
  },
  "travel.booking_confirmed": {
    fa: { title: "رزرو شما قطعی شد", body: "رزرو اقامت شما تأیید شد. جزئیات و آمادگی سفر را ببینید." },
    en: { title: "Your stay is confirmed", body: "Your stay is confirmed. See the details and trip readiness." },
  },
  "travel.booking_confirmed_provider": {
    fa: { title: "رزرو قطعی شد", body: "یک رزرو اقامت قطعی شد." },
    en: { title: "Booking confirmed", body: "A stay was confirmed." },
  },
  "travel.booking_rejected": {
    fa: { title: "درخواست رزرو پذیرفته نشد", body: "میزبان نتوانست درخواست شما را بپذیرد. تاریخ‌ها آزاد شد." },
    en: { title: "Request declined", body: "The host could not accept your request. The dates were released." },
  },
  "travel.booking_expired": {
    fa: { title: "رزرو منقضی شد", body: "مهلت این رزرو به پایان رسید و تاریخ‌ها آزاد شد." },
    en: { title: "Booking expired", body: "This booking's window ended and the dates were released." },
  },
  "travel.booking_cancelled_by_provider": {
    fa: { title: "میزبان رزرو را لغو کرد", body: "رزرو شما توسط میزبان لغو شد و مبلغ پرداختی کامل بازگردانده می‌شود." },
    en: { title: "Host cancelled your stay", body: "The host cancelled your stay; anything you paid is refunded in full." },
  },
  "travel.booking_cancelled_by_traveler": {
    fa: { title: "مهمان رزرو را لغو کرد", body: "یک رزرو توسط مهمان لغو شد و تاریخ‌ها آزاد شد." },
    en: { title: "Guest cancelled", body: "A guest cancelled a stay; the dates were released." },
  },
  "travel.booking_changed": {
    fa: { title: "تاریخ رزرو تغییر کرد", body: "مهمان تاریخ یک رزرو را تغییر داد." },
    en: { title: "Booking dates changed", body: "A guest changed a booking's dates." },
  },
  "travel.listing_published": {
    fa: { title: "اقامتگاه شما منتشر شد", body: "اقامتگاه شما بررسی و منتشر شد." },
    en: { title: "Listing published", body: "Your listing was reviewed and published." },
  },
  "travel.listing_draft": {
    fa: { title: "اصلاح اقامتگاه لازم است", body: "تیم پت‌لایف درخواست اصلاح داده است. توضیحات را ببینید." },
    en: { title: "Changes requested", body: "PET LIFE asked for changes to your listing. See the note." },
  },
  "travel.listing_suspended": {
    fa: { title: "اقامتگاه شما متوقف شد", body: "اقامتگاه شما از نمایش عمومی خارج شد. توضیحات را ببینید." },
    en: { title: "Listing suspended", body: "Your listing was taken off public view. See the note." },
  },
  "insurance.application_needs_information": {
    fa: { title: "بیمه‌گر اطلاعات بیشتری خواسته است", body: "برای ادامه بررسی درخواست بیمه، اطلاعات خواسته‌شده را تکمیل کنید." },
    en: { title: "The insurer needs more information", body: "Add the requested information so the insurer can continue reviewing your application." },
  },
  "shipment.delivered": {
    fa: { title: "سفارش شما تحویل داده شد", body: "سفارش شما با موفقیت تحویل داده شد.", smsBody: "سفارش شما در پت‌لایف تحویل داده شد." },
    en: { title: "Your order was delivered", body: "Your order was delivered successfully.", smsBody: "Your PET LIFE OS order was delivered." },
  },
  "shipment.failed": {
    fa: { title: "مشکلی در ارسال سفارش پیش آمد", body: "در تحویل سفارش شما مشکلی پیش آمد. جزئیات را در اپلیکیشن ببینید.", smsBody: "در تحویل سفارش شما در پت‌لایف مشکلی پیش آمد." },
    en: { title: "A delivery issue occurred", body: "There was a problem delivering your order. See the app for details.", smsBody: "A delivery issue occurred with your PET LIFE OS order." },
  },
  "marketplace.listing_degraded": {
    fa: { title: "وضعیت یکی از آگهی‌های شما نیاز به بررسی دارد", body: "همگام‌سازی یکی از آگهی‌های شما در بازارگاه ناموفق بود.", smsBody: "یکی از آگهی‌های فروش شما در پت‌لایف نیاز به بررسی دارد." },
    en: { title: "One of your listings needs attention", body: "A sync attempt for one of your marketplace listings failed.", smsBody: "One of your PET LIFE OS marketplace listings needs attention." },
  },
  "marketplace.inventory_mismatch": {
    fa: { title: "ناهماهنگی موجودی شناسایی شد", body: "موجودی گزارش‌شده توسط یک بازارگاه با موجودی پت‌لایف مطابقت ندارد.", smsBody: "ناهماهنگی موجودی در یکی از کانال‌های فروش شما شناسایی شد." },
    en: { title: "Inventory mismatch detected", body: "A marketplace's reported inventory disagrees with PET LIFE OS's own stock.", smsBody: "An inventory mismatch was detected on one of your sales channels." },
  },
  "pet_access.granted": {
    fa: { title: "دسترسی موقت اعطا شد", body: "یک دسترسی موقت برای حیوان خانگی شما اعطا شد.", smsBody: "یک به‌روزرسانی دسترسی برای حیوان خانگی شما در پت‌لایف ثبت شد." },
    en: { title: "Temporary access granted", body: "A temporary access grant was created for your pet.", smsBody: "An access update for your pet is available in PET LIFE OS." },
  },
  /** Representative HEALTH-category template (spec's own worked example) — in-app `body` may name the pet, but `smsBody` never carries a diagnosis, test result, or any other medical detail, by construction rather than by a runtime filter. No domain event drives this one yet this phase (scheduled health/vaccine reminders are explicitly out of H10's scope) — it exists to prove the privacy discipline and is reachable via the dev-simulate endpoint. */
  "health.reminder": {
    fa: { title: "یادآوری مراقبتی", body: "یک یادآوری مراقبتی برای {{petName}} ثبت شد.", smsBody: "یک یادآوری مراقبتی برای {{petName}} دارید." },
    en: { title: "Care reminder", body: "A care reminder for {{petName}} was recorded.", smsBody: "You have a care reminder for {{petName}}." },
  },
  /** Handoff 11 — a PUBLIC-visibility admin reply on the requester's own support case. `body`/`smsBody` never include the message content itself (an internal note or a message with sensitive detail must never leak via SMS/push copy) — the recipient opens the app to read it. */
  "support.message_posted": {
    fa: { title: "پاسخ جدید به درخواست پشتیبانی شما", body: "یک پاسخ جدید برای درخواست پشتیبانی {{caseNumber}} ثبت شد.", smsBody: "پاسخ جدیدی برای درخواست پشتیبانی شما در پت‌لایف ثبت شد." },
    en: { title: "New reply on your support case", body: "A new reply was posted on support case {{caseNumber}}.", smsBody: "You have a new reply on your PET LIFE OS support case." },
  },
  "support.case_resolved": {
    fa: { title: "درخواست پشتیبانی شما حل شد", body: "درخواست پشتیبانی {{caseNumber}} به عنوان حل‌شده علامت‌گذاری شد.", smsBody: "درخواست پشتیبانی شما در پت‌لایف حل شد." },
    en: { title: "Your support case was resolved", body: "Support case {{caseNumber}} was marked resolved.", smsBody: "Your PET LIFE OS support case was resolved." },
  },
  "household.invited": {
    fa: { title: "دعوت به خانواده PET LIFE", body: "{{inviterName}} شما را برای همکاری در مراقبت از حیوان‌ها دعوت کرده است.", smsBody: "یک دعوت خانوادگی جدید در PET LIFE دارید." },
    en: { title: "PET LIFE household invitation", body: "{{inviterName}} invited you to collaborate on pet care.", smsBody: "You have a new PET LIFE household invitation." },
  },
  "household.member_removed": {
    fa: { title: "دسترسی خانوادگی شما پایان یافت", body: "مدیر خانواده شما را از خانواده حذف کرد؛ دسترسی شما به حیوان‌های آن خانواده قطع شد." },
    en: { title: "Your household access ended", body: "A household owner removed you; your access to that household's pets has ended." },
  },
  // Batch 8 — security messages (SECURITY category is never suppressible).
  "security.new_sign_in": {
    fa: { title: "ورود تازه به حساب شما", body: "یک ورود تازه با {{device}} ثبت شد. اگر شما نبودید، از بخش امنیت نشست را قطع و رمز را تغییر دهید." },
    en: { title: "New sign-in to your account", body: "A new sign-in from {{device}} was recorded. If it wasn't you, end that session in Security and change your password." },
  },
  "security.password_changed": {
    fa: { title: "رمز عبور شما تغییر کرد", body: "رمز عبور حساب شما تغییر کرد و سایر دستگاه‌ها خارج شدند. اگر شما نبودید، فوراً رمز را بازیابی کنید." },
    en: { title: "Your password was changed", body: "Your account password changed and other devices were signed out. If this wasn't you, reset your password now." },
  },
  "security.contact_changed": {
    fa: { title: "راه تماس حساب تغییر کرد", body: "{{contactKind}} حساب شما تغییر کرد. اگر شما نبودید، با پشتیبانی تماس بگیرید." },
    en: { title: "Account contact changed", body: "The {{contactKind}} on your account changed. If this wasn't you, contact support." },
  },
  "security.sessions_revoked": {
    fa: { title: "از سایر دستگاه‌ها خارج شدید", body: "{{count}} نشست فعال دیگر به درخواست شما پایان یافت." },
    en: { title: "Signed out of other devices", body: "{{count}} other active session(s) were ended at your request." },
  },
  "security.unverified_credentials_cleared": {
    fa: { title: "حساب شما ایمن شد", body: "ایمیل شما تأیید شد و رمز عبوری که قبلاً بدون تأیید این ایمیل ثبت شده بود حذف شد. در صورت نیاز رمز تازه بسازید." },
    en: { title: "Your account was secured", body: "Your email is now verified, and a password that had been set without proving this email was removed. Set a new one if you need it." },
  },
  /** Handoff 13 — fires when a case moves to WAITING_ON_USER (the requester's own simplified status label is "Waiting"). */
  "support.more_info_requested": {
    fa: { title: "نیاز به اطلاعات بیشتر برای درخواست شما", body: "برای پیگیری درخواست پشتیبانی {{caseNumber}}، به اطلاعات بیشتری از شما نیاز داریم.", smsBody: "برای درخواست پشتیبانی شما در پت‌لایف به اطلاعات بیشتری نیاز است." },
    en: { title: "We need more information", body: "We need more information from you to continue with support case {{caseNumber}}.", smsBody: "More information is needed on your PET LIFE OS support case." },
  },
  "support.case_closed": {
    fa: { title: "درخواست پشتیبانی شما بسته شد", body: "درخواست پشتیبانی {{caseNumber}} بسته شد.", smsBody: "درخواست پشتیبانی شما در پت‌لایف بسته شد." },
    en: { title: "Your support case was closed", body: "Support case {{caseNumber}} was closed.", smsBody: "Your PET LIFE OS support case was closed." },
  },
  /** Handoff 14 — a settlement finished calculation and is awaiting admin review/approval (spec: "Settlement Ready"). Never fires per-ledger-line — exactly one notification per settlement. */
  "settlement.ready": {
    fa: { title: "تسویه‌حساب جدید آماده بررسی است", body: "تسویه‌حساب {{reference}} محاسبه شد و آماده بررسی است.", smsBody: "یک تسویه‌حساب جدید در پت‌لایف آماده بررسی است." },
    en: { title: "A new settlement is ready for review", body: "Settlement {{reference}} has been calculated and is awaiting review.", smsBody: "A new PET LIFE OS settlement is ready for review." },
  },
  "settlement.paid": {
    fa: { title: "تسویه‌حساب شما پرداخت شد", body: "تسویه‌حساب {{reference}} پرداخت شد.", smsBody: "تسویه‌حساب شما در پت‌لایف پرداخت شد." },
    en: { title: "Your settlement was paid", body: "Settlement {{reference}} has been paid.", smsBody: "Your PET LIFE OS settlement was paid." },
  },
  "settlement.failed": {
    fa: { title: "مشکلی در تسویه‌حساب شما پیش آمد", body: "تسویه‌حساب {{reference}} با مشکل مواجه شد. جزئیات را در اپلیکیشن ببینید.", smsBody: "مشکلی در تسویه‌حساب شما در پت‌لایف پیش آمد." },
    en: { title: "An issue occurred with your settlement", body: "Settlement {{reference}} could not be completed. See the app for details.", smsBody: "An issue occurred with your PET LIFE OS settlement." },
  },
  // Subscription + Membership + Metering (Handoff 16) — no smsBody on any of
  // these: subscription/billing status is never urgent enough to justify an
  // SMS the way a failed payment or an OTP is, and every one of these is
  // already visible in-app the moment the household opens Manage Subscription.
  "subscription.started": {
    fa: { title: "اشتراک شما فعال شد", body: "اشتراک {{planName}} برای خانواده شما فعال شد." },
    en: { title: "Your subscription is active", body: "Your household is now on the {{planName}} plan." },
  },
  "subscription.trial_started": {
    fa: { title: "دوره آزمایشی شما شروع شد", body: "دوره آزمایشی {{planName}} برای خانواده شما فعال شد." },
    en: { title: "Your trial has started", body: "Your household's {{planName}} trial is now active." },
  },
  "subscription.upgraded": {
    fa: { title: "اشتراک شما ارتقا یافت", body: "اشتراک خانواده شما به {{planName}} ارتقا یافت." },
    en: { title: "Your subscription was upgraded", body: "Your household is now on the {{planName}} plan." },
  },
  "subscription.renewed": {
    fa: { title: "اشتراک شما تمدید شد", body: "اشتراک {{planName}} برای دوره بعدی تمدید شد." },
    en: { title: "Your subscription renewed", body: "Your {{planName}} plan renewed for another period." },
  },
  "subscription.renewal_failed": {
    fa: { title: "تمدید اشتراک ناموفق بود", body: "پرداخت تمدید اشتراک {{planName}} انجام نشد. لطفاً روش پرداخت خود را بررسی کنید." },
    en: { title: "Your subscription renewal failed", body: "We couldn't charge for your {{planName}} plan renewal. Please check your payment method." },
  },
  "subscription.grace_started": {
    fa: { title: "مهلت پرداخت اشتراک شما آغاز شد", body: "اشتراک {{planName}} همچنان فعال است، اما لطفاً هرچه زودتر پرداخت را تکمیل کنید تا از قطع دسترسی جلوگیری شود." },
    en: { title: "Your subscription is in a grace period", body: "Your {{planName}} plan is still active — please complete payment soon to avoid losing access." },
  },
  "subscription.expired": {
    fa: { title: "اشتراک شما به پایان رسید", body: "اشتراک {{planName}} به پایان رسید و خانواده شما به پلن رایگان بازگشت. اطلاعات و حیوانات شما همچنان در دسترس است." },
    en: { title: "Your subscription has ended", body: "Your {{planName}} plan has ended and your household moved to the Free plan. Your data and pets remain fully accessible." },
  },
  "subscription.cancel_scheduled": {
    fa: { title: "لغو اشتراک شما ثبت شد", body: "اشتراک شما تا پایان دوره فعلی فعال می‌ماند و سپس لغو خواهد شد." },
    en: { title: "Your cancellation is scheduled", body: "Your subscription stays active until the end of the current period, then it will be cancelled." },
  },
  "subscription.cancel_reversed": {
    fa: { title: "لغو اشتراک شما لغو شد", body: "درخواست لغو اشتراک شما لغو شد و اشتراک شما به‌طور معمول ادامه می‌یابد." },
    en: { title: "Your cancellation was reversed", body: "Your subscription cancellation was undone and will continue as normal." },
  },
  "subscription.downgrade_scheduled": {
    fa: { title: "تغییر پلن شما زمان‌بندی شد", body: "اشتراک شما در پایان دوره فعلی به {{planName}} تغییر می‌کند." },
    en: { title: "Your plan change is scheduled", body: "Your subscription will move to {{planName}} at the end of the current period." },
  },
  "subscription.downgrade_applied": {
    fa: { title: "پلن اشتراک شما تغییر کرد", body: "اشتراک خانواده شما اکنون {{planName}} است." },
    en: { title: "Your plan has changed", body: "Your household is now on the {{planName}} plan." },
  },
  // Advanced Health / Clinical OS (Handoff 17) — spec: "Do not expose
  // detailed diagnosis in SMS. SMS copy must remain privacy-safe." Every
  // smsBody below is fully generic (no pet name, no document title, no
  // finding) by construction — the in-app `body` may name the pet, but
  // never a diagnosis, test result, or clinical detail either.
  "health.document_added": {
    fa: { title: "سند پزشکی جدید", body: "یک سند پزشکی جدید برای {{petName}} اضافه شد.", smsBody: "یک به‌روزرسانی پزشکی برای حیوان خانگی شما در پت‌لایف ثبت شد." },
    en: { title: "New medical document", body: "A new medical document was added for {{petName}}.", smsBody: "A health update for your pet is available in PET LIFE OS." },
  },
  "health.follow_up_due": {
    fa: { title: "پیگیری درمانی سررسید شد", body: "یک مورد پیگیری درمانی برای {{petName}} سررسید شده است.", smsBody: "یک یادآوری مراقبتی برای حیوان خانگی شما در پت‌لایف دارید." },
    en: { title: "Follow-up due", body: "A follow-up item for {{petName}} is due.", smsBody: "You have a care follow-up for your pet in PET LIFE OS." },
  },
  "health.referral_created": {
    fa: { title: "ارجاع پزشکی جدید", body: "یک ارجاع پزشکی جدید برای {{petName}} ثبت شد.", smsBody: "یک ارجاع پزشکی جدید برای حیوان خانگی شما ثبت شد." },
    en: { title: "New referral", body: "A new referral was created for {{petName}}.", smsBody: "A new referral for your pet is available in PET LIFE OS." },
  },
  "health.referral_updated": {
    fa: { title: "وضعیت ارجاع پزشکی به‌روزرسانی شد", body: "وضعیت ارجاع پزشکی {{petName}} تغییر کرد.", smsBody: "وضعیت ارجاع پزشکی حیوان خانگی شما تغییر کرد." },
    en: { title: "Referral status updated", body: "The referral status for {{petName}} changed.", smsBody: "A referral update for your pet is available in PET LIFE OS." },
  },
  "health.care_plan_updated": {
    fa: { title: "برنامه مراقبتی به‌روزرسانی شد", body: "برنامه مراقبتی {{petName}} توسط ارائه‌دهنده به‌روزرسانی شد.", smsBody: "یک به‌روزرسانی برنامه مراقبتی برای حیوان خانگی شما ثبت شد." },
    en: { title: "Care plan updated", body: "{{petName}}'s care plan was updated by the provider.", smsBody: "A care plan update for your pet is available in PET LIFE OS." },
  },

  // Veterinary Clinical Panel (Handoff 24). Holds the same privacy bar the
  // H17 clinical templates set — the smsBody never names the pet, the drug,
  // the diagnosis, or the amount, because a household member reading an SMS
  // preview on a lock screen has not authenticated. The in-app body may name
  // the pet, and nothing more.
  "clinical.estimate_presented": {
    fa: { title: "برآورد هزینه درمان آماده است", body: "یک برآورد هزینه درمان برای {{petName}} برای بررسی شما ثبت شد.", smsBody: "یک برآورد هزینه درمان در پت‌لایف منتظر بررسی شماست." },
    en: { title: "Treatment estimate ready", body: "A treatment estimate for {{petName}} is waiting for your review.", smsBody: "A treatment estimate is waiting for your review in PET LIFE OS." },
  },
  "clinical.patient_admitted": {
    fa: { title: "بستری شدن در کلینیک", body: "{{petName}} در کلینیک بستری شد.", smsBody: "یک به‌روزرسانی درباره بستری حیوان خانگی شما در پت‌لایف ثبت شد." },
    en: { title: "Admitted to the clinic", body: "{{petName}} has been admitted to the clinic.", smsBody: "An admission update for your pet is available in PET LIFE OS." },
  },
  "clinical.patient_discharged": {
    fa: { title: "ترخیص از کلینیک", body: "{{petName}} از کلینیک ترخیص شد.", smsBody: "یک به‌روزرسانی درباره ترخیص حیوان خانگی شما در پت‌لایف ثبت شد." },
    en: { title: "Discharged from the clinic", body: "{{petName}} has been discharged from the clinic.", smsBody: "A discharge update for your pet is available in PET LIFE OS." },
  },
  "clinical.discharge_summary_issued": {
    fa: { title: "خلاصه ترخیص صادر شد", body: "خلاصه ترخیص و دستورالعمل مراقبت در منزل برای {{petName}} در دسترس است.", smsBody: "دستورالعمل مراقبت در منزل حیوان خانگی شما در پت‌لایف در دسترس است." },
    en: { title: "Discharge summary issued", body: "The discharge summary and home care instructions for {{petName}} are available.", smsBody: "Home care instructions for your pet are available in PET LIFE OS." },
  },
  "clinical.prescription_issued": {
    fa: { title: "نسخه جدید", body: "یک نسخه جدید برای {{petName}} ثبت شد.", smsBody: "یک نسخه جدید برای حیوان خانگی شما در پت‌لایف ثبت شد." },
    en: { title: "New prescription", body: "A new prescription was issued for {{petName}}.", smsBody: "A new prescription for your pet is available in PET LIFE OS." },
  },

  // Handoff 18: Lost Pet — a high-severity category (spec: "high-severity
  // product flow"), so every smsBody is deliberately specific enough to be
  // actionable at a glance (unlike the deliberately generic H17 clinical
  // smsBody copy) while still never including a raw contact number.
  "lost_pet.incident_opened": {
    fa: { title: "گزارش گم‌شدن حیوان خانگی ثبت شد", body: "گزارش گم‌شدن {{petName}} ثبت شد. اعضای خانواده مطلع شدند.", smsBody: "گزارش گم‌شدن {{petName}} در پت‌لایف ثبت شد." },
    en: { title: "Lost pet report created", body: "A lost pet report for {{petName}} was created. Household members have been notified.", smsBody: "A lost pet report for {{petName}} was created in PET LIFE OS." },
  },
  "lost_pet.sighting_submitted": {
    fa: { title: "گزارش مشاهده جدید", body: "یک گزارش مشاهده جدید برای {{petName}} ثبت شد.", smsBody: "یک گزارش مشاهده جدید برای {{petName}} در پت‌لایف ثبت شد." },
    en: { title: "New sighting reported", body: "A new sighting was reported for {{petName}}.", smsBody: "A new sighting for {{petName}} was reported in PET LIFE OS." },
  },
  "lost_pet.marked_found": {
    fa: { title: "حیوان خانگی پیدا شد", body: "{{petName}} به عنوان پیداشده علامت‌گذاری شد.", smsBody: "{{petName}} در پت‌لایف پیداشده علامت‌گذاری شد." },
    en: { title: "Pet marked found", body: "{{petName}} was marked as found.", smsBody: "{{petName}} was marked as found in PET LIFE OS." },
  },
  "lost_pet.reunited": {
    fa: { title: "بازگشت به خانواده", body: "{{petName}} با خانواده دوباره یکی شد!", smsBody: "خبر خوب! {{petName}} با خانواده دوباره یکی شد." },
    en: { title: "Reunited!", body: "{{petName}} has been reunited with the household!", smsBody: "Good news — {{petName}} has been reunited with your household." },
  },

  // Handoff 19: Insurance application status — deliberately just
  // submission/status-change, never a per-field or per-comparison-view
  // notification (spec: "do not over-notify"). Never claims an approval or
  // decline decision, since no service ever sets those statuses.
  "insurance.application_submitted": {
    fa: {
      title: "درخواست بیمه ارسال شد",
      body: "درخواست بیمه برای {{petName}} نزد {{providerName}} ارسال شد.",
      smsBody: "درخواست بیمه {{petName}} نزد {{providerName}} در پت‌لایف ارسال شد.",
    },
    en: {
      title: "Insurance application submitted",
      body: "The insurance application for {{petName}} with {{providerName}} was submitted.",
      smsBody: "Insurance application for {{petName}} with {{providerName}} submitted in PET LIFE OS.",
    },
  },
  "insurance.application_status_changed": {
    fa: { title: "به‌روزرسانی وضعیت بیمه", body: "وضعیت درخواست بیمه {{petName}} به {{status}} تغییر کرد.", smsBody: "وضعیت درخواست بیمه {{petName}} در پت‌لایف تغییر کرد." },
    en: { title: "Insurance application update", body: "The insurance application status for {{petName}} changed to {{status}}.", smsBody: "Insurance application status for {{petName}} changed in PET LIFE OS." },
  },
};

export function hasTemplate(key: string): boolean {
  return key in TEMPLATES;
}

function resolveVariant(key: string, locale: Locale): NotificationTemplateVariant {
  const entry = TEMPLATES[key];
  if (!entry) throw new Error(`No notification template registered for type "${key}"`);
  const variant = entry[locale] ?? entry.en;
  if (!variant) throw new Error(`No notification template variant for type "${key}" in locale "${locale}" or fallback "en"`);
  return variant;
}

function interpolate(text: string, params: TemplateParams): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => (key in params ? String(params[key]) : ""));
}

export interface RenderedNotification {
  title: string;
  body: string;
  smsBody: string | null;
}

export function renderNotificationTemplate(key: string, locale: Locale, params: TemplateParams = {}): RenderedNotification {
  const variant = resolveVariant(key, locale);
  return {
    title: interpolate(variant.title, params),
    body: interpolate(variant.body, params),
    smsBody: variant.smsBody ? interpolate(variant.smsBody, params) : null,
  };
}
