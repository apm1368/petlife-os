import type { RouteLocale } from "@/lib/i18n/config";

/** Human labels for internal enums — the UI never shows raw enum names. */
const CATEGORY: Record<string, [string, string, string, string]> = {
  VET: ["دامپزشکی", "Veterinary", "Tiermedizin", "Veterinaria"],
  GROOMING: ["آرایش و شست‌وشو", "Grooming", "Fellpflege", "Peluquería"],
  TRAINING: ["آموزش", "Training", "Training", "Adiestramiento"],
  WALKING: ["پیاده‌روی", "Dog walking", "Gassigehen", "Paseo de perros"],
  SITTING: ["نگهداری در منزل", "Pet sitting", "Haustierbetreuung", "Cuidado de mascotas"],
  BOARDING: ["پانسیون", "Boarding", "Tierpension", "Residencia"],
  PET_TAXI: ["تاکسی حیوانات", "Pet taxi", "Tier-Taxi", "Taxi para mascotas"],
  OTHER: ["سایر خدمات", "Other services", "Weitere Dienste", "Otros servicios"],
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
  TRAVEL_ACCOMMODATION: ["اقامتگاه سفر", "Travel accommodation"],
};

function localeIndex(locale: RouteLocale | boolean): number {
  if (typeof locale === "boolean") return locale ? 0 : 1;
  return ({ fa: 0, en: 1, de: 2, es: 3 })[locale];
}

export function categoryLabel(category: string, locale: RouteLocale | boolean): string {
  return CATEGORY[category]?.[localeIndex(locale)] ?? category;
}

export function providerTypeLabel(type: string, fa: boolean): string {
  return PROVIDER_TYPE[type]?.[fa ? 0 : 1] ?? type;
}

const BOOKING_STATUS: Record<string, [string, string, string, string]> = {
  HOLD: ["در حال رزرو", "Holding", "Wird reserviert", "En reserva"],
  PENDING_CONFIRMATION: ["در انتظار تأیید", "Pending confirmation", "Bestätigung ausstehend", "Pendiente de confirmación"],
  REQUESTED: ["درخواست ارسال شد", "Requested", "Angefragt", "Solicitada"],
  AWAITING_PAYMENT: ["در انتظار پرداخت", "Awaiting payment", "Zahlung ausstehend", "Pendiente de pago"],
  REJECTED: ["پذیرفته نشد", "Declined", "Abgelehnt", "Rechazada"],
  EXPIRED: ["منقضی شد", "Expired", "Abgelaufen", "Caducada"],
  RESCHEDULED: ["منتقل شد", "Rescheduled", "Verschoben", "Reprogramada"],
  CONFIRMED: ["قطعی", "Confirmed", "Bestätigt", "Confirmada"],
  CHECKED_IN: ["پذیرش شد", "Checked in", "Eingecheckt", "Registrada"],
  IN_PROGRESS: ["در حال انجام", "In progress", "In Bearbeitung", "En curso"],
  COMPLETED: ["انجام شد", "Completed", "Abgeschlossen", "Completada"],
  CANCELLED_BY_USER: ["لغو توسط شما", "Cancelled by you", "Von dir storniert", "Cancelada por ti"],
  CANCELLED_BY_PROVIDER: ["لغو توسط ارائه‌دهنده", "Cancelled by provider", "Vom Anbieter storniert", "Cancelada por el proveedor"],
  NO_SHOW: ["عدم حضور", "No-show", "Nicht erschienen", "Ausencia"],
};

export function bookingStatusLabel(status: string, locale: RouteLocale | boolean): string {
  return BOOKING_STATUS[status]?.[localeIndex(locale)] ?? status;
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
