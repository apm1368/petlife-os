import type { PetOverviewAttentionDto, PetOverviewEventDto, PetOverviewSeverity } from "@petlife/types";

type Locale = "fa" | "en";
const pick = (pair: readonly [string, string], locale: Locale) => pair[locale === "fa" ? 0 : 1];

/** What the server's attention severity means to an owner — the code itself is never shown. */
const SEVERITY: Record<PetOverviewSeverity, readonly [string, string]> = {
  INFORMATIONAL: ["برای اطلاع", "For your information"],
  ATTENTION: ["نیازمند توجه", "Needs attention"],
  CONCERN: ["نگران‌کننده", "Concern"],
  URGENT: ["فوری", "Urgent"],
  EMERGENCY: ["اورژانسی", "Emergency"],
};
export const severityLabel = (severity: PetOverviewSeverity, locale: Locale) => pick(SEVERITY[severity] ?? [severity, severity], locale);
export const severityTone = (severity: PetOverviewSeverity) => (severity === "INFORMATIONAL" ? ("neutral" as const) : ("attention" as const));
export function severityBarClass(severity: PetOverviewAttentionDto["severity"]) {
  if (severity === "EMERGENCY" || severity === "URGENT") return "bg-state-urgent";
  if (severity === "CONCERN") return "bg-state-higher-concern";
  if (severity === "ATTENTION") return "bg-state-attention";
  return "bg-brand-solid";
}

const ATTENTION_TITLE: Record<string, readonly [string, string]> = {
  VACCINATION_OVERDUE: ["موعد واکسیناسیون گذشته است.", "A vaccination is overdue."],
  VACCINATION_DUE_SOON: ["موعد واکسیناسیون نزدیک است.", "A vaccination is due soon."],
  HEALTH_PROFILE_INCOMPLETE: ["پروفایل سلامت کامل نشده است.", "The health profile is incomplete."],
};
export const attentionTitle = (title: string, locale: Locale) => (ATTENTION_TITLE[title] ? pick(ATTENTION_TITLE[title]!, locale) : title);

const EVENT_TITLE: Record<string, readonly [string, string]> = {
  "careCalendar.event.vetAppointment": ["وقت دامپزشکی", "Vet appointment"],
  "careCalendar.event.grooming": ["آرایش و نظافت", "Grooming"],
  "careCalendar.event.training": ["جلسه آموزش", "Training session"],
  "careCalendar.event.walk": ["پیاده‌روی", "Walk"],
  "careCalendar.event.sitting": ["نگهداری", "Pet sitting"],
  "careCalendar.event.boarding": ["پانسیون", "Boarding"],
  "careCalendar.event.petTaxi": ["تاکسی حیوانات", "Pet taxi"],
  MEMORY: ["خاطره", "Memory"],
};
export const eventTitle = (title: string, locale: Locale) => (EVENT_TITLE[title] ? pick(EVENT_TITLE[title]!, locale) : title);

export function eventSourceLabel(item: PetOverviewEventDto, locale: Locale) {
  if (item.sourceType === "PROVIDER" || item.sourceType === "CLINIC") return pick(["ارائه‌دهنده", "Provider"], locale);
  if (item.sourceType === "OWNER" || item.sourceType === "HOUSEHOLD_MEMBER") return pick(["مالک/خانواده", "Owner/household"], locale);
  return item.type === "BOOKING" ? pick(["نوبت", "Booking"], locale) : pick(["سیستم", "System"], locale);
}

export function formatOverviewDate(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : "en-US", { dateStyle: "medium", timeZone: "Asia/Tehran" }).format(new Date(value));
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
    const n = new Intl.NumberFormat(locale === "fa" ? "fa-IR" : "en-US").format(sameDay.length);
    out.push({ ...item, id: `panel-${day(item.occurredAt)}`, title: pick([`نتایج آزمایش — ${n} مورد`, `Lab results — ${n} tests`], locale), href: "/health/labs" });
  }
  return out;
}
