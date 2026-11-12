import type { RouteLocale } from "@/lib/i18n/config";

/** Human labels for internal enums — the UI never shows raw enum names. */
const CATEGORY: Record<string, [string, string, string, string, string, string]> = {
  VET: ["دامپزشکی", "Veterinary", "Tiermedizin", "Veterinaria", "طب بيطري", "Dierenarts"],
  GROOMING: ["آرایش و شست‌وشو", "Grooming", "Fellpflege", "Peluquería", "التجميل", "Vachtverzorging"],
  TRAINING: ["آموزش", "Training", "Training", "Adiestramiento", "التدريب", "Training"],
  WALKING: ["پیاده‌روی", "Dog walking", "Gassi gehen", "Paseo de perros", "تمشية الكلاب", "Honden uitlaten"],
  SITTING: ["نگهداری در منزل", "Pet sitting", "Betreuung zu Hause", "Cuidado en casa", "مجالسة الحيوانات الأليفة", "Huisdieroppas"],
  BOARDING: ["پانسیون", "Boarding", "Tierpension", "Residencia para mascotas", "الإيواء", "Dierenpension"],
  PET_TAXI: ["تاکسی حیوانات", "Pet taxi", "Tiertransport", "Taxi para mascotas", "تاكسي الحيوانات الأليفة", "Dierentaxi"],
  OTHER: ["سایر خدمات", "Other services", "Weitere Dienste", "Otros servicios", "خدمات أخرى", "Andere diensten"],
};

const PROVIDER_TYPE: Record<string, [string, string, string, string, string, string]> = {
  VET_CLINIC: ["کلینیک دامپزشکی", "Veterinary clinic", "Tierarztpraxis", "Clínica veterinaria", "عيادة بيطرية", "Dierenkliniek"],
  VET_HOSPITAL: ["بیمارستان دامپزشکی", "Veterinary hospital", "Tierklinik", "Hospital veterinario", "مستشفى بيطري", "Dierenziekenhuis"],
  VETERINARIAN: ["دامپزشک", "Veterinarian", "Tierarzt/Tierärztin", "Veterinario/a", "طبيب بيطري", "Dierenarts"],
  GROOMER: ["آرایشگر", "Groomer", "Hundefriseur/in", "Peluquero/a", "مُصفِّف حيوانات أليفة", "Trimmer"],
  TRAINER: ["مربی", "Trainer", "Trainer/in", "Adiestrador/a", "مدرّب", "Trainer"],
  WALKER: ["پیاده‌روی‌بر", "Dog walker", "Gassi-Service", "Paseador/a de perros", "مُمشّي كلاب", "Hondenuitlater"],
  SITTER: ["پرستار حیوان", "Pet sitter", "Tiersitter/in", "Cuidador/a de mascotas", "جليس حيوانات أليفة", "Dierenoppas"],
  BOARDING: ["پانسیون", "Boarding", "Tierpension", "Residencia para mascotas", "الإيواء", "Dierenpension"],
  PET_TAXI: ["تاکسی حیوانات", "Pet taxi", "Tiertransport", "Taxi para mascotas", "تاكسي الحيوانات الأليفة", "Dierentaxi"],
  MULTI_SERVICE_PROVIDER: ["مرکز چندخدمتی", "Multi-service center", "Anbieter mit mehreren Diensten", "Centro multiservicio", "مركز متعدد الخدمات", "Multiservicecentrum"],
  TRAVEL_ACCOMMODATION: ["اقامتگاه سفر", "Travel accommodation", "Tierfreundliche Unterkunft", "Alojamiento pet-friendly", "إقامة سفر", "Reisaccommodatie"],
};

const UNKNOWN_CATEGORY = ["دستهٔ خدمت نامشخص", "Service category unavailable", "Dienstleistungskategorie nicht verfügbar", "Categoría de servicio no disponible", "فئة الخدمة غير متاحة", "Dienstcategorie niet beschikbaar"] as const;

export function categoryLabel(category: string, locale: RouteLocale | boolean): string {
  return CATEGORY[category]?.[localeIndex(locale)] ?? UNKNOWN_CATEGORY[localeIndex(locale)];
}

const UNKNOWN_PROVIDER_TYPE = ["نوع ارائه‌دهنده نامشخص", "Provider type unavailable", "Anbietertyp nicht verfügbar", "Tipo de proveedor no disponible", "نوع مقدم الخدمة غير متاح", "Type aanbieder niet beschikbaar"] as const;

export function providerTypeLabel(type: string, locale: RouteLocale | boolean): string {
  return PROVIDER_TYPE[type]?.[localeIndex(locale)] ?? UNKNOWN_PROVIDER_TYPE[localeIndex(locale)];
}

