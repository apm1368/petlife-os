/**
 * Sample data for the PET LIFE CRM workspace.
 *
 * IMPORTANT: every record below is invented for UI development. Nothing here
 * is read from or written to the API, and the workspace labels itself as
 * demo data on screen so a figure from this file can never be mistaken for a
 * real business number. When the CRM gets a backend, this module is the only
 * thing that should need deleting.
 *
 * Deliberately deterministic — no Math.random() — so the same rows render on
 * the server and the client, and a screenshot taken today matches one taken
 * tomorrow.
 */

export type LeadStage = "new" | "contacted" | "demo" | "negotiation" | "won" | "lost";
export type LeadKind = "clinic" | "grooming" | "petshop" | "boarding" | "trainer";
export type PlanCode = "free" | "plus" | "premium";
export type UpgradeStage = "identified" | "reached" | "trial" | "invoiced" | "converted" | "declined";
export type TicketStatus = "open" | "waiting" | "resolved" | "closed";
export type TicketPriority = "low" | "normal" | "high" | "urgent";
export type CallResult = "answered" | "no_answer" | "callback" | "rejected";
export type QaStatus = "pending" | "reviewed";

export interface CrmAgent {
  id: string;
  name: string;
  team: "acquisition" | "success";
  role: "agent" | "lead";
}

export interface Lead {
  id: string;
  name: string;
  kind: LeadKind;
  contactName: string;
  phone: string;
  city: string;
  source: string;
  stage: LeadStage;
  score: number;
  ownerId: string;
  /** Days since the lead was created, so the list reads the same on any date. */
  ageDays: number;
  lastTouchDays: number;
  potentialMonthlyIrr: number;
  note: string;
  lostReason?: string;
}

export interface Household {
  id: string;
  name: string;
  city: string;
  pets: { name: string; species: "سگ" | "گربه" | "پرنده" | "خزنده" }[];
  plan: PlanCode;
  joinedMonthsAgo: number;
  bookings: number;
  orders: number;
  lifetimeIrr: number;
  npsScore: number | null;
  ownerId: string;
  healthScore: number;
}

export interface Upgrade {
  id: string;
  householdId: string;
  fromPlan: PlanCode;
  toPlan: PlanCode;
  stage: UpgradeStage;
  ownerId: string;
  monthlyIrr: number;
  reason: string;
  lastTouchDays: number;
}

export interface Ticket {
  id: string;
  subject: string;
  householdId: string;
  category: "billing" | "booking" | "health" | "shop" | "account";
  status: TicketStatus;
  priority: TicketPriority;
  ownerId: string;
  ageHours: number;
  firstResponseMins: number | null;
}

export interface CrmCall {
  id: string;
  agentId: string;
  householdId: string | null;
  leadId: string | null;
  direction: "in" | "out";
  result: CallResult;
  durationSec: number;
  qaStatus: QaStatus;
  qaScore: number | null;
  daysAgo: number;
}

export interface FollowUp {
  id: string;
  title: string;
  ownerId: string;
  dueInDays: number;
  linkedLabel: string;
  done: boolean;
}

/** Lists the UI indexes into directly; the type states they always have a first element. */
type NonEmpty<T> = [T, ...T[]];

export const PLAN_LABEL: Record<PlanCode, string> = { free: "رایگان", plus: "پلاس", premium: "پرمیوم" };

export const LEAD_KIND_LABEL: Record<LeadKind, string> = {
  clinic: "کلینیک دامپزشکی",
  grooming: "آرایش حیوانات",
  petshop: "پت‌شاپ",
  boarding: "نگهداری و پانسیون",
  trainer: "مربی آموزش",
};

export const LEAD_STAGE_LABEL: Record<LeadStage, string> = {
  new: "جدید",
  contacted: "تماس گرفته شد",
  demo: "جلسه دمو",
  negotiation: "مذاکره",
  won: "قرارداد بسته شد",
  lost: "از دست رفت",
};

/** The order the pipeline is drawn in; `lost` sits outside the funnel. */
export const LEAD_PIPELINE: LeadStage[] = ["new", "contacted", "demo", "negotiation", "won"];

export const UPGRADE_STAGE_LABEL: Record<UpgradeStage, string> = {
  identified: "شناسایی شد",
  reached: "تماس گرفته شد",
  trial: "دوره آزمایشی",
  invoiced: "صورتحساب صادر شد",
  converted: "ارتقا یافت",
  declined: "رد شد",
};

