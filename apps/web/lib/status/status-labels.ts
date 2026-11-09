import type { StatusTone } from "@petlife/ui";

/**
 * One status vocabulary for the whole product: a server code → a human label (fa/en) and a tone.
 * The code stays the source of truth; only its presentation changes. Domains override the generic
 * meaning where the same code reads differently (a lab result is "final", a plan is "active").
 * An unknown code falls back to a readable form of itself rather than a raw constant.
 */
export type StatusDomain =
  | "generic" | "visit" | "lab" | "labFlag" | "referral" | "plan" | "observation" | "source" | "vaccination" | "lifecycle"
  | "imaging" | "order" | "subscription" | "marketplace" | "sync" | "booking" | "travelBooking" | "payment" | "role";

type Entry = readonly [fa: string, en: string, tone: StatusTone];

const GENERIC: Record<string, Entry> = {
  ACTIVE: ["فعال", "Active", "success"],
  // Partner verification and settlement states (ERP-C/E), shown in admin lists and selects.
  NOT_STARTED: ["شروع‌نشده", "Not started", "neutral"],
  SUBMITTED: ["ارسال‌شده", "Submitted", "attention"],
  NEEDS_INFORMATION: ["نیازمند اطلاعات", "Needs information", "attention"],
  UNDER_REVIEW: ["در حال بررسی", "Under review", "attention"],
  VERIFIED: ["تأییدشده", "Verified", "success"],
  SUSPENDED: ["تعلیق‌شده", "Suspended", "urgent"],
  CALCULATED: ["محاسبه‌شده", "Calculated", "neutral"],
  RECONCILIATION_REQUIRED: ["نیازمند تطبیق", "Reconciliation required", "urgent"],
  INACTIVE: ["غیرفعال", "Inactive", "neutral"],
  PENDING: ["در انتظار", "Pending", "attention"],
  DRAFT: ["پیش‌نویس", "Draft", "neutral"],
  CREATED: ["ثبت‌شده", "Created", "neutral"],
  SENT: ["ارسال‌شده", "Sent", "neutral"],
  ACCEPTED: ["پذیرفته‌شده", "Accepted", "success"],
  SCHEDULED: ["برنامه‌ریزی‌شده", "Scheduled", "neutral"],
  IN_PROGRESS: ["در جریان", "In progress", "attention"],
  COMPLETED: ["انجام‌شده", "Completed", "success"],
  CANCELLED: ["لغوشده", "Cancelled", "neutral"],
  REJECTED: ["پذیرفته نشد", "Declined", "urgent"],
  EXPIRED: ["منقضی‌شده", "Expired", "neutral"],
  PAUSED: ["متوقف", "Paused", "neutral"],
  ARCHIVED: ["بایگانی‌شده", "Archived", "neutral"],
  FAILED: ["ناموفق", "Failed", "urgent"],
  ERROR: ["خطا", "Error", "urgent"],
  AMENDED: ["اصلاح‌شده", "Amended", "neutral"],
  VOIDED: ["باطل‌شده", "Voided", "neutral"],
  RESOLVED: ["برطرف‌شده", "Resolved", "success"],
  HISTORICAL: ["سابقه", "Historical", "neutral"],
  DISCONTINUED: ["متوقف‌شده", "Discontinued", "neutral"],
  CONFIRMED: ["قطعی", "Confirmed", "success"],
  REFUNDED: ["بازپرداخت‌شده", "Refunded", "neutral"],
  PARTIALLY_REFUNDED: ["بخشی بازپرداخت شد", "Partly refunded", "neutral"],
  UNKNOWN: ["نامشخص", "Unknown", "neutral"],
};

