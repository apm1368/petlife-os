"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useLocale } from "next-intl";
import { usePathname } from "next/navigation";
import { Button, EmptyState, ErrorRecovery, Input, Skeleton } from "@petlife/ui";
import type { AnimalSupportOrganizationDto, CommunityReportDto, SupportNeedListingDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { formatDay, localizeDigits } from "@/lib/date/jalali";
import { formatCurrency } from "@/lib/currency/format-currency";
import { adminAnimalSupportService, type AdminAnimalSupportOverview, type AdminDonationRow, type AdminLostPetDetail, type AdminLostPetRow, type AdminNgoMember, type ReportTargetFilter, type RevealedLocation } from "@/services/admin-animal-support.service";
import { DetailRow, EmptyRow, FilterBar, FilterField, Kpi, Panel, PanelTitle, SelectFilter, TableWrap, Tag, Td, TextFilter, Th, type Tone } from "../console-ui";

type Lang = "fa" | "en";
const useLang = () => {
  const lang = useLocale() as Lang;
  return { lang, fa: lang === "fa", t: (faText: string, enText: string) => (lang === "fa" ? faText : enText) };
};
type LoadError = "forbidden" | "notFound" | "error" | null;
const toError = (e: unknown): LoadError => (e instanceof ApiError ? (e.status === 403 ? "forbidden" : e.status === 404 ? "notFound" : "error") : "error");
const day = (iso: string | null | undefined, lang: Lang) => (iso ? formatDay(iso, lang) : "—");
const n = (value: number, lang: Lang) => localizeDigits(value.toLocaleString(lang === "fa" ? "fa-IR" : "en-US"), lang);
const errorMessage = (e: unknown, t: (fa: string, en: string) => string) =>
  e instanceof ApiError && e.status === 403 ? t("این کار با نقش شما مجاز نیست.", "Your role isn't allowed to do this.") : e instanceof ApiError && e.status === 409 ? t("این تغییر از وضعیت فعلی مجاز نیست.", "That change isn't allowed from the current state.") : t("انجام نشد؛ دوباره تلاش کنید.", "That didn't work; try again.");

// ---------------------------------------------------------------- labels

const NEED_STATUS: Record<string, [string, string, Tone]> = {
  DRAFT: ["پیش‌نویس", "Draft", "neutral"],
  PENDING_REVIEW: ["در انتظار بررسی", "Pending review", "attention"],
  PUBLISHED: ["منتشر شده", "Published", "success"],
  PARTIALLY_FULFILLED: ["بخشی تأمین شده", "Partly fulfilled", "success"],
  PAUSED: ["متوقف", "Paused", "neutral"],
  FULFILLED: ["تأمین شده", "Fulfilled", "brand"],
  CLOSED: ["بسته", "Closed", "neutral"],
  EXPIRED: ["منقضی", "Expired", "neutral"],
  REJECTED: ["رد شده", "Rejected", "concern"],
  REMOVED: ["حذف شده", "Removed", "urgent"],
};
const VERIFICATION: Record<string, [string, string, Tone]> = {
  NOT_STARTED: ["شروع نشده", "Not started", "neutral"],
  SUBMITTED: ["ارسال شده", "Submitted", "attention"],
  NEEDS_INFORMATION: ["نیاز به اطلاعات", "Needs information", "concern"],
  UNDER_REVIEW: ["در حال بررسی", "Under review", "attention"],
  VERIFIED: ["تأیید شده", "Verified", "success"],
  REJECTED: ["رد شده", "Rejected", "urgent"],
};
const ORG_TYPE: Record<string, [string, string]> = { NGO: ["سازمان مردم‌نهاد", "NGO"], SHELTER: ["پناهگاه", "Shelter"], RESCUE_GROUP: ["گروه نجات", "Rescue group"] };
const ROLE: Record<string, [string, string]> = { OWNER: ["مالک", "Owner"], COORDINATOR: ["هماهنگ‌کننده", "Coordinator"], VIEWER: ["بیننده", "Viewer"] };
const DONATION_STATUS: Record<string, [string, string, Tone]> = { PENDING: ["در انتظار", "Pending", "neutral"], SUCCEEDED: ["دریافت شد", "Received", "success"], FAILED: ["ناموفق", "Failed", "concern"], REFUNDED: ["بازپرداخت شد", "Refunded", "neutral"] };
const INCIDENT_STATUS: Record<string, [string, string, Tone]> = {
  OPEN: ["باز", "Open", "urgent"],
  SEARCHING: ["در جست‌وجو", "Searching", "urgent"],
  SIGHTING_REPORTED: ["مشاهده گزارش شده", "Sighting reported", "attention"],
  FOUND: ["پیدا شد", "Found", "success"],
  REUNITED: ["بازگشت به خانه", "Reunited", "success"],
  CLOSED: ["بسته", "Closed", "neutral"],
};
const REPORT_STATUS: Record<string, [string, string, Tone]> = { OPEN: ["باز", "Open", "attention"], ESCALATED: ["ارجاع به پرونده", "Escalated", "concern"], RESOLVED: ["رسیدگی شد", "Resolved", "success"], DISMISSED: ["رد شد", "Dismissed", "neutral"] };
const REPORT_REASON: Record<string, [string, string]> = {
  SPAM: ["هرزنامه", "Spam"], ABUSE: ["سوءاستفاده", "Abuse"], MISINFORMATION: ["اطلاعات نادرست", "Misinformation"], INAPPROPRIATE: ["نامناسب", "Inappropriate"], OTHER: ["سایر", "Other"],
  SCAM: ["کلاهبرداری", "Scam"], HARASSMENT: ["آزار", "Harassment"], PERSONAL_INFORMATION: ["اطلاعات شخصی", "Personal information"], ANIMAL_WELFARE: ["رفاه حیوان", "Animal welfare"], DANGEROUS_CONTENT: ["محتوای خطرناک", "Dangerous content"],
};
const TARGETS: Array<{ value: ReportTargetFilter; fa: string; en: string }> = [
  { value: "COMMUNITY", fa: "انجمن", en: "Community" },
  { value: "SUPPORT_NEED", fa: "درخواست کمک", en: "Support request" },
  { value: "LOST_PET_INCIDENT", fa: "حیوان گم‌شده", en: "Lost pet" },
  { value: "LOST_PET_SIGHTING", fa: "گزارش مشاهده", en: "Sighting" },
  { value: "ORGANIZATION", fa: "سازمان", en: "Organization" },
];

function StatusTag({ map, value }: { map: Record<string, [string, string, Tone]>; value: string }) {
  const { fa } = useLang();
  const entry = map[value];
  return <Tag tone={entry?.[2] ?? "neutral"}>{entry ? (fa ? entry[0] : entry[1]) : value}</Tag>;
}

function reportTarget(report: CommunityReportDto): { label: [string, string]; href?: string } {
  if (report.postId) return { label: ["پست انجمن", "Community post"], href: `/community/posts/${report.postId}` };
  if (report.commentId) return { label: ["نظر انجمن", "Community comment"] };
  if (report.supportNeedListingId) return { label: ["درخواست کمک", "Support request"], href: `/admin/animal-support/needs/${report.supportNeedListingId}` };
  if (report.lostPetIncidentId) return { label: ["حیوان گم‌شده", "Lost pet"], href: `/admin/lost-pets/${report.lostPetIncidentId}` };
  if (report.lostPetSightingId) return { label: ["گزارش مشاهده", "Sighting"] };
  return { label: ["سازمان", "Organization"], href: report.organizationId ? `/admin/animal-support/organizations/${report.organizationId}` : undefined };
}

// ---------------------------------------------------------------- shared pieces

export function AdminAnimalSupportNav() {
  const { lang, t } = useLang();
  const pathname = usePathname() ?? "";
  const items = [
    { href: `/${lang}/admin/animal-support`, label: t("نمای کلی", "Overview"), exact: true },
    { href: `/${lang}/admin/animal-support/needs`, label: t("درخواست‌های کمک", "Support requests") },
    { href: `/${lang}/admin/animal-support/organizations`, label: t("سازمان‌ها", "Organizations") },
    { href: `/${lang}/admin/animal-support/donations`, label: t("کمک‌های مالی", "Donations") },
    { href: `/${lang}/admin/lost-pets`, label: t("حیوانات گم‌شده", "Lost pets") },
    { href: `/${lang}/admin/community`, label: t("گزارش‌ها", "Reports") },
    { href: `/${lang}/admin/trust`, label: t("پرونده‌های اعتماد و ایمنی", "Trust & safety cases") },
  ];
  return (
    <nav aria-label={t("بخش حمایت از حیوانات", "Animal support section")} className="mb-4 flex gap-1 overflow-x-auto border-b border-border-subtle">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={`whitespace-nowrap px-3 py-2 text-sm ${active ? "border-b-2 border-brand-natural font-bold" : "text-text-secondary"}`}>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function LoadState({ error, perm, onRetry }: { error: LoadError; perm: string; onRetry: () => void }) {
  const { t } = useLang();
  if (error === "forbidden") return <EmptyState title={t(`دسترسی «${perm}» لازم است`, `The “${perm}” permission is required`)} />;
  if (error === "notFound") return <EmptyState title={t("پیدا نشد", "Not found")} />;
  return <ErrorRecovery title={t("بارگذاری نشد", "Didn't load")} message="" retryLabel={t("تلاش دوباره", "Retry")} onRetry={onRetry} />;
}

/** An action that needs an audited reason (min 5 characters) before it can run. */
function ReasonAction({ label, confirmLabel, onRun, danger = false, minLength = 5, hint }: { label: string; confirmLabel: string; onRun: (reason: string) => Promise<void>; danger?: boolean; minLength?: number; hint?: string }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) return <Button size="sm" variant={danger ? "danger" : "secondary"} onClick={() => setOpen(true)}>{label}</Button>;
  return (
    <div className="flex w-full flex-col gap-2 rounded-md border border-border-subtle p-3">
      <Input label={t("دلیل (در گزارش ممیزی ثبت می‌شود)", "Reason (recorded in the audit log)")} hint={hint} value={reason} onChange={(e) => setReason(e.target.value)} />
      {error ? <p role="alert" className="text-metadata text-state-urgent">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setOpen(false); setReason(""); setError(null); }}>{t("انصراف", "Cancel")}</Button>
        <Button
          size="sm"
          variant={danger ? "danger" : "primary"}
          isLoading={busy}
          disabled={reason.trim().length < minLength}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await onRun(reason.trim());
              setOpen(false);
              setReason("");
            } catch (e) {
              setError(errorMessage(e, t));
            } finally {
              setBusy(false);
            }
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}

function Pager({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  const { lang, t } = useLang();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="mt-3 flex items-center justify-between gap-2 text-metadata text-text-secondary">
      <span>{t(`صفحهٔ ${n(page, lang)} از ${n(pages, lang)}`, `Page ${page} of ${pages}`)}</span>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>{t("قبلی", "Previous")}</Button>
        <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>{t("بعدی", "Next")}</Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- overview

/** ADMIN T&S PATTERN — what needs attention first, then what is live; every number is a live count. */
export function AdminAnimalSupportOverviewView() {
  const { lang, t } = useLang();
  const [data, setData] = useState<AdminAnimalSupportOverview | null>(null);
  const [error, setError] = useState<LoadError>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await adminAnimalSupportService.overview());
    } catch (e) {
      setError(toError(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <div>
      <AdminAnimalSupportNav />
      <h1 className="mb-4 text-page-title text-text-primary">{t("حمایت از حیوانات", "Animal support")}</h1>
      {error ? <LoadState error={error} perm="animalSupport.view" onRetry={load} /> : !data ? <Skeleton className="h-40 w-full" aria-label={t("در حال بارگذاری", "Loading")} /> : (
        <div className="flex flex-col gap-4">
          <Panel>
            <PanelTitle title={t("نیازمند رسیدگی", "Needs attention")} />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Link href={`/${lang}/admin/animal-support/needs`}><Kpi label={t("درخواست در انتظار بررسی", "Requests awaiting review")} value={n(data.needsAttention.pendingListings, lang)} tone={data.needsAttention.pendingListings ? "attention" : "neutral"} /></Link>
              <Link href={`/${lang}/admin/animal-support/organizations`}><Kpi label={t("سازمان در انتظار احراز", "Organizations awaiting verification")} value={n(data.needsAttention.orgsAwaitingReview, lang)} tone={data.needsAttention.orgsAwaitingReview ? "attention" : "neutral"} /></Link>
              <Link href={`/${lang}/admin/community`}><Kpi label={t("گزارش باز", "Open reports")} value={n(data.needsAttention.openReports, lang)} tone={data.needsAttention.openReports ? "concern" : "neutral"} /></Link>
              <Link href={`/${lang}/admin/trust`}><Kpi label={t("پروندهٔ باز اعتماد و ایمنی", "Open T&S cases")} value={n(data.needsAttention.openTrustCases, lang)} tone={data.needsAttention.openTrustCases ? "concern" : "neutral"} /></Link>
            </div>
          </Panel>
          <Panel>
            <PanelTitle title={t("وضعیت فعلی", "Live now")} hint={t("کمک‌های مالی: ۳۰ روز گذشته", "Donations: last 30 days")} />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi label={t("درخواست کمک فعال", "Live support requests")} value={n(data.live.liveListings, lang)} />
              <Kpi label={t("سازمان تأییدشده", "Verified organizations")} value={n(data.live.verifiedOrgs, lang)} />
              <Link href={`/${lang}/admin/lost-pets`}><Kpi label={t("گزارش گم‌شدن باز", "Open lost-pet reports")} value={n(data.live.openLostPetIncidents, lang)} tone={data.live.openLostPetIncidents ? "urgent" : "neutral"} /></Link>
              <Link href={`/${lang}/admin/animal-support/donations`}><Kpi label={t("کمک مالی دریافت‌شده", "Donations received")} value={formatCurrency(data.donationsLast30Days.amountIrr, lang)} sub={t(`${n(data.donationsLast30Days.count, lang)} کمک · ${n(data.donationsLast30Days.refunded, lang)} بازپرداخت`, `${data.donationsLast30Days.count} donations · ${data.donationsLast30Days.refunded} refunded`)} /></Link>
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- support requests

export function AdminSupportNeedsView() {
  const { lang, fa, t } = useLang();
  const [status, setStatus] = useState<string | "all">("PENDING_REVIEW");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; items: SupportNeedListingDto[] } | null>(null);
  const [error, setError] = useState<LoadError>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await adminAnimalSupportService.listNeeds({ status: status === "all" ? undefined : status, page, pageSize: 25 }));
    } catch (e) {
      setError(toError(e));
    }
  }, [status, page]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <div>
      <AdminAnimalSupportNav />
      <h1 className="mb-4 text-page-title text-text-primary">{t("درخواست‌های کمک", "Support requests")}</h1>
      <FilterBar>
        <FilterField label={t("وضعیت", "Status")}>
          <SelectFilter value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: "all", label: t("همه", "All") }, ...Object.keys(NEED_STATUS).map((s) => ({ value: s, label: fa ? NEED_STATUS[s]![0] : NEED_STATUS[s]![1] }))]} />
        </FilterField>
      </FilterBar>
      {error ? <LoadState error={error} perm="trust.view" onRetry={load} /> : !data ? <Skeleton className="h-40 w-full" aria-label={t("در حال بارگذاری", "Loading")} /> : (
        <Panel>
          <TableWrap>
            <thead><tr><Th>{t("عنوان", "Title")}</Th><Th>{t("منتشرکننده", "Publisher")}</Th><Th>{t("شهر", "City")}</Th><Th>{t("وضعیت", "Status")}</Th><Th>{t("ثبت", "Created")}</Th></tr></thead>
            <tbody>
              {data.items.length === 0 ? <EmptyRow colSpan={5} label={t("موردی نیست", "Nothing here")} /> : data.items.map((need) => (
                <tr key={need.id}>
                  <Td><Link className="text-brand-natural underline" href={`/${lang}/admin/animal-support/needs/${need.id}`}>{need.title}</Link></Td>
                  <Td>{need.organizationName ?? t("شخصی", "Individual")}</Td>
                  <Td>{need.city}</Td>
                  <Td><StatusTag map={NEED_STATUS} value={need.status} /></Td>
                  <Td>{day(need.createdAt, lang)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <Pager page={page} total={data.total} pageSize={25} onPage={setPage} />
        </Panel>
      )}
    </div>
  );
}

export function AdminSupportNeedDetailView({ needId }: { needId: string }) {
  const { lang, t } = useLang();
  const [need, setNeed] = useState<SupportNeedListingDto | null>(null);
  const [error, setError] = useState<LoadError>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      setNeed(await adminAnimalSupportService.getNeed(needId));
    } catch (e) {
      setError(toError(e));
    }
  }, [needId]);
  useEffect(() => {
    void load();
  }, [load]);
  if (error) return <div><AdminAnimalSupportNav /><LoadState error={error} perm="trust.view" onRetry={load} /></div>;
  if (!need) return <div><AdminAnimalSupportNav /><Skeleton className="h-40 w-full" aria-label={t("در حال بارگذاری", "Loading")} /></div>;
  const review = (status: string) => async (note: string) => {
    setNeed(await adminAnimalSupportService.reviewNeed(need.id, status, note));
  };
  const can = (to: string) => ({
    PUBLISHED: ["PENDING_REVIEW", "REJECTED", "EXPIRED", "REMOVED"],
    REJECTED: ["PENDING_REVIEW"],
    REMOVED: ["DRAFT", "PENDING_REVIEW", "PUBLISHED", "PARTIALLY_FULFILLED", "PAUSED", "FULFILLED", "REJECTED", "EXPIRED"],
  })[to]?.includes(need.status);
  return (
    <div>
      <AdminAnimalSupportNav />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-page-title text-text-primary">{need.title}</h1>
        <StatusTag map={NEED_STATUS} value={need.status} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] [&>*]:min-w-0">
        <Panel>
          <PanelTitle title={t("جزئیات", "Details")} />
          <p className="mb-3 whitespace-pre-line text-body text-text-primary" dir="auto">{need.description}</p>
          <DetailRow label={t("منتشرکننده", "Publisher")}>{need.organizationName ?? t("شخصی", "Individual")}</DetailRow>
          <DetailRow label={t("دسته", "Category")}>{need.category}</DetailRow>
          <DetailRow label={t("فوریت", "Urgency")}>{need.urgency}</DetailRow>
          <DetailRow label={t("محل", "Area")}>{[need.province, need.city, need.neighborhood].filter(Boolean).join("، ")}</DetailRow>
          <DetailRow label={t("ثبت", "Created")}>{day(need.createdAt, lang)}</DetailRow>
          {need.reviewNote ? <DetailRow label={t("یادداشت بررسی قبلی", "Previous review note")}>{need.reviewNote}</DetailRow> : null}
        </Panel>
        <Panel>
          <PanelTitle title={t("تصمیم بررسی", "Review decision")} hint={t("هر تصمیم با دلیل در گزارش ممیزی ثبت و به منتشرکننده اطلاع داده می‌شود.", "Every decision is audited with its reason and the publisher is notified.")} />
          <div className="flex flex-col gap-2">
            {can("PUBLISHED") ? <ReasonAction label={t("انتشار", "Publish")} confirmLabel={t("انتشار", "Publish")} onRun={review("PUBLISHED")} /> : null}
            {can("REJECTED") ? <ReasonAction label={t("نیاز به اصلاح / رد", "Request changes / reject")} confirmLabel={t("رد", "Reject")} onRun={review("REJECTED")} /> : null}
            {can("REMOVED") ? <ReasonAction danger label={t("حذف از نمایش عمومی", "Remove from public view")} confirmLabel={t("حذف", "Remove")} onRun={review("REMOVED")} /> : null}
            {!can("PUBLISHED") && !can("REJECTED") && !can("REMOVED") ? <p className="text-metadata text-text-secondary">{t("از این وضعیت تصمیم دیگری ممکن نیست.", "No further decision is possible from this state.")}</p> : null}
          </div>
        </Panel>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- organizations

export function AdminOrganizationsView() {
  const { lang, fa, t } = useLang();
  const [status, setStatus] = useState<string | "all">("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; items: AnimalSupportOrganizationDto[] } | null>(null);
  const [error, setError] = useState<LoadError>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("SHELTER");
  const [createError, setCreateError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await adminAnimalSupportService.listOrganizations({ verificationStatus: status === "all" ? undefined : status, page, pageSize: 25 }));
    } catch (e) {
      setError(toError(e));
    }
  }, [status, page]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <div>
      <AdminAnimalSupportNav />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-page-title text-text-primary">{t("سازمان‌ها و پناهگاه‌ها", "Organizations & shelters")}</h1>
        <Button size="sm" onClick={() => setCreating((v) => !v)}>{t("سازمان جدید", "New organization")}</Button>
      </div>
      {creating ? (
        <Panel className="mb-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end">
            <Input label={t("نام", "Name")} value={name} onChange={(e) => setName(e.target.value)} dir="auto" />
            <FilterField label={t("نوع", "Type")}>
              <SelectFilter value={type} onChange={(v) => setType(v === "all" ? "SHELTER" : v)} options={Object.keys(ORG_TYPE).map((k) => ({ value: k, label: fa ? ORG_TYPE[k]![0] : ORG_TYPE[k]![1] }))} />
            </FilterField>
            <Button
              disabled={name.trim().length < 2}
              onClick={async () => {
                setCreateError(null);
                try {
                  await adminAnimalSupportService.createOrganization({ type, name: name.trim() });
                  setName("");
                  setCreating(false);
                  await load();
                } catch (e) {
                  setCreateError(errorMessage(e, t));
                }
              }}
            >
              {t("ایجاد", "Create")}
            </Button>
          </div>
          {createError ? <p role="alert" className="mt-2 text-metadata text-state-urgent">{createError}</p> : null}
        </Panel>
      ) : null}
      <FilterBar>
        <FilterField label={t("وضعیت احراز", "Verification")}>
          <SelectFilter value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: "all", label: t("همه", "All") }, ...Object.keys(VERIFICATION).map((s) => ({ value: s, label: fa ? VERIFICATION[s]![0] : VERIFICATION[s]![1] }))]} />
        </FilterField>
      </FilterBar>
      {error ? <LoadState error={error} perm="animalSupport.view" onRetry={load} /> : !data ? <Skeleton className="h-40 w-full" aria-label={t("در حال بارگذاری", "Loading")} /> : (
        <Panel>
          <TableWrap>
            <thead><tr><Th>{t("نام", "Name")}</Th><Th>{t("نوع", "Type")}</Th><Th>{t("احراز", "Verification")}</Th><Th>{t("نمایش عمومی", "Public")}</Th><Th>{t("ثبت", "Created")}</Th></tr></thead>
            <tbody>
              {data.items.length === 0 ? <EmptyRow colSpan={5} label={t("موردی نیست", "Nothing here")} /> : data.items.map((org) => (
                <tr key={org.id}>
                  <Td><Link className="text-brand-natural underline" href={`/${lang}/admin/animal-support/organizations/${org.id}`}>{org.name}</Link></Td>
                  <Td>{ORG_TYPE[org.type] ? t(ORG_TYPE[org.type]![0], ORG_TYPE[org.type]![1]) : org.type}</Td>
                  <Td><StatusTag map={VERIFICATION} value={org.verificationStatus} /></Td>
                  <Td>{org.isPubliclyListed ? t("بله", "Yes") : t("خیر", "No")}</Td>
                  <Td>{day(org.createdAt, lang)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <Pager page={page} total={data.total} pageSize={25} onPage={setPage} />
        </Panel>
      )}
    </div>
  );
}

export function AdminOrganizationDetailView({ organizationId }: { organizationId: string }) {
  const { lang, fa, t } = useLang();
  const [org, setOrg] = useState<AnimalSupportOrganizationDto | null>(null);
  const [members, setMembers] = useState<AdminNgoMember[] | null>(null);
  const [error, setError] = useState<LoadError>(null);
  const [docs, setDocs] = useState<Array<{ index: number; downloadUrl: string }> | null>(null);
  const [nextStatus, setNextStatus] = useState("VERIFIED");
  const [grantEmail, setGrantEmail] = useState("");
  const [grantRole, setGrantRole] = useState("COORDINATOR");
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      const [o, m] = await Promise.all([adminAnimalSupportService.getOrganization(organizationId), adminAnimalSupportService.listMembers(organizationId).catch(() => [])]);
      setOrg(o);
      setMembers(m);
    } catch (e) {
      setError(toError(e));
    }
  }, [organizationId]);
  useEffect(() => {
    void load();
  }, [load]);
  if (error) return <div><AdminAnimalSupportNav /><LoadState error={error} perm="animalSupport.view" onRetry={load} /></div>;
  if (!org || !members) return <div><AdminAnimalSupportNav /><Skeleton className="h-40 w-full" aria-label={t("در حال بارگذاری", "Loading")} /></div>;
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setNotice(null);
    try {
      await fn();
      setNotice(done);
      await load();
    } catch (e) {
      setNotice(errorMessage(e, t));
    }
  };
  return (
    <div>
      <AdminAnimalSupportNav />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-page-title text-text-primary">{org.name}</h1>
        <StatusTag map={VERIFICATION} value={org.verificationStatus} />
        <Tag tone={org.isPubliclyListed ? "success" : "neutral"}>{org.isPubliclyListed ? t("در فهرست عمومی", "Publicly listed") : t("خارج از فهرست", "Not listed")}</Tag>
      </div>
      {notice ? <p role="status" className="mb-3 text-metadata text-text-secondary">{notice}</p> : null}
      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <Panel>
          <PanelTitle title={t("احراز هویت", "Verification")} hint={t("یادداشت برای سازمان ارسال می‌شود.", "The note is sent to the organization.")} />
          <FilterField label={t("وضعیت جدید", "New status")}>
            <SelectFilter value={nextStatus} onChange={(v) => setNextStatus(v === "all" ? "VERIFIED" : v)} options={["UNDER_REVIEW", "NEEDS_INFORMATION", "VERIFIED", "REJECTED"].map((s) => ({ value: s, label: fa ? VERIFICATION[s]![0] : VERIFICATION[s]![1] }))} />
          </FilterField>
          <div className="mt-2">
            <ReasonAction label={t("ثبت وضعیت", "Set status")} confirmLabel={t("ثبت", "Save")} onRun={(reason) => run(() => adminAnimalSupportService.setVerification(org.id, nextStatus, reason), t("وضعیت احراز ثبت شد.", "Verification status saved."))} />
          </div>
          <div className="mt-4 border-t border-border-subtle pt-3">
            <p className="mb-2 text-metadata text-text-secondary">{t("مدارک احراز خصوصی‌اند؛ هر بار باز کردن با دلیل ثبت می‌شود و پیوندها چند دقیقه اعتبار دارند.", "Verification documents are private; every opening is audited with a reason and links last a few minutes.")}</p>
            <ReasonAction label={t("باز کردن مدارک", "Open documents")} confirmLabel={t("باز کردن", "Open")} onRun={async (reason) => setDocs(await adminAnimalSupportService.openVerificationDocuments(org.id, reason))} />
            {docs ? (docs.length === 0 ? <p className="mt-2 text-metadata text-text-secondary">{t("مدرکی ارسال نشده است.", "No documents submitted.")}</p> : (
              <ul className="mt-2 flex flex-col gap-1">
                {docs.map((d) => <li key={d.index}><a className="text-metadata text-brand-natural underline" href={d.downloadUrl} target="_blank" rel="noreferrer noopener">{t(`مدرک ${n(d.index, lang)}`, `Document ${d.index}`)}</a></li>)}
              </ul>
            )) : null}
          </div>
          <div className="mt-4 border-t border-border-subtle pt-3">
            <Button size="sm" variant="secondary" onClick={() => run(() => adminAnimalSupportService.setListed(org.id, !org.isPubliclyListed), org.isPubliclyListed ? t("از فهرست عمومی خارج شد.", "Removed from the public list.") : t("در فهرست عمومی قرار گرفت.", "Added to the public list."))}>
              {org.isPubliclyListed ? t("خارج کردن از فهرست عمومی", "Remove from public list") : t("افزودن به فهرست عمومی", "Add to public list")}
            </Button>
          </div>
        </Panel>
        <Panel>
          <PanelTitle title={t("اعضای سازمان", "Organization staff")} />
          {members.length === 0 ? <p className="text-metadata text-text-secondary">{t("هنوز عضوی ندارد.", "No staff yet.")}</p> : members.map((m) => (
            <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle py-2 last:border-b-0">
              <span className="min-w-0 text-metadata text-text-primary">{m.displayName ?? "—"} <span className="break-all text-text-secondary" dir="ltr">{m.email}</span></span>
              <span className="flex items-center gap-2">
                <Tag tone={m.isActive ? "brand" : "neutral"}>{ROLE[m.role] ? t(ROLE[m.role]![0], ROLE[m.role]![1]) : m.role}{m.isActive ? "" : ` · ${t("غیرفعال", "inactive")}`}</Tag>
                {m.isActive ? <Button size="sm" variant="ghost" onClick={() => run(() => adminAnimalSupportService.revokeMember(org.id, m.id), t("دسترسی عضو لغو شد.", "Staff access revoked."))}>{t("لغو", "Revoke")}</Button> : null}
              </span>
            </div>
          ))}
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_160px_auto] sm:items-end">
            <Input label={t("ایمیل حساب PET LIFE", "PET LIFE account email")} dir="ltr" value={grantEmail} onChange={(e) => setGrantEmail(e.target.value)} />
            <FilterField label={t("نقش", "Role")}>
              <SelectFilter value={grantRole} onChange={(v) => setGrantRole(v === "all" ? "COORDINATOR" : v)} options={Object.keys(ROLE).map((k) => ({ value: k, label: fa ? ROLE[k]![0] : ROLE[k]![1] }))} />
            </FilterField>
            <Button disabled={!grantEmail.includes("@")} onClick={() => run(async () => { await adminAnimalSupportService.grantMember(org.id, grantEmail.trim(), grantRole); setGrantEmail(""); }, t("عضو اضافه شد.", "Staff member added."))}>{t("افزودن", "Add")}</Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- donations

