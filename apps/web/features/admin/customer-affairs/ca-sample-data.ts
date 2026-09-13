/**
 * Sample data for the PET LIFE Customer Affairs console (امور مشتریان).
 *
 * IMPORTANT: every record here is invented for UI development. Nothing reads
 * from or writes to the API, and the console says so on screen, so a figure
 * from this file can never be mistaken for a real one. When the domain gets a
 * backend, this module is the only thing that should need deleting.
 *
 * Deterministic on purpose — no Math.random() — so server and client render
 * identically and screenshots stay stable.
 */

import { formatNumber } from "../console-ui";

type NonEmpty<T> = [T, ...T[]];

// --- Vocabulary -------------------------------------------------------------

export type Priority = "critical" | "high" | "normal" | "low";
export type TicketStatus = "new" | "assigned" | "in_progress" | "waiting_internal" | "resolved" | "closed" | "reopened";
export type Channel = "call_in" | "call_out" | "chat" | "email" | "app";
export type CallOutcome = "answered" | "follow_up" | "ticket_created" | "to_finance" | "to_providers" | "escalated" | "waiting_customer" | "callback" | "dropped" | "no_answer" | "wrong_number" | "unresolved";
export type Resolution = "phone_guidance" | "technical_fix" | "access_fix" | "finance_fix" | "service_replacement" | "no_action";
export type RootCause = "user_error" | "system_defect" | "process_error" | "agent_error" | "provider_issue" | "unknown";
export type EscalationUnit = "finance" | "providers" | "technical" | "supervisor";
export type CaseKind = "ticket" | "followUp" | "complaint" | "escalation";

export const PRIORITY_LABEL: Record<Priority, string> = { critical: "بحرانی", high: "بالا", normal: "متوسط", low: "پایین" };

/** SLA target in hours per priority — ticket due dates are computed straight from this. */
export const SLA_HOURS: Record<Priority, number> = { critical: 4, high: 12, normal: 24, low: 72 };

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  new: "جدید",
  assigned: "تخصیص‌یافته",
  in_progress: "در حال بررسی",
  waiting_internal: "در انتظار داخلی",
  resolved: "حل‌شده",
  closed: "بسته‌شده",
  reopened: "بازگشایی‌شده",
};

/** Statuses that still consume the SLA clock. */
export const OPEN_TICKET_STATUSES: TicketStatus[] = ["new", "assigned", "in_progress", "waiting_internal", "reopened"];

export const CHANNEL_LABEL: Record<Channel, string> = {
  call_in: "تماس ورودی",
  call_out: "تماس خروجی",
  chat: "گفتگوی آنلاین",
  email: "ایمیل",
  app: "اپلیکیشن",
};

export const CALL_OUTCOME_LABEL: Record<CallOutcome, string> = {
  answered: "پاسخ داده شد",
  follow_up: "نیازمند پیگیری",
  ticket_created: "تیکت ایجاد شد",
  to_finance: "ارجاع به مالی",
  to_providers: "ارجاع به ارائه‌دهندگان",
  escalated: "ارجاع به سطح بالاتر",
  waiting_customer: "در انتظار مشتری",
  callback: "نیازمند تماس مجدد",
  dropped: "قطع تماس",
  no_answer: "بدون پاسخ",
  wrong_number: "شماره اشتباه",
  unresolved: "حل‌نشده",
};

export const RESOLUTION_LABEL: Record<Resolution, string> = {
  phone_guidance: "راهنمایی تلفنی",
  technical_fix: "رفع فنی",
  access_fix: "اصلاح دسترسی",
  finance_fix: "ارجاع و رفع مالی",
  service_replacement: "جایگزینی سرویس",
  no_action: "بدون اقدام لازم",
};

export const ROOT_CAUSE_LABEL: Record<RootCause, string> = {
  user_error: "خطای کاربر",
  system_defect: "نقص سیستم",
  process_error: "خطای فرآیند",
  agent_error: "خطای کارشناس",
  provider_issue: "مشکل ارائه‌دهنده",
  unknown: "نامشخص",
};

export const ESCALATION_UNIT_LABEL: Record<EscalationUnit, string> = {
  finance: "واحد مالی",
  providers: "واحد ارائه‌دهندگان",
  technical: "واحد فنی",
  supervisor: "سرپرست امور مشتریان",
};

export const CASE_KIND_LABEL: Record<CaseKind, string> = {
  ticket: "تیکت",
  followUp: "پیگیری",
  complaint: "شکایت",
  escalation: "ارجاع",
};

/**
 * The contact-reason tree, rewritten for what PET LIFE households actually
 * call about. Settings renders this same constant, so the taxonomy shown there
 * is genuinely the one the rest of the console filters by.
 */