const DOMAINS: Partial<Record<StatusDomain, Record<string, Entry>>> = {
  visit: { COMPLETED: ["تکمیل‌شده", "Completed", "success"], AMENDED: ["اصلاح‌شده", "Amended", "success"] },
  lab: { PENDING: ["در انتظار نتیجه", "Awaiting result", "attention"], FINAL: ["نتیجهٔ نهایی", "Final result", "neutral"], AMENDED: ["نتیجهٔ اصلاح‌شده", "Amended result", "neutral"] },
  labFlag: { NORMAL: ["در محدودهٔ طبیعی", "Within range", "success"], ABNORMAL: ["خارج از محدوده", "Out of range", "attention"] },
  plan: { ACTIVE: ["در حال اجرا", "Ongoing", "attention"] },
  imaging: { XRAY: ["رادیوگرافی", "X-ray", "neutral"], ULTRASOUND: ["سونوگرافی", "Ultrasound", "neutral"], CT: ["سی‌تی‌اسکن", "CT scan", "neutral"], MRI: ["ام‌آرآی", "MRI", "neutral"], OTHER: ["سایر", "Other", "neutral"] },
  observation: {
    SYMPTOM: ["نشانه", "Symptom", "neutral"], APPETITE: ["اشتها", "Appetite", "neutral"], BEHAVIOR: ["رفتار", "Behavior", "neutral"], MOBILITY: ["تحرک", "Mobility", "neutral"],
    STOOL: ["مدفوع", "Stool", "neutral"], VOMITING: ["استفراغ", "Vomiting", "neutral"], SLEEP: ["خواب", "Sleep", "neutral"], PAIN: ["درد", "Pain", "neutral"], OTHER: ["سایر", "Other", "neutral"],
  },
  source: {
    OWNER: ["ثبت مالک", "Owner", "neutral"], HOUSEHOLD_MEMBER: ["ثبت عضو خانواده", "Household member", "neutral"], PROVIDER: ["ثبت ارائه‌دهنده", "Provider", "neutral"],
    CLINIC: ["ثبت کلینیک", "Clinic", "neutral"], IMPORTED_DOCUMENT: ["از سند بارگذاری‌شده", "From a document", "neutral"], SYSTEM: ["ثبت خودکار", "Automatic", "neutral"],
  },
  vaccination: {
    UP_TO_DATE: ["به‌روز", "Up to date", "success"], DUE_SOON: ["به‌زودی سررسید", "Due soon", "attention"], OVERDUE: ["گذشته از موعد", "Overdue", "urgent"],
    UNKNOWN: ["ثبت نشده", "Not recorded", "attention"], INCOMPLETE: ["ناقص", "Incomplete", "attention"],
  },
  lifecycle: {
    ACTIVE: ["فعال", "Active", "success"], LOST: ["گم‌شده", "Lost", "urgent"], TEMPORARILY_TRANSFERRED: ["موقتاً نزد دیگری", "Temporarily with someone else", "attention"],
    DECEASED: ["درگذشته", "Passed away", "neutral"], MEMORIAL: ["یادبود", "In memory", "neutral"],
  },
  order: {
    PENDING: ["در انتظار پرداخت", "Awaiting payment", "attention"], PREPARING: ["در حال آماده‌سازی", "Preparing", "attention"],
    READY_FOR_FULFILLMENT: ["آمادهٔ ارسال", "Ready to ship", "attention"], FULFILLED: ["ارسال‌شده", "Shipped", "success"],
  },
  subscription: {
    TRIALING: ["دورهٔ آزمایشی", "Trial", "success"], PAST_DUE: ["پرداخت معوق", "Payment overdue", "urgent"], GRACE_PERIOD: ["مهلت پرداخت", "Grace period", "attention"],
    CANCEL_AT_PERIOD_END: ["لغو در پایان دوره", "Ends at period end", "attention"],
  },
  marketplace: { PENDING: ["در انتظار بررسی", "Pending review", "attention"], ERROR: ["خطای همگام‌سازی", "Sync error", "urgent"] },
  sync: { SYNCED: ["همگام", "In sync", "success"], PENDING: ["در صف همگام‌سازی", "Queued", "attention"], FAILED: ["همگام نشد", "Sync failed", "urgent"] },
  payment: { NOT_REQUIRED: ["بدون پرداخت", "No payment", "neutral"], PAID: ["پرداخت‌شده", "Paid", "success"], AUTHORIZED: ["تأییدشده", "Authorized", "neutral"], REFUND_PENDING: ["در انتظار بازپرداخت", "Refund pending", "attention"] },
  role: { OWNER: ["مدیر", "Organizer", "neutral"], FAMILY: ["عضو خانواده", "Family member", "neutral"] },
};