export function AdminDonationsView() {
  const { lang, fa, t } = useLang();
  const [status, setStatus] = useState<string | "all">("SUCCEEDED");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; items: AdminDonationRow[] } | null>(null);
  const [error, setError] = useState<LoadError>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await adminAnimalSupportService.listDonations({ status: status === "all" ? undefined : status, page, pageSize: 25 }));
    } catch (e) {
      setError(toError(e));
    }
  }, [status, page]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <div>
      <AdminAnimalSupportNav />
      <h1 className="mb-2 text-page-title text-text-primary">{t("کمک‌های مالی", "Donations")}</h1>
      <p className="mb-4 text-metadata text-text-secondary">{t("بازپرداخت از طریق درگاه انجام می‌شود و فقط پس از تأیید درگاه، دفتر کل و مانده سازمان اصلاح می‌شوند. فقط نقش مالی مجاز است.", "Refunds go through the payment gateway; the ledger and the organization's balance change only after the gateway confirms. Finance role only.")}</p>
      {notice ? <p role="status" className="mb-3 text-metadata text-text-secondary">{notice}</p> : null}
      <FilterBar>
        <FilterField label={t("وضعیت", "Status")}>
          <SelectFilter value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: "all", label: t("همه", "All") }, ...Object.keys(DONATION_STATUS).map((s) => ({ value: s, label: fa ? DONATION_STATUS[s]![0] : DONATION_STATUS[s]![1] }))]} />
        </FilterField>
      </FilterBar>
      {error ? <LoadState error={error} perm="animalSupport.view" onRetry={load} /> : !data ? <Skeleton className="h-40 w-full" aria-label={t("در حال بارگذاری", "Loading")} /> : (
        <Panel>
          <TableWrap>
            <thead><tr><Th>{t("مبلغ", "Amount")}</Th><Th>{t("کارزار / سازمان", "Campaign / organization")}</Th><Th>{t("اهداکننده", "Donor")}</Th><Th>{t("وضعیت", "Status")}</Th><Th>{t("تاریخ", "Date")}</Th><Th>{""}</Th></tr></thead>
            <tbody>
              {data.items.length === 0 ? <EmptyRow colSpan={6} label={t("موردی نیست", "Nothing here")} /> : data.items.map((d) => (
                <tr key={d.id}>
                  <Td>{formatCurrency(d.amountIrr, lang)}</Td>
                  <Td>{d.campaign.title}<br /><span className="text-text-secondary">{d.organization.name}</span></Td>
                  <Td>{d.donorName ?? t("حساب حذف‌شده", "Deleted account")}{d.publicDisplayName ? <span className="text-text-secondary"> · {t("نام عمومی", "public as")} {d.publicDisplayName}</span> : null}</Td>
                  <Td><StatusTag map={DONATION_STATUS} value={d.status} /></Td>
                  <Td>{day(d.succeededAt ?? d.createdAt, lang)}</Td>
                  <Td>{d.status === "SUCCEEDED" ? <ReasonAction danger label={t("بازپرداخت", "Refund")} confirmLabel={t("بازپرداخت کامل", "Refund in full")} onRun={async (reason) => { await adminAnimalSupportService.refundDonation(d.id, reason); setNotice(t("بازپرداخت انجام شد.", "Refund completed.")); await load(); }} /> : null}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <Pager page={page} total={data.total} pageSize={25} onPage={setPage} />
        </Panel>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- lost pets

export function AdminLostPetsView() {
  const { lang, fa, t } = useLang();
  const [status, setStatus] = useState<string | "all">("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; items: AdminLostPetRow[] } | null>(null);
  const [error, setError] = useState<LoadError>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await adminAnimalSupportService.listLostPets({ status: status === "all" ? undefined : status, q: q.trim() || undefined, page, pageSize: 25 }));
    } catch (e) {
      setError(toError(e));
    }
  }, [status, q, page]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <div>
      <AdminAnimalSupportNav />
      <h1 className="mb-2 text-page-title text-text-primary">{t("حیوانات گم‌شده", "Lost pets")}</h1>
      <p className="mb-4 text-metadata text-text-secondary">{t("موقعیت دقیق پنهان است؛ نمایش آن نیاز به مجوز دادهٔ شخصی دارد و ثبت می‌شود.", "Exact locations are masked; revealing one needs the personal-data permission and is audited.")}</p>
      <FilterBar>
        <FilterField label={t("جست‌وجو", "Search")}><TextFilter value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder={t("نام حیوان یا محدوده", "Pet name or area")} /></FilterField>
        <FilterField label={t("وضعیت", "Status")}>
          <SelectFilter value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: "all", label: t("همه", "All") }, ...Object.keys(INCIDENT_STATUS).map((s) => ({ value: s, label: fa ? INCIDENT_STATUS[s]![0] : INCIDENT_STATUS[s]![1] }))]} />
        </FilterField>
      </FilterBar>
      {error ? <LoadState error={error} perm="trust.view" onRetry={load} /> : !data ? <Skeleton className="h-40 w-full" aria-label={t("در حال بارگذاری", "Loading")} /> : (
        <Panel>
          <TableWrap>
            <thead><tr><Th>{t("حیوان", "Pet")}</Th><Th>{t("محدودهٔ عمومی", "Public area")}</Th><Th>{t("مشاهده‌ها", "Sightings")}</Th><Th>{t("وضعیت", "Status")}</Th><Th>{t("ثبت", "Reported")}</Th></tr></thead>
            <tbody>
              {data.items.length === 0 ? <EmptyRow colSpan={5} label={t("موردی نیست", "Nothing here")} /> : data.items.map((row) => (
                <tr key={row.id}>
                  <Td><Link className="text-brand-natural underline" href={`/${lang}/admin/lost-pets/${row.id}`}>{row.petName}</Link></Td>
                  <Td>{row.publicArea ?? "—"}</Td>
                  <Td>{n(row.sightingsCount, lang)}</Td>
                  <Td><StatusTag map={INCIDENT_STATUS} value={row.status} /></Td>
                  <Td>{day(row.createdAt, lang)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <Pager page={page} total={data.total} pageSize={25} onPage={setPage} />
        </Panel>
      )}
    </div>
  );
}

export function AdminLostPetDetailView({ incidentId }: { incidentId: string }) {
  const { lang, t } = useLang();
  const [row, setRow] = useState<AdminLostPetDetail | null>(null);
  const [revealed, setRevealed] = useState<RevealedLocation | null>(null);
  const [error, setError] = useState<LoadError>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      setRow(await adminAnimalSupportService.getLostPet(incidentId));
    } catch (e) {
      setError(toError(e));
    }
  }, [incidentId]);
  useEffect(() => {
    void load();
  }, [load]);
  if (error) return <div><AdminAnimalSupportNav /><LoadState error={error} perm="trust.view" onRetry={load} /></div>;
  if (!row) return <div><AdminAnimalSupportNav /><Skeleton className="h-40 w-full" aria-label={t("در حال بارگذاری", "Loading")} /></div>;
  const closable = ["OPEN", "SEARCHING", "SIGHTING_REPORTED", "FOUND"].includes(row.status);
  return (
    <div>
      <AdminAnimalSupportNav />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-page-title text-text-primary">{row.pet.name}</h1>
        <StatusTag map={INCIDENT_STATUS} value={row.status} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] [&>*]:min-w-0">
        <Panel>
          <PanelTitle title={t("گزارش", "Report")} />
          {row.description ? <p className="mb-3 whitespace-pre-line text-body text-text-primary" dir="auto">{row.description}</p> : null}
          <DetailRow label={t("محدودهٔ عمومی", "Public area")}>{row.publicArea ?? "—"}</DetailRow>
          <DetailRow label={t("آخرین مشاهده", "Last seen")}>{day(row.lastSeenAt, lang)}</DetailRow>
          <DetailRow label={t("روش تماس", "Contact preference")}>{row.contactPreference}</DetailRow>
          <DetailRow label={t("ثبت", "Reported")}>{day(row.createdAt, lang)}</DetailRow>
          <DetailRow label={t("موقعیت دقیق", "Exact location")}>{row.exactLocationRecorded ? t("ثبت شده (پنهان)", "Recorded (masked)") : t("ثبت نشده", "Not recorded")}</DetailRow>
          {revealed ? (
            <div className="mt-3 rounded-md border border-state-attention p-3 text-metadata">
              <p className="mb-1 font-bold">{t("موقعیت دقیق (این مشاهده ثبت شد)", "Exact location (this view was audited)")}</p>
              <p dir="auto">{revealed.lastKnownLocation ?? "—"}</p>
              {revealed.lastKnownLatitude !== null ? <p dir="ltr">{revealed.lastKnownLatitude}, {revealed.lastKnownLongitude}</p> : null}
              {revealed.privateNotes ? <p dir="auto" className="mt-1 text-text-secondary">{revealed.privateNotes}</p> : null}
            </div>
          ) : null}
        </Panel>
        <Panel>
          <PanelTitle title={t("اقدام‌ها", "Actions")} />
          <div className="flex flex-col gap-2">
            {row.exactLocationRecorded && !revealed ? <ReasonAction label={t("نمایش موقعیت دقیق", "Reveal exact location")} confirmLabel={t("نمایش", "Reveal")} hint={t("نیاز به مجوز دادهٔ شخصی", "Needs the personal-data permission")} onRun={async (reason) => setRevealed(await adminAnimalSupportService.revealLostPetLocation(row.id, reason))} /> : null}
            {closable ? <ReasonAction danger label={t("بستن گزارش (گزارش نادرست یا سوءاستفاده)", "Close report (false or abusive)")} confirmLabel={t("بستن", "Close")} hint={t("وضعیت خود حیوان تغییر نمی‌کند.", "The pet's own status is not changed.")} onRun={async (reason) => { await adminAnimalSupportService.closeLostPet(row.id, reason); await load(); }} /> : <p className="text-metadata text-text-secondary">{t("این گزارش بسته است.", "This report is closed.")}</p>}
          </div>
        </Panel>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- reports

export function AdminReportsView() {
  const { lang, fa, t } = useLang();
  const [status, setStatus] = useState<string | "all">("OPEN");
  const [target, setTarget] = useState<ReportTargetFilter | "all">("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ total: number; items: CommunityReportDto[] } | null>(null);
  const [error, setError] = useState<LoadError>(null);
  const [notice, setNotice] = useState<ReactNode>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await adminAnimalSupportService.listReports({ status: status === "all" ? undefined : status, targetType: target === "all" ? undefined : target, page, pageSize: 25 }));
    } catch (e) {
      setError(toError(e));
    }
  }, [status, target, page]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <div>
      <AdminAnimalSupportNav />
      <h1 className="mb-2 text-page-title text-text-primary">{t("گزارش‌های کاربران", "User reports")}</h1>
      <p className="mb-4 text-metadata text-text-secondary">{t("ارجاع، پروندهٔ اعتماد و ایمنی را باز یا به پروندهٔ باز همان مورد وصل می‌کند؛ تصمیم نهایی در پرونده گرفته می‌شود. هویت گزارش‌دهنده نمایش داده نمی‌شود.", "Escalating opens a trust & safety case, or joins the open case for the same item; decisions are taken on the case. Reporter identity isn't shown.")}</p>
      {notice ? <p role="status" className="mb-3 text-metadata text-text-secondary">{notice}</p> : null}
      <FilterBar>
        <FilterField label={t("وضعیت", "Status")}>
          <SelectFilter value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[{ value: "all", label: t("همه", "All") }, ...Object.keys(REPORT_STATUS).map((s) => ({ value: s, label: fa ? REPORT_STATUS[s]![0] : REPORT_STATUS[s]![1] }))]} />
        </FilterField>
        <FilterField label={t("نوع مورد", "Item type")}>
          <SelectFilter<ReportTargetFilter> value={target} onChange={(v) => { setTarget(v); setPage(1); }} options={[{ value: "all", label: t("همه", "All") }, ...TARGETS.map((x) => ({ value: x.value, label: fa ? x.fa : x.en }))]} />
        </FilterField>
      </FilterBar>
      {error ? <LoadState error={error} perm="trust.view" onRetry={load} /> : !data ? <Skeleton className="h-40 w-full" aria-label={t("در حال بارگذاری", "Loading")} /> : (
        <Panel>
          <TableWrap>
            <thead><tr><Th>{t("مورد", "Item")}</Th><Th>{t("دلیل", "Reason")}</Th><Th>{t("توضیح گزارش‌دهنده", "Reporter's note")}</Th><Th>{t("وضعیت", "Status")}</Th><Th>{t("تاریخ", "Date")}</Th><Th>{""}</Th></tr></thead>
            <tbody>
              {data.items.length === 0 ? <EmptyRow colSpan={6} label={t("گزارشی نیست", "No reports")} /> : data.items.map((r) => {
                const itemTarget = reportTarget(r);
                return (
                  <tr key={r.id}>
                    <Td>{itemTarget.href ? <Link className="text-brand-natural underline" href={`/${lang}${itemTarget.href}`}>{t(itemTarget.label[0], itemTarget.label[1])}</Link> : t(itemTarget.label[0], itemTarget.label[1])}</Td>
                    <Td>{REPORT_REASON[r.reason] ? t(REPORT_REASON[r.reason]![0], REPORT_REASON[r.reason]![1]) : r.reason}</Td>
                    <Td><span dir="auto">{r.details ?? "—"}</span></Td>
                    <Td><StatusTag map={REPORT_STATUS} value={r.status} />{r.trustCaseId ? <> <Link className="text-metadata text-brand-natural underline" href={`/${lang}/admin/trust/${r.trustCaseId}`}>{t("پرونده", "Case")}</Link></> : null}</Td>
                    <Td>{day(r.createdAt, lang)}</Td>
                    <Td>
                      {r.status === "OPEN" ? (
                        <div className="flex min-w-[200px] flex-col gap-2">
                          <ReasonAction label={t("ارجاع به پرونده", "Escalate")} confirmLabel={t("ارجاع", "Escalate")} onRun={async (reason) => { const res = await adminAnimalSupportService.escalateReport(r.id, reason); setNotice(<Link className="underline" href={`/${lang}/admin/trust/${res.trustCaseId}`}>{t("گزارش ارجاع شد — مشاهدهٔ پرونده", "Escalated — open the case")}</Link>); await load(); }} />
                          <ReasonAction label={t("رد گزارش", "Dismiss")} confirmLabel={t("رد", "Dismiss")} minLength={0} onRun={async (reason) => { await adminAnimalSupportService.dismissReport(r.id, reason || undefined); await load(); }} />
                        </div>
                      ) : null}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
          <Pager page={page} total={data.total} pageSize={25} onPage={setPage} />
        </Panel>
      )}
    </div>
  );
}