export const UPGRADE_PIPELINE: UpgradeStage[] = ["identified", "reached", "trial", "invoiced", "converted"];

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  open: "باز",
  waiting: "در انتظار مشتری",
  resolved: "حل شد",
  closed: "بسته شد",
};

export const TICKET_PRIORITY_LABEL: Record<TicketPriority, string> = {
  low: "کم",
  normal: "عادی",
  high: "زیاد",
  urgent: "فوری",
};

export const TICKET_CATEGORY_LABEL: Record<Ticket["category"], string> = {
  billing: "مالی و پرداخت",
  booking: "رزرو نوبت",
  health: "پرونده سلامت",
  shop: "فروشگاه",
  account: "حساب کاربری",
};

export const CALL_RESULT_LABEL: Record<CallResult, string> = {
  answered: "پاسخ داده شد",
  no_answer: "بی‌پاسخ",
  callback: "تماس مجدد",
  rejected: "رد تماس",
};

export const LEAD_SOURCES = ["جست‌وجوی گوگل", "معرفی همکار", "اینستاگرام", "تماس ورودی", "نمایشگاه", "بازاریابی تلفنی"];

export const LOST_REASONS = ["قیمت بالا", "همکاری با رقیب", "نیاز نداشت", "پاسخ نداد", "خارج از پوشش جغرافیایی"];

export const AGENTS: NonEmpty<CrmAgent> = [
  { id: "a1", name: "نگار موسوی", team: "acquisition", role: "lead" },
  { id: "a2", name: "سینا رحیمی", team: "acquisition", role: "agent" },
  { id: "a3", name: "مریم کاظمی", team: "acquisition", role: "agent" },
  { id: "a4", name: "امیر دلاوری", team: "success", role: "lead" },
  { id: "a5", name: "پریسا نادری", team: "success", role: "agent" },
];

export const LEADS: Lead[] = [
  { id: "L-1042", name: "کلینیک دامپزشکی مهر", kind: "clinic", contactName: "دکتر سعید مرادی", phone: "۰۲۱–۲۲۳۴۵۶۷۸", city: "تهران", source: "معرفی همکار", stage: "negotiation", score: 86, ownerId: "a1", ageDays: 12, lastTouchDays: 1, potentialMonthlyIrr: 48_000_000, note: "دو شعبه دارد، روی تعرفه کمیسیون مذاکره می‌کنیم." },
  { id: "L-1041", name: "پت‌شاپ هایپرپت", kind: "petshop", contactName: "رضا شریفی", phone: "۰۲۱–۸۸۹۹۱۲۳۴", city: "تهران", source: "اینستاگرام", stage: "demo", score: 72, ownerId: "a2", ageDays: 9, lastTouchDays: 2, potentialMonthlyIrr: 26_500_000, note: "جلسه دمو سه‌شنبه، روی موجودی انبار حساس است." },
  { id: "L-1040", name: "سالن آرایش پاپیون", kind: "grooming", contactName: "الهه صادقی", phone: "۰۳۱–۳۶۷۸۹۰۱۲", city: "اصفهان", source: "جست‌وجوی گوگل", stage: "contacted", score: 64, ownerId: "a3", ageDays: 6, lastTouchDays: 3, potentialMonthlyIrr: 14_000_000, note: "منتظر تأیید شریکش است." },
  { id: "L-1039", name: "پانسیون خانه پت", kind: "boarding", contactName: "حامد یوسفی", phone: "۰۵۱–۳۷۱۲۳۴۵۶", city: "مشهد", source: "نمایشگاه", stage: "won", score: 91, ownerId: "a1", ageDays: 21, lastTouchDays: 4, potentialMonthlyIrr: 35_000_000, note: "قرارداد امضا شد، در حال راه‌اندازی پروفایل." },
  { id: "L-1038", name: "کلینیک شبانه‌روزی آرام", kind: "clinic", contactName: "دکتر نازنین فتحی", phone: "۰۷۱–۳۲۴۵۶۷۸۹", city: "شیراز", source: "تماس ورودی", stage: "new", score: 58, ownerId: "a2", ageDays: 2, lastTouchDays: 2, potentialMonthlyIrr: 41_000_000, note: "تماس ورودی از صفحه ثبت‌نام ارائه‌دهنده." },
  { id: "L-1037", name: "مرکز آموزش سگ آلفا", kind: "trainer", contactName: "بهرام کریمی", phone: "۰۲۶–۳۴۵۶۷۸۹۰", city: "کرج", source: "بازاریابی تلفنی", stage: "lost", score: 33, ownerId: "a3", ageDays: 30, lastTouchDays: 11, potentialMonthlyIrr: 9_000_000, note: "با پلتفرم دیگری قرارداد بست.", lostReason: "همکاری با رقیب" },
  { id: "L-1036", name: "پت‌شاپ چهارپا", kind: "petshop", contactName: "سمیرا اکبری", phone: "۰۲۱–۴۴۵۵۶۶۷۷", city: "تهران", source: "اینستاگرام", stage: "contacted", score: 69, ownerId: "a2", ageDays: 5, lastTouchDays: 1, potentialMonthlyIrr: 18_500_000, note: "درخواست فهرست قیمت کرد." },
  { id: "L-1035", name: "کلینیک دامپزشکی بهار", kind: "clinic", contactName: "دکتر مهدی رستمی", phone: "۰۴۱–۳۳۴۵۶۷۸۹", city: "تبریز", source: "معرفی همکار", stage: "demo", score: 78, ownerId: "a1", ageDays: 8, lastTouchDays: 2, potentialMonthlyIrr: 31_000_000, note: "روی یکپارچگی با نرم‌افزار فعلی‌شان سؤال دارد." },
  { id: "L-1034", name: "سالن آرایش می‌مو", kind: "grooming", contactName: "کیانا حسینی", phone: "۰۲۱–۲۶۷۸۹۰۱۲", city: "تهران", source: "جست‌وجوی گوگل", stage: "new", score: 52, ownerId: "a3", ageDays: 1, lastTouchDays: 1, potentialMonthlyIrr: 11_000_000, note: "فرم تماس را از صفحه خدمات پر کرد." },
  { id: "L-1033", name: "پانسیون سبز", kind: "boarding", contactName: "فرهاد نیکو", phone: "۰۱۱–۳۳۲۲۱۱۰۰", city: "ساری", source: "نمایشگاه", stage: "negotiation", score: 74, ownerId: "a2", ageDays: 15, lastTouchDays: 5, potentialMonthlyIrr: 22_000_000, note: "درخواست تخفیف سه ماه اول." },
];