export const CONTACT_REASONS: NonEmpty<{ key: string; label: string; children: string[] }> = [
  { key: "info", label: "اطلاعات", children: ["خدمات و تعرفه", "پوشش شهری", "نحوه رزرو", "پلن‌های اشتراک", "کار با اپلیکیشن"] },
  { key: "booking", label: "رزرو نوبت", children: ["ثبت نوبت", "تغییر زمان", "لغو نوبت", "عدم حضور ارائه‌دهنده", "تأیید نشدن نوبت"] },
  { key: "health", label: "پرونده سلامت", children: ["بارگذاری مدارک", "دسترسی دامپزشک", "نمایش نتیجه آزمایش", "واکسیناسیون"] },
  { key: "shop", label: "فروشگاه", children: ["وضعیت سفارش", "تاخیر ارسال", "مرجوعی", "کالای آسیب‌دیده", "ناموجودی"] },
  { key: "finance", label: "مالی", children: ["پرداخت ناموفق", "کسر دوباره", "بازگشت وجه", "درخواست فاکتور", "مغایرت پرداخت"] },
  { key: "account", label: "حساب کاربری", children: ["فراموشی رمز", "قفل حساب", "تغییر شماره", "حذف حساب"] },
  { key: "complaint", label: "شکایت", children: ["برخورد ارائه‌دهنده", "کیفیت خدمت", "عدم پیگیری", "تاخیر پاسخ‌گویی"] },
  { key: "cx", label: "تجربه مشتری", children: ["نظرسنجی پس از نوبت", "نظرسنجی پس از رفع تیکت", "لغو اشتراک"] },
  { key: "other", label: "سایر", children: ["عمومی", "سایر موارد"] },
];

/** QA scorecard criteria. Each is scored on the four levels below. */
export const QA_CRITERIA: NonEmpty<{ key: string; label: string; weight: number }> = [
  { key: "greeting", label: "سلام و معرفی", weight: 8 },
  { key: "needs", label: "تشخیص نیاز", weight: 12 },
  { key: "accuracy", label: "صحت پاسخ", weight: 16 },
  { key: "mastery", label: "تسلط کارشناس", weight: 12 },
  { key: "empathy", label: "همدلی و لحن", weight: 12 },
  { key: "process", label: "رعایت فرآیند", weight: 12 },
  { key: "ownership", label: "مسئولیت‌پذیری", weight: 10 },
  { key: "clarity", label: "شفافیت بیان", weight: 8 },
  { key: "ticketing", label: "مدیریت تیکت", weight: 6 },
  { key: "closing", label: "جمع‌بندی و پایان", weight: 4 },
];

export const QA_LEVELS: NonEmpty<{ key: string; label: string; factor: number }> = [
  { key: "full", label: "کامل", factor: 1 },
  { key: "mostly", label: "تا حد زیادی", factor: 0.7 },
  { key: "partial", label: "ناقص", factor: 0.4 },
  { key: "none", label: "انجام نشد", factor: 0 },
];

/** A critical error zeroes an evaluation regardless of the criteria scores. */
export const QA_CRITICAL_ERRORS: string[] = [
  "ارائه اطلاعات اشتباه",
  "نقض محرمانگی پرونده سلامت",
  "رفتار نامناسب",
  "تعهد غیرمجاز به مشتری",
  "عدم ثبت تیکت ضروری",
  "عدم ارجاع به سطح بالاتر",
  "قطع عمدی تماس",
];

export const CX_QUESTIONS: NonEmpty<{ key: string; label: string }> = [
  { key: "service", label: "کیفیت خدمتی که دریافت کردید چقدر انتظار شما را برآورده کرد؟" },
  { key: "agent", label: "برخورد و دانش کارشناسان ما را چطور ارزیابی می‌کنید؟" },
  { key: "speed", label: "سرعت رسیدگی به درخواست‌ها و تیکت‌های شما چقدر رضایت‌بخش بود؟" },
  { key: "ease", label: "کار با اپلیکیشن و رزرو نوبت چقدر آسان بود؟" },
  { key: "nps", label: "چقدر احتمال دارد پت لایف را به دوستانتان معرفی کنید؟" },
];

// --- Entities ---------------------------------------------------------------

export interface CaAgent {
  id: string;
  name: string;
  role: "agent" | "supervisor" | "qa" | "qa_lead" | "cx";
  extension: string;
}

export const AGENT_ROLE_LABEL: Record<CaAgent["role"], string> = {
  agent: "کارشناس امور مشتریان",
  supervisor: "سرپرست امور مشتریان",
  qa: "کارشناس کنترل کیفیت",
  qa_lead: "مدیر کنترل کیفیت",
  cx: "کارشناس تجربه مشتری",
};

