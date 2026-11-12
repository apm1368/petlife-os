import type { PetOverviewAttentionDto, PetOverviewEventDto, PetOverviewSeverity } from "@petlife/types";

type Locale = "fa" | "en" | "de" | "es" | "ar" | "nl";
const pick = (values: readonly [string, string, string, string, string, string], locale: Locale) => values[{ fa: 0, en: 1, de: 2, es: 3, ar: 4, nl: 5 }[locale]]!;

/** What the server's attention severity means to an owner — the code itself is never shown. */
const SEVERITY: Record<PetOverviewSeverity, readonly [string, string, string, string, string, string]> = {
  INFORMATIONAL: ["برای اطلاع", "For your information", "Zur Information", "A título informativo", "للعلم", "Ter informatie"],
  ATTENTION: ["نیازمند توجه", "Needs attention", "Erfordert Aufmerksamkeit", "Requiere atención", "يحتاج إلى انتباه", "Vraagt aandacht"],
  CONCERN: ["نگران‌کننده", "Concern", "Bedenklich", "Preocupante", "مثير للقلق", "Zorgwekkend"],
  URGENT: ["فوری", "Urgent", "Dringend", "Urgente", "عاجل", "Dringend"],
  EMERGENCY: ["اورژانسی", "Emergency", "Notfall", "Emergencia", "طارئ", "Spoed"],
};
export const severityLabel = (severity: PetOverviewSeverity, locale: Locale) => pick(SEVERITY[severity] ?? [severity, severity, severity, severity], locale);
export const severityTone = (severity: PetOverviewSeverity) => (severity === "INFORMATIONAL" ? ("neutral" as const) : ("attention" as const));
export function severityBarClass(severity: PetOverviewAttentionDto["severity"]) {
  if (severity === "EMERGENCY" || severity === "URGENT") return "bg-state-urgent";
  if (severity === "CONCERN") return "bg-state-higher-concern";
  if (severity === "ATTENTION") return "bg-state-attention";
  return "bg-brand-solid";
}

const ATTENTION_TITLE: Record<string, readonly [string, string, string, string, string, string]> = {
  VACCINATION_OVERDUE: ["موعد واکسیناسیون گذشته است.", "A vaccination is overdue.", "Eine Impfung ist überfällig.", "Hay una vacuna vencida.", "أحد التطعيمات متأخر عن موعده.", "Een vaccinatie is achterstallig."],
  VACCINATION_DUE_SOON: ["موعد واکسیناسیون نزدیک است.", "A vaccination is due soon.", "Eine Impfung ist bald fällig.", "Pronto vence una vacuna.", "موعد أحد التطعيمات قريب.", "Een vaccinatie is binnenkort nodig."],
  HEALTH_PROFILE_INCOMPLETE: ["پروفایل سلامت کامل نشده است.", "The health profile is incomplete.", "Das Gesundheitsprofil ist unvollständig.", "El perfil de salud está incompleto.", "الملف الصحي غير مكتمل.", "Het gezondheidsprofiel is onvolledig."],
};
export const attentionTitle = (title: string, locale: Locale) => (ATTENTION_TITLE[title] ? pick(ATTENTION_TITLE[title]!, locale) : title);

const EVENT_TITLE: Record<string, readonly [string, string, string, string, string, string]> = {
  "careCalendar.event.vetAppointment": ["وقت دامپزشکی", "Vet appointment", "Tierarzttermin", "Cita veterinaria", "موعد لدى الطبيب البيطري", "Afspraak bij de dierenarts"],
  "careCalendar.event.grooming": ["آرایش و نظافت", "Grooming", "Fellpflege", "Aseo", "التجميل", "Vachtverzorging"],
  "careCalendar.event.training": ["جلسه آموزش", "Training session", "Trainingseinheit", "Sesión de adiestramiento", "جلسة تدريب", "Trainingssessie"],
  "careCalendar.event.walk": ["پیاده‌روی", "Walk", "Spaziergang", "Paseo", "نزهة", "Wandeling"],
  "careCalendar.event.sitting": ["نگهداری", "Pet sitting", "Haustierbetreuung", "Cuidado de mascotas", "مجالسة الحيوانات الأليفة", "Huisdieroppas"],
  "careCalendar.event.boarding": ["پانسیون", "Boarding", "Tierpension", "Residencia para mascotas", "الإيواء", "Dierenpension"],
  "careCalendar.event.petTaxi": ["تاکسی حیوانات", "Pet taxi", "Haustiertaxi", "Taxi para mascotas", "تاكسي الحيوانات الأليفة", "Dierentaxi"],
  MEMORY: ["خاطره", "Memory", "Erinnerung", "Recuerdo", "ذكرى", "Herinnering"],
};
export const eventTitle = (title: string, locale: Locale) => (EVENT_TITLE[title] ? pick(EVENT_TITLE[title]!, locale) : title);