export const HOUSEHOLDS: Household[] = [
  { id: "H-5012", name: "خانواده احمدی", city: "تهران", pets: [{ name: "بادوم", species: "سگ" }, { name: "پشمک", species: "گربه" }], plan: "plus", joinedMonthsAgo: 14, bookings: 11, orders: 23, lifetimeIrr: 184_500_000, npsScore: 9, ownerId: "a4", healthScore: 88 },
  { id: "H-5011", name: "خانواده رضایی", city: "اصفهان", pets: [{ name: "شادی", species: "سگ" }], plan: "free", joinedMonthsAgo: 3, bookings: 2, orders: 4, lifetimeIrr: 21_000_000, npsScore: 7, ownerId: "a5", healthScore: 54 },
  { id: "H-5010", name: "خانواده کریمی", city: "تهران", pets: [{ name: "میو", species: "گربه" }, { name: "ملوس", species: "گربه" }, { name: "طوطی", species: "پرنده" }], plan: "premium", joinedMonthsAgo: 22, bookings: 28, orders: 41, lifetimeIrr: 412_000_000, npsScore: 10, ownerId: "a4", healthScore: 95 },
  { id: "H-5009", name: "خانواده موسوی", city: "شیراز", pets: [{ name: "رکس", species: "سگ" }], plan: "free", joinedMonthsAgo: 1, bookings: 1, orders: 0, lifetimeIrr: 3_200_000, npsScore: null, ownerId: "a5", healthScore: 31 },
  { id: "H-5008", name: "خانواده نوری", city: "مشهد", pets: [{ name: "سیمبا", species: "گربه" }], plan: "plus", joinedMonthsAgo: 8, bookings: 6, orders: 12, lifetimeIrr: 76_400_000, npsScore: 8, ownerId: "a4", healthScore: 72 },
  { id: "H-5007", name: "خانواده جعفری", city: "کرج", pets: [{ name: "لاکی", species: "سگ" }, { name: "کوکو", species: "پرنده" }], plan: "free", joinedMonthsAgo: 6, bookings: 4, orders: 7, lifetimeIrr: 38_900_000, npsScore: 6, ownerId: "a5", healthScore: 61 },
  { id: "H-5006", name: "خانواده صادقی", city: "تبریز", pets: [{ name: "آیدا", species: "خزنده" }], plan: "plus", joinedMonthsAgo: 11, bookings: 3, orders: 15, lifetimeIrr: 54_100_000, npsScore: 5, ownerId: "a4", healthScore: 47 },
  { id: "H-5005", name: "خانواده حسینی", city: "تهران", pets: [{ name: "پونه", species: "گربه" }, { name: "نارنج", species: "گربه" }], plan: "premium", joinedMonthsAgo: 19, bookings: 22, orders: 33, lifetimeIrr: 298_000_000, npsScore: 9, ownerId: "a4", healthScore: 91 },
];