export interface CaCustomer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  city: string;
  pets: { name: string; species: string }[];
  plan: "رایگان" | "پلاس" | "پرمیوم";
  orders: number;
  bookings: number;
  lastPurchaseIrr: number | null;
  joinedMonthsAgo: number;
  ownerId: string;
  isPriority: boolean;
}

export interface CaTicket {
  id: string;
  customerId: string;
  title: string;
  reasonKey: string;
  subReason: string;
  priority: Priority;
  status: TicketStatus;
  channel: Channel;
  ownerId: string | null;
  createdHoursAgo: number;
  /** Hours remaining against the SLA target; negative means already breached. */
  slaRemainingHours: number;
  resolution: Resolution | null;
  rootCause: RootCause | null;
  summary: string;
}

export interface CaCall {
  id: string;
  customerId: string | null;
  agentId: string;
  direction: "in" | "out";
  outcome: CallOutcome;
  talkSeconds: number;
  waitSeconds: number;
  daysAgo: number;
  hasRecording: boolean;
  evaluated: boolean;
  linkedTicketId: string | null;
  wrapUp: string | null;
}

export interface CaFollowUp {
  id: string;
  customerId: string;
  ticketId: string | null;
  title: string;
  ownerId: string;
  dueInHours: number;
  done: boolean;
}

export interface CaComplaint {
  id: string;
  customerId: string;
  againstLabel: string;
  severity: Priority;
  summary: string;
  rootCause: RootCause | null;
  correctiveAction: string | null;
  status: "open" | "reviewing" | "accepted" | "rejected" | "closed";
  daysAgo: number;
}

export const COMPLAINT_STATUS_LABEL: Record<CaComplaint["status"], string> = {
  open: "ثبت‌شده",
  reviewing: "در حال رسیدگی",
  accepted: "پذیرفته شد",
  rejected: "رد شد",
  closed: "بسته‌شده",
};

export interface CaEscalation {
  id: string;
  customerId: string;
  ticketId: string | null;
  unit: EscalationUnit;
  requestedAction: string;
  amountIrr: number | null;
  dueInHours: number;
  reply: string | null;
  status: "sent" | "answered" | "done";
  raisedById: string;
}

export const ESCALATION_STATUS_LABEL: Record<CaEscalation["status"], string> = {
  sent: "ارسال شد",
  answered: "پاسخ داده شد",
  done: "رسیدگی شد",
};

export interface CaEvaluation {
  id: string;
  callId: string;
  agentId: string;
  evaluatorId: string;
  score: number;
  criticalError: string | null;
  strength: string;
  improvement: string;
  daysAgo: number;
  reason: "sample" | "complaint" | "repeat_call" | "low_csat" | "supervisor" | "calibration";
}

export const EVAL_REASON_LABEL: Record<CaEvaluation["reason"], string> = {
  sample: "نمونه تصادفی",
  complaint: "شکایت مشتری",
  repeat_call: "تماس تکراری",
  low_csat: "رضایت پایین",
  supervisor: "درخواست سرپرست",
  calibration: "کالیبراسیون",
};

export interface CaSurvey {
  id: string;
  customerId: string;
  agentId: string;
  answers: Record<string, number>;
  comment: string;
  daysAgo: number;
}

export interface SmsPattern {
  id: string;
  title: string;
  body: string;
  isDynamic: boolean;
  trigger: "manual" | "after_booking" | "on_ticket" | "after_resolve" | "after_survey" | "on_sla_breach";
  autoSend: boolean;
}

export const SMS_TRIGGER_LABEL: Record<SmsPattern["trigger"], string> = {
  manual: "ارسال دستی توسط کارشناس",
  after_booking: "خودکار — پس از نوبت",
  on_ticket: "خودکار — هنگام ثبت تیکت",
  after_resolve: "خودکار — پس از حل تیکت",
  after_survey: "خودکار — پس از نظرسنجی",
  on_sla_breach: "خودکار — هنگام نقض SLA",
};

/** The merge fields a dynamic pattern may use. */
export const SMS_VARIABLES = ["{نام}", "{حیوان}", "{شناسه_تیکت}", "{کارشناس}", "{تاریخ_نوبت}", "{مبلغ}"];

export interface ChangeLogEntry {
  id: string;
  actorId: string;
  entity: string;
  recordId: string;
  action: string;
  before: string | null;
  after: string | null;
  hoursAgo: number;
}

// --- Records ----------------------------------------------------------------