const BOOKING_STATUS: Record<string, [string, string, string, string, string, string]> = {
  HOLD: ["در حال رزرو", "Holding", "Wird reserviert", "En reserva", "قيد الحجز", "Wordt gereserveerd"],
  PENDING_CONFIRMATION: ["در انتظار تأیید", "Pending confirmation", "Bestätigung ausstehend", "Pendiente de confirmación", "بانتظار التأكيد", "Wacht op bevestiging"],
  REQUESTED: ["درخواست ارسال شد", "Requested", "Angefragt", "Solicitada", "تم الطلب", "Aangevraagd"],
  AWAITING_PAYMENT: ["در انتظار پرداخت", "Awaiting payment", "Zahlung ausstehend", "Pendiente de pago", "بانتظار الدفع", "Wacht op betaling"],
  REJECTED: ["پذیرفته نشد", "Declined", "Abgelehnt", "Rechazada", "مرفوض", "Afgewezen"],
  EXPIRED: ["منقضی شد", "Expired", "Abgelaufen", "Caducada", "منتهي الصلاحية", "Verlopen"],
  RESCHEDULED: ["منتقل شد", "Rescheduled", "Verschoben", "Reprogramada", "أُعيدت جدولته", "Verzet"],
  CONFIRMED: ["قطعی", "Confirmed", "Bestätigt", "Confirmada", "مؤكد", "Bevestigd"],
  CHECKED_IN: ["پذیرش شد", "Checked in", "Eingecheckt", "Registrada", "تم تسجيل الوصول", "Ingecheckt"],
  IN_PROGRESS: ["در حال انجام", "In progress", "In Bearbeitung", "En curso", "قيد التنفيذ", "Bezig"],
  COMPLETED: ["انجام شد", "Completed", "Abgeschlossen", "Completada", "مكتمل", "Voltooid"],
  CANCELLED_BY_USER: ["لغو توسط شما", "Cancelled by you", "Von Ihnen storniert", "Cancelada por ti", "ألغيته أنت", "Door jou geannuleerd"],
  CANCELLED_BY_PROVIDER: ["لغو توسط ارائه‌دهنده", "Cancelled by provider", "Vom Anbieter storniert", "Cancelada por el proveedor", "ألغاه مقدم الخدمة", "Door aanbieder geannuleerd"],
  NO_SHOW: ["عدم حضور", "No-show", "Nicht erschienen", "No presentado", "عدم الحضور", "Niet verschenen"],
};

const UNKNOWN_STATUS = ["وضعیت نامشخص", "Status unavailable", "Status nicht verfügbar", "Estado no disponible", "الحالة غير متاحة", "Status niet beschikbaar"] as const;

export function bookingStatusLabel(status: string, locale: RouteLocale | boolean): string {
  return BOOKING_STATUS[status]?.[localeIndex(locale)] ?? UNKNOWN_STATUS[localeIndex(locale)];
}

export function bookingStatusTone(status: string): "success" | "attention" | "neutral" | "urgent" {
  if (status === "CONFIRMED" || status === "COMPLETED" || status === "CHECKED_IN" || status === "IN_PROGRESS") return "success";
  if (status === "REQUESTED" || status === "AWAITING_PAYMENT" || status === "PENDING_CONFIRMATION") return "attention";
  if (status === "REJECTED" || status === "NO_SHOW" || status === "CANCELLED_BY_PROVIDER") return "urgent";
  return "neutral";
}

const PAYMENT_MODE: Record<string, [string, string, string, string, string, string]> = {
  NONE: ["بدون پرداخت آنلاین", "No online payment", "Keine Onlinezahlung", "Sin pago en línea", "دون دفع عبر الإنترنت", "Geen online betaling"],
  PAY_AT_PROVIDER: ["پرداخت در محل", "Pay at the provider", "Zahlung beim Anbieter", "Pago al proveedor", "الدفع لدى مقدم الخدمة", "Betalen bij de aanbieder"],
  FULL_PREPAYMENT: ["پرداخت کامل آنلاین", "Full online prepayment", "Vollständige Online-Vorauszahlung", "Pago anticipado completo en línea", "دفع مسبق كامل عبر الإنترنت", "Volledige vooruitbetaling online"],
  DEPOSIT: ["پیش‌پرداخت آنلاین", "Online deposit", "Online-Anzahlung", "Anticipo en línea", "عربون عبر الإنترنت", "Online aanbetaling"],
};

function localeIndex(locale: RouteLocale | boolean): 0 | 1 | 2 | 3 {
  if (locale === true || locale === "fa") return 0;
  if (locale === false || locale === "en") return 1;
  return locale === "de" ? 2 : 3;
}

const UNKNOWN_PAYMENT_MODE = ["روش پرداخت نامشخص", "Payment method unavailable", "Zahlungsmethode nicht verfügbar", "Método de pago no disponible", "طريقة الدفع غير متاحة", "Betaalmethode niet beschikbaar"] as const;

export function paymentModeLabel(mode: string, locale: RouteLocale | boolean): string {
  return PAYMENT_MODE[mode]?.[localeIndex(locale)] ?? UNKNOWN_PAYMENT_MODE[localeIndex(locale)];
}

export const TIMELINE_ACTOR: Record<string, [string, string]> = {
  USER: ["شما", "You"],
  PROVIDER: ["ارائه‌دهنده", "Provider"],
  SYSTEM: ["سیستم", "System"],
  ADMIN: ["پشتیبانی", "Support"],
};