export const UPGRADES: Upgrade[] = [
  { id: "U-311", householdId: "H-5011", fromPlan: "free", toPlan: "plus", stage: "trial", ownerId: "a5", monthlyIrr: 4_900_000, reason: "به سقف ۲ حیوان رسیده است.", lastTouchDays: 2 },
  { id: "U-310", householdId: "H-5007", fromPlan: "free", toPlan: "plus", stage: "reached", ownerId: "a5", monthlyIrr: 4_900_000, reason: "فضای پرونده سلامت پر شده.", lastTouchDays: 4 },
  { id: "U-309", householdId: "H-5008", fromPlan: "plus", toPlan: "premium", stage: "invoiced", ownerId: "a4", monthlyIrr: 9_800_000, reason: "درخواست پشتیبانی ویژه داشت.", lastTouchDays: 1 },
  { id: "U-308", householdId: "H-5006", fromPlan: "plus", toPlan: "premium", stage: "identified", ownerId: "a4", monthlyIrr: 9_800_000, reason: "مصرف بالای بارگذاری مدارک.", lastTouchDays: 7 },
  { id: "U-307", householdId: "H-5009", fromPlan: "free", toPlan: "plus", stage: "declined", ownerId: "a5", monthlyIrr: 4_900_000, reason: "تازه عضو شده، هنوز نیاز ندارد.", lastTouchDays: 9 },
  { id: "U-306", householdId: "H-5012", fromPlan: "plus", toPlan: "premium", stage: "converted", ownerId: "a4", monthlyIrr: 9_800_000, reason: "خانوار چندحیوانی با رزرو منظم.", lastTouchDays: 3 },
];

export const TICKETS: Ticket[] = [
  { id: "T-8871", subject: "کسر دوباره هزینه اشتراک", householdId: "H-5012", category: "billing", status: "open", priority: "urgent", ownerId: "a4", ageHours: 5, firstResponseMins: 18 },
  { id: "T-8870", subject: "نوبت دامپزشک لغو شد ولی تأیید نیامد", householdId: "H-5008", category: "booking", status: "waiting", priority: "high", ownerId: "a5", ageHours: 26, firstResponseMins: 42 },
  { id: "T-8869", subject: "بارگذاری آزمایش خون خطا می‌دهد", householdId: "H-5010", category: "health", status: "open", priority: "normal", ownerId: "a4", ageHours: 9, firstResponseMins: 31 },
  { id: "T-8868", subject: "سفارش غذا هنوز ارسال نشده", householdId: "H-5005", category: "shop", status: "open", priority: "high", ownerId: "a5", ageHours: 48, firstResponseMins: 55 },
  { id: "T-8867", subject: "ورود با شماره موبایل کار نمی‌کند", householdId: "H-5009", category: "account", status: "resolved", priority: "normal", ownerId: "a4", ageHours: 72, firstResponseMins: 12 },
  { id: "T-8866", subject: "درخواست فاکتور رسمی", householdId: "H-5006", category: "billing", status: "closed", priority: "low", ownerId: "a5", ageHours: 120, firstResponseMins: 90 },
  { id: "T-8865", subject: "تغییر پلن از پلاس به پرمیوم", householdId: "H-5008", category: "billing", status: "waiting", priority: "normal", ownerId: "a4", ageHours: 14, firstResponseMins: 25 },
];