export const CA_AGENTS: NonEmpty<CaAgent> = [
  { id: "ca1", name: "مریم احمدی", role: "agent", extension: "۱۰۲" },
  { id: "ca2", name: "سینا رستمی", role: "agent", extension: "۱۰۳" },
  { id: "ca3", name: "نازنین پورعلی", role: "agent", extension: "۱۰۴" },
  { id: "ca4", name: "بهار صالحی", role: "supervisor", extension: "۱۱۰" },
  { id: "ca5", name: "شبنم عزیزی", role: "qa", extension: "۱۲۰" },
  { id: "ca6", name: "کاوه نوری", role: "qa_lead", extension: "۱۲۱" },
  { id: "ca7", name: "فرشته نادری", role: "cx", extension: "۱۳۰" },
];

export const CA_CUSTOMERS: NonEmpty<CaCustomer> = [
  { id: "C-4101", name: "نگین شریفی", phone: "۰۹۱۲۳۴۵۶۷۸۹", email: "negin@example.com", city: "تهران", pets: [{ name: "بادوم", species: "سگ" }], plan: "پلاس", orders: 7, bookings: 5, lastPurchaseIrr: 12_400_000, joinedMonthsAgo: 14, ownerId: "ca1", isPriority: true },
  { id: "C-4102", name: "مجید علوی", phone: "۰۹۱۲۱۱۲۲۳۳۴", email: "majid@example.com", city: "کرج", pets: [{ name: "پشمک", species: "گربه" }, { name: "میو", species: "گربه" }], plan: "پرمیوم", orders: 14, bookings: 11, lastPurchaseIrr: 31_800_000, joinedMonthsAgo: 22, ownerId: "ca2", isPriority: true },
  { id: "C-4103", name: "سارا رضایی", phone: "۰۹۳۵۵۵۶۶۷۷۸", email: null, city: "اصفهان", pets: [{ name: "شادی", species: "سگ" }], plan: "رایگان", orders: 1, bookings: 2, lastPurchaseIrr: 2_900_000, joinedMonthsAgo: 3, ownerId: "ca1", isPriority: false },
  { id: "C-4104", name: "آرش دهقان", phone: "۰۹۰۱۲۳۴۵۶۷۸", email: "arash@example.com", city: "مشهد", pets: [{ name: "رکس", species: "سگ" }], plan: "پلاس", orders: 4, bookings: 6, lastPurchaseIrr: 8_600_000, joinedMonthsAgo: 9, ownerId: "ca3", isPriority: false },
  { id: "C-4105", name: "شیما کریمی", phone: "۰۹۱۹۸۸۷۷۶۶۵", email: "shima@example.com", city: "تهران", pets: [{ name: "طوطی", species: "پرنده" }], plan: "رایگان", orders: 0, bookings: 1, lastPurchaseIrr: null, joinedMonthsAgo: 1, ownerId: "ca2", isPriority: false },
  { id: "C-4106", name: "رضا فتحی", phone: "۰۹۳۰۴۴۳۳۲۲۱", email: "reza@example.com", city: "شیراز", pets: [{ name: "سیمبا", species: "گربه" }], plan: "پرمیوم", orders: 9, bookings: 8, lastPurchaseIrr: 19_500_000, joinedMonthsAgo: 17, ownerId: "ca3", isPriority: true },
  { id: "C-4107", name: "الهام موسوی", phone: "۰۹۱۲۷۷۸۸۹۹۰", email: null, city: "تبریز", pets: [{ name: "آیدا", species: "خزنده" }], plan: "پلاس", orders: 3, bookings: 2, lastPurchaseIrr: 5_100_000, joinedMonthsAgo: 6, ownerId: "ca1", isPriority: false },
  { id: "C-4108", name: "امیر کاظمی", phone: "۰۹۱۲۰۰۱۱۲۲۳", email: "amir@example.com", city: "تهران", pets: [{ name: "لاکی", species: "سگ" }, { name: "کوکو", species: "پرنده" }], plan: "پلاس", orders: 6, bookings: 4, lastPurchaseIrr: 10_200_000, joinedMonthsAgo: 11, ownerId: "ca2", isPriority: false },
];