export function eventSourceLabel(item: PetOverviewEventDto, locale: Locale) {
  if (item.sourceType === "PROVIDER" || item.sourceType === "CLINIC") return pick(["ارائه‌دهنده", "Provider", "Anbieter", "Proveedor", "مقدم الخدمة", "Aanbieder"], locale);
  if (item.sourceType === "OWNER" || item.sourceType === "HOUSEHOLD_MEMBER") return pick(["مالک/خانواده", "Owner/household", "Halter/Haushalt", "Tutor/a u hogar", "المالك/الأسرة", "Eigenaar/huishouden"], locale);
  if (item.type === "MEMORY") return pick(["خاطره", "Memory", "Erinnerung", "Recuerdo", "ذكرى", "Herinnering"], locale);
  if (item.type === "CARE") return pick(["مراقبت", "Care", "Pflege", "Cuidados", "الرعاية", "Zorg"], locale);
  return item.type === "BOOKING" ? pick(["نوبت", "Booking", "Termin", "Cita", "حجز", "Boeking"], locale) : pick(["سیستم", "System", "System", "Sistema", "النظام", "Systeem"], locale);
}

export function formatOverviewDate(value: string, locale: Locale) {
  const intlLocale = { fa: "fa-IR-u-ca-persian", en: "en-US", de: "de-DE", es: "es-ES", ar: "ar", nl: "nl-NL" }[locale];
  return new Intl.DateTimeFormat(intlLocale, { dateStyle: "medium", timeZone: "Asia/Tehran" }).format(new Date(value));
}

/**
 * A lab panel reported on one day arrives as one event per test; nine rows of "HGB", "PLT"… drown the
 * overview. Same-day lab results collapse into one "Lab results · n tests" row that opens the lab list.
 * Presentation only — every result keeps its own record and detail page.
 */
export function collapseLabPanels(items: PetOverviewEventDto[], locale: Locale): PetOverviewEventDto[] {
  const day = (iso: string) => new Date(new Date(iso).getTime() + 3.5 * 3_600_000).toISOString().slice(0, 10);
  const out: PetOverviewEventDto[] = [];
  for (const item of items) {
    if (item.type !== "LAB") { out.push(item); continue; }
    const sameDay = items.filter((other) => other.type === "LAB" && day(other.occurredAt) === day(item.occurredAt));
    if (sameDay.length < 2) { out.push(item); continue; }
    if (sameDay[0] !== item) continue; // the panel row is emitted once, where its first test appears
    const intlLocale = { fa: "fa-IR", en: "en-US", de: "de-DE", es: "es-ES", ar: "ar", nl: "nl-NL" }[locale];
    const n = new Intl.NumberFormat(intlLocale).format(sameDay.length);
    out.push({ ...item, id: `panel-${day(item.occurredAt)}`, title: pick([`نتایج آزمایش — ${n} مورد`, `Lab results — ${n} tests`, `Laborergebnisse — ${n} Tests`, `Resultados de laboratorio — ${n} pruebas`, `نتائج المختبر — ${n} فحوصات`, `Labuitslagen — ${n} tests`], locale), href: "/health/labs" });
  }
  return out;
}

/**
 * Folds the owner's care reminders (care center, with server-derived DUE/OVERDUE state) into the overview's
 * attention and upcoming lists. Shared by the pet profile and the member dashboard so both count the same things.
 */
export function mergeCareIntoOverview<C extends { id: string; state: string; dueAt: string; snoozedUntil?: string | null; title: string; type?: string; source?: string }>(
  overview: { attention: PetOverviewAttentionDto[]; upcoming: PetOverviewEventDto[] },
  care: C[],
  title: (item: C) => string,
): { attention: PetOverviewAttentionDto[]; upcoming: PetOverviewEventDto[] } {
  const careAttention: PetOverviewAttentionDto[] = care
    .filter((item) => item.state === "OVERDUE" || item.state === "DUE")
    .map((item) => ({ id: `care-${item.id}`, severity: item.state === "OVERDUE" ? "ATTENTION" : "INFORMATIONAL", title: title(item), dueAt: item.dueAt, href: `/care/${item.id}` }));
  const careUpcoming: PetOverviewEventDto[] = care
    .filter((item) => item.state === "UPCOMING" || item.state === "SNOOZED")
    .slice(0, 3)
    .map((item) => ({ id: `care-${item.id}`, type: "CARE", title: title(item), occurredAt: item.snoozedUntil ?? item.dueAt, sourceType: null, providerName: null, href: `/care/${item.id}`, status: item.state }));
  return {
    attention: [...careAttention.filter((i) => i.severity === "ATTENTION"), ...overview.attention, ...careAttention.filter((i) => i.severity !== "ATTENTION")],
    upcoming: [...overview.upcoming, ...careUpcoming].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)),
  };
}