export const CALLS: CrmCall[] = [
  { id: "C-9921", agentId: "a1", householdId: null, leadId: "L-1042", direction: "out", result: "answered", durationSec: 412, qaStatus: "reviewed", qaScore: 92, daysAgo: 1 },
  { id: "C-9920", agentId: "a2", householdId: null, leadId: "L-1041", direction: "out", result: "callback", durationSec: 96, qaStatus: "pending", qaScore: null, daysAgo: 1 },
  { id: "C-9919", agentId: "a4", householdId: "H-5012", leadId: null, direction: "in", result: "answered", durationSec: 638, qaStatus: "reviewed", qaScore: 78, daysAgo: 2 },
  { id: "C-9918", agentId: "a5", householdId: "H-5011", leadId: null, direction: "out", result: "no_answer", durationSec: 0, qaStatus: "pending", qaScore: null, daysAgo: 2 },
  { id: "C-9917", agentId: "a3", householdId: null, leadId: "L-1040", direction: "out", result: "answered", durationSec: 284, qaStatus: "reviewed", qaScore: 85, daysAgo: 3 },
  { id: "C-9916", agentId: "a4", householdId: "H-5008", leadId: null, direction: "in", result: "answered", durationSec: 521, qaStatus: "pending", qaScore: null, daysAgo: 3 },
  { id: "C-9915", agentId: "a2", householdId: null, leadId: "L-1038", direction: "in", result: "answered", durationSec: 197, qaStatus: "pending", qaScore: null, daysAgo: 4 },
  { id: "C-9914", agentId: "a5", householdId: "H-5007", leadId: null, direction: "out", result: "rejected", durationSec: 8, qaStatus: "reviewed", qaScore: 60, daysAgo: 5 },
];

export const FOLLOW_UPS: FollowUp[] = [
  { id: "F-21", title: "ارسال پیش‌فاکتور کمیسیون", ownerId: "a1", dueInDays: 0, linkedLabel: "کلینیک دامپزشکی مهر", done: false },
  { id: "F-22", title: "پیگیری جلسه دمو", ownerId: "a2", dueInDays: 1, linkedLabel: "پت‌شاپ هایپرپت", done: false },
  { id: "F-23", title: "تماس پایان دوره آزمایشی", ownerId: "a5", dueInDays: 2, linkedLabel: "خانواده رضایی", done: false },
  { id: "F-24", title: "بررسی تیکت مالی باز", ownerId: "a4", dueInDays: 0, linkedLabel: "خانواده احمدی", done: false },
  { id: "F-25", title: "ثبت نتیجه مذاکره", ownerId: "a2", dueInDays: 3, linkedLabel: "پانسیون سبز", done: true },
];

/** Six months of headline figures, oldest first — drives the reports chart. */
export const MONTHLY_TREND: NonEmpty<{ month: string; newLeads: number; won: number; upgrades: number; revenueIrr: number }> = [
  { month: "فروردین", newLeads: 18, won: 4, upgrades: 6, revenueIrr: 62_000_000 },
  { month: "اردیبهشت", newLeads: 24, won: 6, upgrades: 9, revenueIrr: 91_000_000 },
  { month: "خرداد", newLeads: 21, won: 5, upgrades: 7, revenueIrr: 78_000_000 },
  { month: "تیر", newLeads: 29, won: 9, upgrades: 12, revenueIrr: 134_000_000 },
  { month: "مرداد", newLeads: 33, won: 8, upgrades: 14, revenueIrr: 151_000_000 },
  { month: "شهریور", newLeads: 27, won: 11, upgrades: 16, revenueIrr: 178_000_000 },
];

export function agentName(id: string): string {
  return AGENTS.find((a) => a.id === id)?.name ?? "—";
}

export function householdName(id: string): string {
  return HOUSEHOLDS.find((h) => h.id === id)?.name ?? "—";
}

export function leadName(id: string): string {
  return LEADS.find((l) => l.id === id)?.name ?? "—";
}

import { formatNumber } from "../console-ui";

/** IRR with Persian digits and thousands separators — the product's only stored currency. */
export function formatIrr(amount: number): string {
  return new Intl.NumberFormat("fa-IR").format(amount) + " ریال";
}

export { formatNumber } from "../console-ui";

export function formatDuration(seconds: number): string {
  if (seconds === 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${formatNumber(m)}:${String(s).padStart(2, "0")}`;
}

export function relativeDays(days: number): string {
  if (days === 0) return "امروز";
  if (days === 1) return "دیروز";
  return `${formatNumber(days)} روز پیش`;
}

export function dueLabel(days: number): string {
  if (days === 0) return "امروز";
  if (days === 1) return "فردا";
  return `${formatNumber(days)} روز دیگر`;
}