export const CA_TICKETS: NonEmpty<CaTicket> = [
  { id: "TK-7301", customerId: "C-4101", title: "کسر دوباره هزینه اشتراک پلاس", reasonKey: "finance", subReason: "کسر دوباره", priority: "critical", status: "in_progress", channel: "call_in", ownerId: "ca1", createdHoursAgo: 6, slaRemainingHours: -2, resolution: null, rootCause: null, summary: "مبلغ اشتراک دو بار در یک روز کسر شده؛ ارجاع به واحد مالی ثبت شد." },
  { id: "TK-7302", customerId: "C-4102", title: "نوبت دامپزشک تأیید نشد", reasonKey: "booking", subReason: "تأیید نشدن نوبت", priority: "high", status: "waiting_internal", channel: "app", ownerId: "ca2", createdHoursAgo: 9, slaRemainingHours: 3, resolution: null, rootCause: null, summary: "کلینیک هنوز نوبت را تأیید نکرده؛ منتظر پاسخ واحد ارائه‌دهندگان." },
  { id: "TK-7303", customerId: "C-4103", title: "نتیجه آزمایش خون نمایش داده نمی‌شود", reasonKey: "health", subReason: "نمایش نتیجه آزمایش", priority: "normal", status: "assigned", channel: "chat", ownerId: "ca1", createdHoursAgo: 4, slaRemainingHours: 20, resolution: null, rootCause: null, summary: "فایل بارگذاری شده ولی در پرونده دیده نمی‌شود." },
  { id: "TK-7304", customerId: "C-4104", title: "سفارش غذا هفت روز است نرسیده", reasonKey: "shop", subReason: "تاخیر ارسال", priority: "high", status: "reopened", channel: "call_in", ownerId: "ca3", createdHoursAgo: 30, slaRemainingHours: -18, resolution: null, rootCause: null, summary: "مشتری بار دوم تماس گرفته؛ تیکت قبلی زودتر بسته شده بود." },
  { id: "TK-7305", customerId: "C-4105", title: "پس از تغییر رمز وارد حساب نمی‌شود", reasonKey: "account", subReason: "قفل حساب", priority: "normal", status: "resolved", channel: "call_in", ownerId: "ca2", createdHoursAgo: 26, slaRemainingHours: 0, resolution: "access_fix", rootCause: "user_error", summary: "حساب پس از چند تلاش ناموفق قفل شده بود؛ بازگشایی و راهنمایی انجام شد." },
  { id: "TK-7306", customerId: "C-4106", title: "درخواست فاکتور رسمی", reasonKey: "finance", subReason: "درخواست فاکتور", priority: "low", status: "closed", channel: "email", ownerId: "ca3", createdHoursAgo: 96, slaRemainingHours: 0, resolution: "finance_fix", rootCause: "unknown", summary: "فاکتور صادر و ایمیل شد؛ مشتری دریافت را تأیید کرد." },
  { id: "TK-7307", customerId: "C-4107", title: "برخورد نامناسب در کلینیک", reasonKey: "complaint", subReason: "برخورد ارائه‌دهنده", priority: "high", status: "new", channel: "call_in", ownerId: null, createdHoursAgo: 2, slaRemainingHours: 10, resolution: null, rootCause: null, summary: "شکایت از لحن پذیرش کلینیک؛ نیازمند تخصیص و بررسی." },
  { id: "TK-7308", customerId: "C-4108", title: "بارگذاری مدارک واکسیناسیون خطا می‌دهد", reasonKey: "health", subReason: "بارگذاری مدارک", priority: "normal", status: "in_progress", channel: "app", ownerId: "ca1", createdHoursAgo: 12, slaRemainingHours: 12, resolution: null, rootCause: null, summary: "خطای حجم فایل؛ در حال بررسی با واحد فنی." },
  { id: "TK-7309", customerId: "C-4102", title: "لغو نوبت و بازگشت وجه", reasonKey: "booking", subReason: "لغو نوبت", priority: "normal", status: "new", channel: "call_in", ownerId: null, createdHoursAgo: 1, slaRemainingHours: 23, resolution: null, rootCause: null, summary: "نوبت لغو شده اما مبلغ برنگشته." },
];