// Dashboard status vocabulary for locales beyond the original fa/en catalog.
// Unknown server codes remain readable and are tracked by the localization audit.
const DE_ES: Partial<Record<StatusDomain, Record<string, readonly [de: string, es: string]>>> = {
  generic: {
    ACTIVE: ["Aktiv", "Activo"], NOT_STARTED: ["Nicht begonnen", "No iniciado"], SUBMITTED: ["Eingereicht", "Enviado"],
    NEEDS_INFORMATION: ["Informationen erforderlich", "Se necesita información"], UNDER_REVIEW: ["Wird geprüft", "En revisión"], VERIFIED: ["Verifiziert", "Verificado"],
    SUSPENDED: ["Ausgesetzt", "Suspendido"], CALCULATED: ["Berechnet", "Calculado"], RECONCILIATION_REQUIRED: ["Abgleich erforderlich", "Se requiere conciliación"],
    INACTIVE: ["Inaktiv", "Inactivo"], PENDING: ["Ausstehend", "Pendiente"], DRAFT: ["Entwurf", "Borrador"], CREATED: ["Erstellt", "Creado"], SENT: ["Gesendet", "Enviado"],
    ACCEPTED: ["Angenommen", "Aceptado"], SCHEDULED: ["Geplant", "Programado"], IN_PROGRESS: ["In Bearbeitung", "En curso"], COMPLETED: ["Abgeschlossen", "Completado"],
    CANCELLED: ["Storniert", "Cancelado"], REJECTED: ["Abgelehnt", "Rechazado"], EXPIRED: ["Abgelaufen", "Caducado"], PAUSED: ["Pausiert", "En pausa"],
    ARCHIVED: ["Archiviert", "Archivado"], FAILED: ["Fehlgeschlagen", "Fallido"], ERROR: ["Fehler", "Error"], AMENDED: ["Geändert", "Modificado"],
    VOIDED: ["Ungültig", "Anulado"], RESOLVED: ["Behoben", "Resuelto"], HISTORICAL: ["Historisch", "Histórico"], DISCONTINUED: ["Eingestellt", "Interrumpido"],
    CONFIRMED: ["Bestätigt", "Confirmado"], REFUNDED: ["Erstattet", "Reembolsado"], PARTIALLY_REFUNDED: ["Teilweise erstattet", "Reembolsado parcialmente"], UNKNOWN: ["Unbekannt", "Desconocido"],
  },
  order: { PENDING: ["Zahlung ausstehend", "Pago pendiente"], PREPARING: ["Wird vorbereitet", "En preparación"], READY_FOR_FULFILLMENT: ["Versandbereit", "Listo para enviar"], FULFILLED: ["Versendet", "Enviado"] },
  lifecycle: { ACTIVE: ["Aktiv", "En activo"], LOST: ["Vermisst", "Sin localizar"], TEMPORARILY_TRANSFERRED: ["Vorübergehend bei einer anderen Person", "Temporalmente con otra persona"], DECEASED: ["Verstorben", "Ha fallecido"], MEMORIAL: ["In Erinnerung", "En memoria"] },
  subscription: { TRIALING: ["Testphase", "Prueba"], PAST_DUE: ["Zahlung überfällig", "Pago atrasado"], GRACE_PERIOD: ["Zahlungsfrist", "Periodo de gracia"], CANCEL_AT_PERIOD_END: ["Endet zum Laufzeitende", "Finaliza al terminar el periodo"] },
  vaccination: { UP_TO_DATE: ["Auf dem neuesten Stand", "Al día"], DUE_SOON: ["Bald fällig", "Vence pronto"], OVERDUE: ["Überfällig", "Vencida"], UNKNOWN: ["Status unbekannt", "Estado desconocido"], INCOMPLETE: ["Noch nicht erfasst", "Aún no registrado"] },
  source: { OWNER: ["Halterin oder Halter", "Persona responsable"], HOUSEHOLD_MEMBER: ["Haushaltsmitglied", "Miembro del hogar"], PROVIDER: ["Tierarztpraxis", "Clínica veterinaria"], CLINIC: ["Klinik", "Clínica"], IMPORTED_DOCUMENT: ["Aus Dokument", "De un documento"], SYSTEM: ["Automatisch erfasst", "Registro automático"] },
};

function entry(code: string, domain: StatusDomain): Entry | undefined {
  return DOMAINS[domain]?.[code] ?? GENERIC[code];
}

/** Readable label for a server status code. Never returns the raw constant for a known code. */
export function statusLabel(code: string | null | undefined, locale: "fa" | "en" | "de" | "es", domain: StatusDomain = "generic"): string {
  if (!code) return "";
  const e = entry(code, domain);
  if (e) {
    if (locale === "fa") return e[0];
    if (locale === "en") return e[1];
    const translated = DE_ES[domain]?.[code] ?? DE_ES.generic?.[code];
    if (translated) return locale === "de" ? translated[0] : translated[1];
  }
  // Unknown code: never silently present an English/Farsi label as a completed de/es translation.
  const words = code.toLowerCase().replace(/_/g, " ");
  if (locale === "de") return `Unbekannter Status (${words})`;
  if (locale === "es") return `Estado desconocido (${words})`;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function statusTone(code: string | null | undefined, domain: StatusDomain = "generic"): StatusTone {
  return (code && entry(code, domain)?.[2]) || "neutral";
}
