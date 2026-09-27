/** Human labels for internal enums — the UI never shows raw enum names. */
const CATEGORY: Record<string, [string, string]> = {
  VET: ["دامپزشکی", "Veterinary"],
  GROOMING: ["آرایش و شست‌وشو", "Grooming"],
  TRAINING: ["آموزش", "Training"],
  WALKING: ["پیاده‌روی", "Dog walking"],
  SITTING: ["نگهداری در منزل", "Pet sitting"],
  BOARDING: ["پانسیون", "Boarding"],
  PET_TAXI: ["تاکسی حیوانات", "Pet taxi"],
  OTHER: ["سایر خدمات", "Other services"],
};

const PROVIDER_TYPE: Record<string, [string, string]> = {
  VET_CLINIC: ["کلینیک دامپزشکی", "Veterinary clinic"],
  VET_HOSPITAL: ["بیمارستان دامپزشکی", "Veterinary hospital"],
  VETERINARIAN: ["دامپزشک", "Veterinarian"],
  GROOMER: ["آرایشگر", "Groomer"],
  TRAINER: ["مربی", "Trainer"],
  WALKER: ["پیاده‌روی‌بر", "Dog walker"],
  SITTER: ["پرستار حیوان", "Pet sitter"],
  BOARDING: ["پانسیون", "Boarding"],
  PET_TAXI: ["تاکسی حیوانات", "Pet taxi"],
  MULTI_SERVICE_PROVIDER: ["مرکز چندخدمتی", "Multi-service center"],
};

export function categoryLabel(category: string, fa: boolean): string {
  return CATEGORY[category]?.[fa ? 0 : 1] ?? category;
}

export function providerTypeLabel(type: string, fa: boolean): string {
  return PROVIDER_TYPE[type]?.[fa ? 0 : 1] ?? type;
}

const BOOKING_STATUS: Record<string, [string, string]> = {
  HOLD: ["در حال رزرو", "Holding"],
  PENDING_CONFIRMATION: ["در انتظار تأیید", "Pending confirmation"],
  REQUESTED: ["درخواست ارسال شد", "Requested"],
  AWAITING_PAYMENT: ["در انتظار پرداخت", "Awaiting payment"],
  REJECTED: ["پذیرفته نشد", "Declined"],
  EXPIRED: ["منقضی شد", "Expired"],
  RESCHEDULED: ["منتقل شد", "Rescheduled"],
  CONFIRMED: ["قطعی", "Confirmed"],
  CHECKED_IN: ["پذیرش شد", "Checked in"],
  IN_PROGRESS: ["در حال انجام", "In progress"],
  COMPLETED: ["انجام شد", "Completed"],
  CANCELLED_BY_USER: ["لغو توسط شما", "Cancelled by you"],
  CANCELLED_BY_PROVIDER: ["لغو توسط ارائه‌دهنده", "Cancelled by provider"],
  NO_SHOW: ["عدم حضور", "No-show"],
};

export function bookingStatusLabel(status: string, fa: boolean): string {
  return BOOKING_STATUS[status]?.[fa ? 0 : 1] ?? status;
}

export function bookingStatusTone(status: string): "success" | "attention" | "neutral" | "urgent" {
  if (status === "CONFIRMED" || status === "COMPLETED" || status === "CHECKED_IN" || status === "IN_PROGRESS") return "success";
  if (status === "REQUESTED" || status === "AWAITING_PAYMENT" || status === "PENDING_CONFIRMATION") return "attention";
  if (status === "REJECTED" || status === "NO_SHOW" || status === "CANCELLED_BY_PROVIDER") return "urgent";
  return "neutral";
}

const PAYMENT_MODE: Record<string, [string, string]> = {
  NONE: ["بدون پرداخت آنلاین", "No online payment"],
  PAY_AT_PROVIDER: ["پرداخت در محل", "Pay at the provider"],
  FULL_PREPAYMENT: ["پرداخت کامل آنلاین", "Full online prepayment"],
  DEPOSIT: ["پیش‌پرداخت آنلاین", "Online deposit"],
};

export function paymentModeLabel(mode: string, fa: boolean): string {
  return PAYMENT_MODE[mode]?.[fa ? 0 : 1] ?? mode;
}

export const TIMELINE_ACTOR: Record<string, [string, string]> = {
  USER: ["شما", "You"],
  PROVIDER: ["ارائه‌دهنده", "Provider"],
  SYSTEM: ["سیستم", "System"],
  ADMIN: ["پشتیبانی", "Support"],
};