export const CA_CALLS: NonEmpty<CaCall> = [
  { id: "VC-9201", customerId: "C-4101", agentId: "ca1", direction: "in", outcome: "to_finance", talkSeconds: 486, waitSeconds: 38, daysAgo: 0, hasRecording: true, evaluated: false, linkedTicketId: "TK-7301", wrapUp: "ارجاع به واحد مالی برای بررسی کسر دوباره." },
  { id: "VC-9202", customerId: "C-4104", agentId: "ca3", direction: "in", outcome: "unresolved", talkSeconds: 612, waitSeconds: 95, daysAgo: 0, hasRecording: true, evaluated: false, linkedTicketId: "TK-7304", wrapUp: "مشتری ناراضی؛ تیکت بازگشایی شد." },
  { id: "VC-9203", customerId: "C-4107", agentId: "ca1", direction: "in", outcome: "ticket_created", talkSeconds: 344, waitSeconds: 22, daysAgo: 0, hasRecording: true, evaluated: false, linkedTicketId: "TK-7307", wrapUp: "شکایت ثبت و برای سرپرست ارسال شد." },
  { id: "VC-9204", customerId: "C-4105", agentId: "ca2", direction: "out", outcome: "answered", talkSeconds: 228, waitSeconds: 0, daysAgo: 1, hasRecording: true, evaluated: true, linkedTicketId: "TK-7305", wrapUp: "راهنمای ورود ارسال شد." },
  { id: "VC-9205", customerId: "C-4103", agentId: "ca1", direction: "in", outcome: "follow_up", talkSeconds: 190, waitSeconds: 47, daysAgo: 1, hasRecording: true, evaluated: true, linkedTicketId: "TK-7303", wrapUp: "منتظر بررسی واحد فنی." },
  { id: "VC-9206", customerId: null, agentId: "ca2", direction: "in", outcome: "wrong_number", talkSeconds: 14, waitSeconds: 12, daysAgo: 2, hasRecording: false, evaluated: false, linkedTicketId: null, wrapUp: null },
  { id: "VC-9207", customerId: "C-4106", agentId: "ca3", direction: "out", outcome: "answered", talkSeconds: 401, waitSeconds: 0, daysAgo: 2, hasRecording: true, evaluated: true, linkedTicketId: "TK-7306", wrapUp: "تأیید دریافت فاکتور." },
  { id: "VC-9208", customerId: "C-4102", agentId: "ca2", direction: "in", outcome: "escalated", talkSeconds: 733, waitSeconds: 121, daysAgo: 3, hasRecording: true, evaluated: false, linkedTicketId: "TK-7302", wrapUp: "ارجاع به سرپرست به دلیل تاخیر کلینیک." },
  { id: "VC-9209", customerId: "C-4108", agentId: "ca1", direction: "in", outcome: "answered", talkSeconds: 265, waitSeconds: 31, daysAgo: 3, hasRecording: true, evaluated: false, linkedTicketId: "TK-7308", wrapUp: "راهنمای کاهش حجم فایل داده شد." },
  { id: "VC-9210", customerId: "C-4103", agentId: "ca3", direction: "out", outcome: "no_answer", talkSeconds: 0, waitSeconds: 0, daysAgo: 4, hasRecording: false, evaluated: false, linkedTicketId: null, wrapUp: null },
];

export const CA_FOLLOW_UPS: NonEmpty<CaFollowUp> = [
  { id: "FU-401", customerId: "C-4101", ticketId: "TK-7301", title: "اعلام نتیجه بررسی مالی به مشتری", ownerId: "ca1", dueInHours: 2, done: false },
  { id: "FU-402", customerId: "C-4104", ticketId: "TK-7304", title: "پیگیری وضعیت مرسوله با واحد ارسال", ownerId: "ca3", dueInHours: -6, done: false },
  { id: "FU-403", customerId: "C-4103", ticketId: "TK-7303", title: "اطلاع رفع مشکل نمایش نتیجه آزمایش", ownerId: "ca1", dueInHours: 18, done: false },
  { id: "FU-404", customerId: "C-4102", ticketId: "TK-7302", title: "تماس تأیید نوبت پس از پاسخ کلینیک", ownerId: "ca2", dueInHours: 5, done: false },
  { id: "FU-405", customerId: "C-4106", ticketId: "TK-7306", title: "تأیید دریافت فاکتور", ownerId: "ca3", dueInHours: 0, done: true },
];

export const CA_COMPLAINTS: NonEmpty<CaComplaint> = [
  { id: "CP-210", customerId: "C-4107", againstLabel: "کلینیک دامپزشکی مهر", severity: "high", summary: "لحن نامناسب پذیرش هنگام تغییر نوبت.", rootCause: "provider_issue", correctiveAction: "تذکر کتبی به کلینیک و پیگیری دوره‌ای", status: "reviewing", daysAgo: 0 },
  { id: "CP-209", customerId: "C-4104", againstLabel: "فرآیند ارسال سفارش", severity: "high", summary: "تیکت تاخیر ارسال بدون رفع مشکل بسته شده بود.", rootCause: "process_error", correctiveAction: "بازنگری شرط بستن تیکت‌های ارسال", status: "accepted", daysAgo: 1 },
  { id: "CP-208", customerId: "C-4102", againstLabel: "کارشناس امور مشتریان", severity: "normal", summary: "دو روز بدون پاسخ ماندن تیکت نوبت.", rootCause: "agent_error", correctiveAction: "جلسه کوچینگ و آموزش مجدد SLA", status: "closed", daysAgo: 4 },
  { id: "CP-207", customerId: "C-4103", againstLabel: "کیفیت محتوای راهنما", severity: "low", summary: "راهنمای بارگذاری مدارک گویا نبود.", rootCause: "system_defect", correctiveAction: null, status: "open", daysAgo: 6 },
];

