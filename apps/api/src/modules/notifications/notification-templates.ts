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
