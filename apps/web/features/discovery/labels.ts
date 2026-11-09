import type { RouteLocale } from "@/lib/i18n/config";

/** Human labels for internal enums — the UI never shows raw enum names. */
const CATEGORY: Record<string, [string, string, string, string]> = {
  VET: ["دامپزشکی", "Veterinary", "Tiermedizin", "Veterinaria"],
  GROOMING: ["آرایش و شست‌وشو", "Grooming", "Fellpflege", "Peluquería"],
  TRAINING: ["آموزش", "Training", "Training", "Adiestramiento"],
  WALKING: ["پیاده‌روی", "Dog walking", "Gassi gehen", "Paseo de perros"],
  SITTING: ["نگهداری در منزل", "Pet sitting", "Betreuung zu Hause", "Cuidado en casa"],
  BOARDING: ["پانسیون", "Boarding", "Tierpension", "Residencia para mascotas"],
  PET_TAXI: ["تاکسی حیوانات", "Pet taxi", "Tiertransport", "Taxi para mascotas"],
  OTHER: ["سایر خدمات", "Other services", "Weitere Dienste", "Otros servicios"],
};

const PROVIDER_TYPE: Record<string, [string, string, string, string]> = {
  VET_CLINIC: ["کلینیک دامپزشکی", "Veterinary clinic", "Tierarztpraxis", "Clínica veterinaria"],
  VET_HOSPITAL: ["بیمارستان دامپزشکی", "Veterinary hospital", "Tierklinik", "Hospital veterinario"],
  VETERINARIAN: ["دامپزشک", "Veterinarian", "Tierarzt/Tierärztin", "Veterinario/a"],
  GROOMER: ["آرایشگر", "Groomer", "Hundefriseur/in", "Peluquero/a"],
  TRAINER: ["مربی", "Trainer", "Trainer/in", "Adiestrador/a"],
  WALKER: ["پیاده‌روی‌بر", "Dog walker", "Gassi-Service", "Paseador/a de perros"],
  SITTER: ["پرستار حیوان", "Pet sitter", "Tiersitter/in", "Cuidador/a de mascotas"],
  BOARDING: ["پانسیون", "Boarding", "Tierpension", "Residencia para mascotas"],
  PET_TAXI: ["تاکسی حیوانات", "Pet taxi", "Tiertransport", "Taxi para mascotas"],
  MULTI_SERVICE_PROVIDER: ["مرکز چندخدمتی", "Multi-service center", "Anbieter mit mehreren Diensten", "Centro multiservicio"],
  TRAVEL_ACCOMMODATION: ["اقامتگاه سفر", "Travel accommodation", "Tierfreundliche Unterkunft", "Alojamiento pet-friendly"],
};

const UNKNOWN_CATEGORY = ["دستهٔ خدمت نامشخص", "Service category unavailable", "Dienstleistungskategorie nicht verfügbar", "Categoría de servicio no disponible"] as const;

export function categoryLabel(category: string, locale: RouteLocale | boolean): string {
  return CATEGORY[category]?.[localeIndex(locale)] ?? UNKNOWN_CATEGORY[localeIndex(locale)];
}

const UNKNOWN_PROVIDER_TYPE = ["نوع ارائه‌دهنده نامشخص", "Provider type unavailable", "Anbietertyp nicht verfügbar", "Tipo de proveedor no disponible"] as const;

export function providerTypeLabel(type: string, locale: RouteLocale | boolean): string {
  return PROVIDER_TYPE[type]?.[localeIndex(locale)] ?? UNKNOWN_PROVIDER_TYPE[localeIndex(locale)];
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
  CANCELLED_BY_USER: ["لغو توسط شما", "Cancelled by you", "Von Ihnen storniert", "Cancelada por ti"],
  CANCELLED_BY_PROVIDER: ["لغو توسط ارائه‌دهنده", "Cancelled by provider", "Vom Anbieter storniert", "Cancelada por el proveedor"],
  NO_SHOW: ["عدم حضور", "No-show", "Nicht erschienen", "No presentado"],
};

const UNKNOWN_STATUS = ["وضعیت نامشخص", "Status unavailable", "Status nicht verfügbar", "Estado no disponible"] as const;

export function bookingStatusLabel(status: string, locale: RouteLocale | boolean): string {
  return BOOKING_STATUS[status]?.[localeIndex(locale)] ?? UNKNOWN_STATUS[localeIndex(locale)];
}

export function bookingStatusTone(status: string): "success" | "attention" | "neutral" | "urgent" {
  if (status === "CONFIRMED" || status === "COMPLETED" || status === "CHECKED_IN" || status === "IN_PROGRESS") return "success";
  if (status === "REQUESTED" || status === "AWAITING_PAYMENT" || status === "PENDING_CONFIRMATION") return "attention";
  if (status === "REJECTED" || status === "NO_SHOW" || status === "CANCELLED_BY_PROVIDER") return "urgent";
  return "neutral";
}

const PAYMENT_MODE: Record<string, [string, string, string, string]> = {
  NONE: ["بدون پرداخت آنلاین", "No online payment", "Keine Onlinezahlung", "Sin pago en línea"],
  PAY_AT_PROVIDER: ["پرداخت در محل", "Pay at the provider", "Zahlung beim Anbieter", "Pago al proveedor"],
  FULL_PREPAYMENT: ["پرداخت کامل آنلاین", "Full online prepayment", "Vollständige Online-Vorauszahlung", "Pago anticipado completo en línea"],
  DEPOSIT: ["پیش‌پرداخت آنلاین", "Online deposit", "Online-Anzahlung", "Anticipo en línea"],
};

function localeIndex(locale: RouteLocale | boolean): 0 | 1 | 2 | 3 {
  if (locale === true || locale === "fa") return 0;
  if (locale === false || locale === "en") return 1;
  return locale === "de" ? 2 : 3;
}

const UNKNOWN_PAYMENT_MODE = ["روش پرداخت نامشخص", "Payment method unavailable", "Zahlungsmethode nicht verfügbar", "Método de pago no disponible"] as const;

export function paymentModeLabel(mode: string, locale: RouteLocale | boolean): string {
  return PAYMENT_MODE[mode]?.[localeIndex(locale)] ?? UNKNOWN_PAYMENT_MODE[localeIndex(locale)];
}

export const TIMELINE_ACTOR: Record<string, [string, string]> = {
  USER: ["شما", "You"],
  PROVIDER: ["ارائه‌دهنده", "Provider"],
  SYSTEM: ["سیستم", "System"],
  ADMIN: ["پشتیبانی", "Support"],
};