export const CA_ESCALATIONS: NonEmpty<CaEscalation> = [
  { id: "ES-512", customerId: "C-4101", ticketId: "TK-7301", unit: "finance", requestedAction: "بررسی کسر دوباره و بازگشت مبلغ اضافی", amountIrr: 4_900_000, dueInHours: -1, reply: null, status: "sent", raisedById: "ca1" },
  { id: "ES-511", customerId: "C-4102", ticketId: "TK-7302", unit: "providers", requestedAction: "پیگیری تأیید نوبت با کلینیک", amountIrr: null, dueInHours: 4, reply: null, status: "sent", raisedById: "ca2" },
  { id: "ES-510", customerId: "C-4108", ticketId: "TK-7308", unit: "technical", requestedAction: "بررسی خطای حجم فایل در بارگذاری مدارک", amountIrr: null, dueInHours: 10, reply: "در حال بررسی؛ سقف حجم افزایش می‌یابد.", status: "answered", raisedById: "ca1" },
  { id: "ES-509", customerId: "C-4107", ticketId: "TK-7307", unit: "supervisor", requestedAction: "بررسی شکایت از برخورد کلینیک", amountIrr: null, dueInHours: 8, reply: null, status: "sent", raisedById: "ca1" },
  { id: "ES-508", customerId: "C-4106", ticketId: "TK-7306", unit: "finance", requestedAction: "صدور فاکتور رسمی", amountIrr: 19_500_000, dueInHours: 0, reply: "فاکتور صادر و ارسال شد.", status: "done", raisedById: "ca3" },
];

export const CA_EVALUATIONS: NonEmpty<CaEvaluation> = [
  { id: "QA-330", callId: "VC-9204", agentId: "ca2", evaluatorId: "ca5", score: 88, criticalError: null, strength: "همدلی مناسب و پاسخ دقیق", improvement: "ثبت دقیق‌تر خلاصه گفتگو", daysAgo: 1, reason: "sample" },
  { id: "QA-329", callId: "VC-9205", agentId: "ca1", evaluatorId: "ca5", score: 92, criticalError: null, strength: "تسلط خوب بر فرآیند پرونده سلامت", improvement: "جمع‌بندی پایانی کوتاه‌تر", daysAgo: 1, reason: "sample" },
  { id: "QA-328", callId: "VC-9207", agentId: "ca3", evaluatorId: "ca6", score: 64, criticalError: "تعهد غیرمجاز به مشتری", strength: "لحن محترمانه", improvement: "قول زمان‌بندی خارج از اختیار داده شد", daysAgo: 2, reason: "complaint" },
];

export const CA_SURVEYS: NonEmpty<CaSurvey> = [
  { id: "SV-120", customerId: "C-4106", agentId: "ca3", answers: { service: 5, agent: 5, speed: 4, ease: 4, nps: 5 }, comment: "از کیفیت خدمات و پیگیری راضی بودم.", daysAgo: 2 },
  { id: "SV-119", customerId: "C-4104", agentId: "ca3", answers: { service: 2, agent: 3, speed: 1, ease: 3, nps: 2 }, comment: "از روند پیگیری سفارش گلایه داشتم.", daysAgo: 3 },
  { id: "SV-118", customerId: "C-4105", agentId: "ca2", answers: { service: 4, agent: 5, speed: 4, ease: 3, nps: 4 }, comment: "راهنمایی ورود سریع بود.", daysAgo: 4 },
  { id: "SV-117", customerId: "C-4101", agentId: "ca1", answers: { service: 4, agent: 4, speed: 3, ease: 4, nps: 4 }, comment: "امیدوارم مشکل مالی زودتر حل شود.", daysAgo: 5 },
];

export const SMS_PATTERNS: NonEmpty<SmsPattern> = [
  { id: "SMS-01", title: "تشکر پس از نوبت", body: "{نام} عزیز، از اینکه نوبت {حیوان} را در پت لایف رزرو کردید سپاسگزاریم.", isDynamic: true, trigger: "after_booking", autoSend: true },
  { id: "SMS-02", title: "ثبت تیکت", body: "درخواست شما با شناسه {شناسه_تیکت} ثبت شد. کارشناس {کارشناس} پیگیر است.", isDynamic: true, trigger: "on_ticket", autoSend: true },
  { id: "SMS-03", title: "رفع تیکت", body: "{نام} عزیز، تیکت {شناسه_تیکت} حل شد. اگر همچنان مشکلی هست پاسخ دهید.", isDynamic: true, trigger: "after_resolve", autoSend: true },
  { id: "SMS-04", title: "دعوت به نظرسنجی", body: "نظر شما درباره آخرین تماس با پت لایف برای ما مهم است.", isDynamic: false, trigger: "after_survey", autoSend: false },
  { id: "SMS-05", title: "هشدار نقض مهلت", body: "{نام} عزیز، رسیدگی به تیکت {شناسه_تیکت} طول کشیده است. سرپرست پیگیر شد.", isDynamic: true, trigger: "on_sla_breach", autoSend: false },
];

export const CHANGE_LOG: NonEmpty<ChangeLogEntry> = [
  { id: "LG-881", actorId: "ca1", entity: "تیکت", recordId: "TK-7301", action: "تغییر اولویت", before: "بالا", after: "بحرانی", hoursAgo: 5 },
  { id: "LG-880", actorId: "ca4", entity: "تیکت", recordId: "TK-7304", action: "بازگشایی تیکت", before: "بسته‌شده", after: "بازگشایی‌شده", hoursAgo: 8 },
  { id: "LG-879", actorId: "ca5", entity: "کیفیت", recordId: "QA-328", action: "ثبت خطای بحرانی", before: null, after: "تعهد غیرمجاز به مشتری", hoursAgo: 30 },
  { id: "LG-878", actorId: "ca2", entity: "تماس", recordId: "VC-9208", action: "پخش فایل ضبط", before: null, after: "دسترسی ثبت شد", hoursAgo: 34 },
  { id: "LG-877", actorId: "ca6", entity: "تنظیمات", recordId: "SLA", action: "تغییر مهلت اولویت بالا", before: "۱۸ ساعت", after: "۱۲ ساعت", hoursAgo: 50 },
  { id: "LG-876", actorId: "ca7", entity: "پیامک", recordId: "SMS-04", action: "غیرفعال‌سازی ارسال خودکار", before: "فعال", after: "غیرفعال", hoursAgo: 72 },
];

// --- Derived helpers --------------------------------------------------------

export function caAgentName(id: string | null): string {
  if (!id) return "تخصیص‌نیافته";
  return CA_AGENTS.find((a) => a.id === id)?.name ?? "—";
}

export function caCustomerName(id: string | null): string {
  if (!id) return "ناشناس";
  return CA_CUSTOMERS.find((c) => c.id === id)?.name ?? "—";
}

export function reasonLabel(key: string): string {
  return CONTACT_REASONS.find((r) => r.key === key)?.label ?? key;
}

export type SlaState = "breached" | "at_risk" | "on_time" | "done";

/** A ticket is at risk once less than a quarter of its SLA window remains. */
export function slaState(ticket: CaTicket): SlaState {
  if (!OPEN_TICKET_STATUSES.includes(ticket.status)) return "done";
  if (ticket.slaRemainingHours < 0) return "breached";
  if (ticket.slaRemainingHours <= SLA_HOURS[ticket.priority] / 4) return "at_risk";
  return "on_time";
}

export const SLA_STATE_LABEL: Record<SlaState, string> = {
  breached: "نقض مهلت",
  at_risk: "در معرض نقض",
  on_time: "در مهلت",
  done: "پایان‌یافته",
};

export function formatIrr(amount: number): string {
  return `${formatNumber(amount)} ریال`;
}

export function formatMinutes(seconds: number): string {
  if (seconds === 0) return "—";
  return `${formatNumber(Math.round(seconds / 60))} دقیقه`;
}

export function formatClock(seconds: number): string {
  if (seconds === 0) return "—";
  return `${formatNumber(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, "0")}`;
}

export function relativeHours(hours: number): string {
  if (hours < 1) return "کمتر از یک ساعت";
  if (hours < 24) return `${formatNumber(hours)} ساعت`;
  return `${formatNumber(Math.floor(hours / 24))} روز`;
}

export function dueInLabel(hours: number): string {
  if (hours < 0) return `${formatNumber(Math.abs(hours))} ساعت عقب‌افتاده`;
  if (hours === 0) return "همین حالا";
  return `${formatNumber(hours)} ساعت دیگر`;
}

export function relativeDays(days: number): string {
  if (days === 0) return "امروز";
  if (days === 1) return "دیروز";
  return `${formatNumber(days)} روز پیش`;
}

/** Average of a survey's five answers, on the same 1-5 scale the questions use. */
export function surveyAverage(survey: CaSurvey): number {
  const values = CX_QUESTIONS.map((q) => survey.answers[q.key] ?? 0);
  return Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10;
}
