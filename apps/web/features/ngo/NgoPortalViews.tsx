"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { Button, EmptyState, ErrorRecovery, Input, Skeleton, StatusLabel } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { formatCurrency } from "@/lib/currency/format-currency";
import { formatDay, localizeDigits } from "@/lib/date/jalali";
import { ngoService, selectNgo, selectedNgo, type NgoDonationRow, type NgoMembership, type NgoOffer, type NgoOverview, type NgoRole, type NgoVerification } from "@/services/ngo.service";
import { OFFER_TONE } from "@/features/animal-support/SupportOfferInbox";
import type { SupportNeedListingDto } from "@petlife/types";
import { apiErrorText } from "@/lib/errors/api-error-text";

type Lang = "fa" | "en";
const useLang = () => {
  const lang = useLocale() as Lang;
  return { lang, fa: lang === "fa" };
};
const ROLE: Record<NgoRole, [string, string]> = { OWNER: ["مالک", "Owner"], COORDINATOR: ["هماهنگ‌کننده", "Coordinator"], VIEWER: ["بیننده", "Viewer"] };
const VERIFY: Record<string, [string, string, "success" | "attention" | "neutral" | "higherConcern"]> = {
  NOT_STARTED: ["ارسال نشده", "Not submitted", "neutral"],
  SUBMITTED: ["در انتظار بررسی", "Awaiting review", "attention"],
  UNDER_REVIEW: ["در حال بررسی", "Under review", "attention"],
  NEEDS_INFORMATION: ["نیازمند اطلاعات بیشتر", "Needs information", "attention"],
  VERIFIED: ["تأییدشده", "Verified", "success"],
  REJECTED: ["رد شده", "Rejected", "higherConcern"],
};

function useNgoGate() {
  const [state, setState] = useState<"loading" | "ready" | "none" | "signIn" | "error">("loading");
  const [memberships, setMemberships] = useState<NgoMembership[]>([]);
  const [role, setRole] = useState<NgoRole | null>(null);
  const load = useCallback(async () => {
    try {
      const me = await ngoService.me();
      setMemberships(me.memberships);
      setRole(me.current.role);
      if (!selectedNgo()) selectNgo(me.current.organizationId);
      setState("ready");
    } catch (e) {
      setState(e instanceof ApiError ? (e.status === 401 ? "signIn" : e.status === 403 ? "none" : "error") : "error");
    }
  }, []);
  useEffect(() => void load(), [load]);
  return { state, memberships, role, reload: load };
}

/** NGO OPERATIONAL PATTERN — shared frame: organization switcher and section navigation. */
export function NgoFrame({ children }: { children: (ctx: { role: NgoRole }) => React.ReactNode }) {
  const { lang, fa } = useLang();
  const pathname = usePathname() ?? "";
  const gate = useNgoGate();
  if (gate.state === "loading") return <Skeleton className="h-64 w-full" />;
  if (gate.state === "signIn") return <EmptyState title={fa ? "برای ورود به پرتال سازمان وارد حساب شوید" : "Sign in to open the organization portal"} />;
  if (gate.state === "none") return <EmptyState title={fa ? "شما عضو هیچ سازمان حمایت از حیوانات نیستید" : "You are not a member of an animal-support organization"} description={fa ? "مالک سازمان یا تیم PET LIFE می‌تواند شما را اضافه کند." : "The organization's owner or the PET LIFE team can add you."} />;
  if (gate.state === "error" || !gate.role) return <ErrorRecovery title={fa ? "بارگیری نشد" : "Could not load"} message="" retryLabel={fa ? "تلاش دوباره" : "Try again"} onRetry={() => void gate.reload()} />;
  const base = `/${lang}/ngo`;
  const items = [["", fa ? "نمای کلی" : "Overview"], ["/needs", fa ? "نیازها" : "Needs"], ["/offers", fa ? "پیشنهادها و داوطلبان" : "Offers & volunteers"], ["/donations", fa ? "کمک‌های مالی" : "Donations"], ["/team", fa ? "تیم" : "Team"], ["/verification", fa ? "احراز" : "Verification"], ["/settings", fa ? "تنظیمات" : "Settings"]] as const;
  const current = selectedNgo();
  return (
    <div className="flex flex-col gap-5">
      {gate.memberships.length > 1 ? (
        <label className="flex max-w-sm flex-col gap-1 text-sm">
          {fa ? "سازمان" : "Organization"}
          <select value={current ?? ""} onChange={(e) => { selectNgo(e.target.value); location.reload(); }} className="min-h-11 rounded-md border border-border-subtle bg-surface-base px-2">
            {gate.memberships.map((m) => <option key={m.organizationId} value={m.organizationId}>{m.organization.name}</option>)}
          </select>
        </label>
      ) : null}
      <nav aria-label={fa ? "پرتال سازمان" : "Organization portal"} className="flex gap-1 overflow-x-auto border-b border-border-subtle">
        {items.map(([href, label]) => {
          const full = `${base}${href}`;
          const active = href === "" ? pathname === full : pathname.startsWith(full);
          return <Link key={href} href={full} aria-current={active ? "page" : undefined} className={`shrink-0 px-3 py-2 text-sm ${active ? "border-b-2 border-brand-natural font-bold" : "text-text-secondary"}`}>{label}</Link>;
        })}
      </nav>
      {children({ role: gate.role })}
    </div>
  );
}

export function NgoOverviewView() {
  const { lang, fa } = useLang();
  const [data, setData] = useState<NgoOverview | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    ngoService.overview().then(setData).catch(() => setError(true));
  }, []);
  return (
    <NgoFrame>
      {() =>
        error ? <ErrorRecovery title={fa ? "بارگیری نشد" : "Could not load"} message="" retryLabel={fa ? "تلاش دوباره" : "Try again"} onRetry={() => location.reload()} /> : !data ? <Skeleton className="h-48" /> : (
          <div className="flex flex-col gap-4">
            <header className="flex flex-wrap items-center gap-3">
              <h1 className="text-page-title">{data.organization.name}</h1>
              <StatusLabel tone={VERIFY[data.organization.verificationStatus]?.[2] ?? "neutral"}>{VERIFY[data.organization.verificationStatus]?.[fa ? 0 : 1] ?? data.organization.verificationStatus}</StatusLabel>
              <span className="text-metadata text-text-secondary">{ROLE[data.role][fa ? 0 : 1]}</span>
            </header>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {([
                [fa ? "نیازهای فعال" : "Live needs", localizeDigits(data.needs.live, lang), `/${lang}/ngo/needs`],
                [fa ? "پیشنهادهای در انتظار" : "Offers waiting", localizeDigits(data.offers.pending, lang), `/${lang}/ngo/offers?status=PENDING`],
                [fa ? "کمک مالی ۳۰ روز اخیر" : "Donations, last 30 days", formatCurrency(data.donations.receivedLast30DaysIrr, lang), `/${lang}/ngo/donations`],
                [fa ? "اعضای تیم" : "Team members", localizeDigits(data.teamSize, lang), `/${lang}/ngo/team`],
              ] as const).map(([label, value, href]) => (
                <li key={label}><Link href={href} className="block rounded-md border border-border-subtle bg-surface-elevated p-3 hover:border-border-strong"><span className="block text-metadata text-text-secondary">{label}</span><span className="mt-1 block text-section-title tabular-nums">{value}</span></Link></li>
              ))}
            </ul>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-border-subtle p-3 text-sm">
                <p className="font-bold">{fa ? "موجودی کمک‌های مالی (از دفتر کل)" : "Donation balance (from the ledger)"}</p>
                <p>{fa ? "عمومی: " : "General: "}{formatCurrency(data.donations.generalAvailableIrr, lang)}</p>
                <p>{fa ? "محدود به هدف: " : "Restricted: "}{formatCurrency(data.donations.restrictedAvailableIrr, lang)}</p>
                <p className="text-metadata text-text-secondary">{fa ? "پرداخت به سازمان را تیم مالی PET LIFE انجام و ثبت می‌کند؛ این عدد قابل ویرایش نیست." : "Payouts are made and recorded by PET LIFE finance; this figure cannot be edited."}</p>
              </div>
              <div className="rounded-md border border-border-subtle p-3 text-sm">
                <p className="font-bold">{fa ? "وضعیت نیازها" : "Needs status"}</p>
                <p>{fa ? `در انتظار بررسی: ${localizeDigits(data.needs.pendingReview, "fa")}` : `In review: ${data.needs.pendingReview}`}</p>
                <p>{fa ? `بخشی تأمین‌شده: ${localizeDigits(data.needs.partiallyFulfilled, "fa")}` : `Partly fulfilled: ${data.needs.partiallyFulfilled}`}</p>
                <p>{fa ? `تأمین‌شده: ${localizeDigits(data.needs.fulfilled, "fa")}` : `Fulfilled: ${data.needs.fulfilled}`}</p>
                {data.needs.needsChanges ? <p className="text-state-attention">{fa ? `نیازمند اصلاح: ${localizeDigits(data.needs.needsChanges, "fa")}` : `Needs changes: ${data.needs.needsChanges}`}</p> : null}
              </div>
            </div>
          </div>
        )
      }
    </NgoFrame>
  );
}

export function NgoNeedsView() {
  const { lang, fa } = useLang();
  const t = useTranslations("supportNeeds");
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<SupportNeedListingDto[] | null>(null);
  useEffect(() => {
    setRows(null);
    ngoService.needs(status || undefined).then((r) => setRows(r.items)).catch(() => setRows([]));
  }, [status]);
  return (
    <NgoFrame>
      {({ role }) => (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-page-title">{fa ? "نیازهای سازمان" : "Organization needs"}</h1>
            {role !== "VIEWER" ? <Link href={`/${lang}/animal-support/needs/new`} className="inline-flex min-h-11 items-center rounded-full bg-brand-natural px-4 text-sm font-bold text-text-inverse">{fa ? "ثبت نیاز" : "New need"}</Link> : null}
          </div>
          <div role="group" aria-label={fa ? "وضعیت" : "Status"} className="flex gap-2 overflow-x-auto">
            {["", "PUBLISHED", "PARTIALLY_FULFILLED", "PAUSED", "PENDING_REVIEW", "REJECTED", "FULFILLED", "EXPIRED"].map((s) => <button key={s || "all"} aria-pressed={status === s} onClick={() => setStatus(s)} className={`min-h-10 shrink-0 rounded-full border px-3 text-sm ${status === s ? "border-brand-natural bg-brand-natural/10" : "border-border-subtle text-text-secondary"}`}>{s ? t(`status.${s}`) : fa ? "همه" : "All"}</button>)}
          </div>
          {rows === null ? <Skeleton className="h-40" /> : rows.length === 0 ? <EmptyState title={fa ? "نیازی در این وضعیت نیست" : "No needs in this state"} /> : (
            <ul className="flex flex-col gap-2">
              {rows.map((n) => (
                <li key={n.id}>
                  <Link href={`/${lang}/animal-support/needs/${n.id}/manage`} className="flex flex-col gap-1 rounded-md border border-border-subtle bg-surface-elevated p-3 hover:border-border-strong">
                    <span className="flex flex-wrap items-center justify-between gap-2"><span className="font-bold">{n.title}</span><StatusLabel tone={n.status === "PUBLISHED" || n.status === "PARTIALLY_FULFILLED" || n.status === "FULFILLED" ? "success" : n.status === "REJECTED" ? "attention" : "neutral"}>{t(`status.${n.status}`)}</StatusLabel></span>
                    <span className="text-metadata text-text-secondary">{t(`category.${n.category}`)} · {n.city}{n.neededQuantity !== null ? ` · ${localizeDigits(n.fulfilledQuantity, lang)}/${localizeDigits(n.neededQuantity, lang)}` : ""}{n.expiresAt ? ` · ${fa ? "مهلت" : "until"} ${formatDay(n.expiresAt.slice(0, 10), lang, { year: false })}` : ""}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </NgoFrame>
  );
}

export function NgoOffersView() {
  const { lang, fa } = useLang();
  const t = useTranslations("supportNeeds");
  const [status, setStatus] = useState(() => (typeof window === "undefined" ? "" : new URLSearchParams(location.search).get("status") ?? ""));
  const [volunteer, setVolunteer] = useState(false);
  const [rows, setRows] = useState<NgoOffer[] | null>(null);
  useEffect(() => {
    setRows(null);
    ngoService.offers({ status: status || undefined, volunteer }).then((r) => setRows(r.items)).catch(() => setRows([]));
  }, [status, volunteer]);
  return (
    <NgoFrame>
      {() => (
        <div className="flex flex-col gap-4">
          <h1 className="text-page-title">{fa ? "پیشنهادهای کمک و داوطلبان" : "Help offers & volunteers"}</h1>
          <div className="flex flex-wrap gap-2">
            {["", "PENDING", "ACCEPTED", "IN_PROGRESS", "COMPLETED"].map((s) => <button key={s || "all"} aria-pressed={status === s} onClick={() => setStatus(s)} className={`min-h-10 rounded-full border px-3 text-sm ${status === s ? "border-brand-natural bg-brand-natural/10" : "border-border-subtle text-text-secondary"}`}>{s ? t(`offerStatus.${s}`) : fa ? "همه" : "All"}</button>)}
            <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={volunteer} onChange={(e) => setVolunteer(e.target.checked)} />{fa ? "فقط داوطلبی" : "Volunteering only"}</label>
          </div>
          <p className="text-metadata text-text-secondary">{fa ? "اطلاعات تماس کمک‌کنندگان نمایش داده نمی‌شود؛ پاسخ به هر پیشنهاد از صفحهٔ مدیریت همان نیاز انجام می‌شود." : "Helpers' contact details are never shown; answer each offer from its need's manage page."}</p>
          {rows === null ? <Skeleton className="h-40" /> : rows.length === 0 ? <EmptyState title={fa ? "پیشنهادی نیست" : "No offers"} /> : (
            <ul className="flex flex-col gap-2">
              {rows.map((o) => (
                <li key={o.id} className="flex flex-col gap-1 rounded-md border border-border-subtle p-3 text-sm">
                  <span className="flex flex-wrap items-center gap-2"><StatusLabel tone={OFFER_TONE[o.status]}>{t(`offerStatus.${o.status}`)}</StatusLabel><span className="text-text-secondary">{t(`category.${o.helpType}`)}{o.quantity !== null ? ` ×${localizeDigits(o.quantity, lang)}` : ""} · {formatDay(o.createdAt.slice(0, 10), lang)}</span></span>
                  <p>{o.message}</p>
                  {o.timing ? <p className="text-text-secondary">{fa ? "زمان: " : "Timing: "}{o.timing}</p> : null}
                  <Link className="w-fit underline" href={`/${lang}/animal-support/needs/${o.listingId}/manage`}>{o.listingTitle}</Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </NgoFrame>
  );
}

export function NgoDonationsView() {
  const { lang, fa } = useLang();
  const [data, setData] = useState<{ items: NgoDonationRow[]; total: number; balance: { generalAvailableIrr: number; restrictedAvailableIrr: number; paidIrr: number } } | null>(null);
  const [page, setPage] = useState(1);
  useEffect(() => {
    ngoService.donations(page).then(setData).catch(() => setData({ items: [], total: 0, balance: { generalAvailableIrr: 0, restrictedAvailableIrr: 0, paidIrr: 0 } }));
  }, [page]);
  return (
    <NgoFrame>
      {() => (
        <div className="flex flex-col gap-4">
          <h1 className="text-page-title">{fa ? "کمک‌های مالی" : "Donations"}</h1>
          {!data ? <Skeleton className="h-40" /> : (
            <>
              <dl className="grid gap-3 sm:grid-cols-3">
                {([[fa ? "موجودی عمومی" : "General available", data.balance.generalAvailableIrr], [fa ? "موجودی محدود به هدف" : "Restricted available", data.balance.restrictedAvailableIrr], [fa ? "پرداخت‌شده به سازمان" : "Paid out", data.balance.paidIrr]] as const).map(([label, v]) => <div key={label} className="rounded-md border border-border-subtle p-3"><dt className="text-metadata text-text-secondary">{label}</dt><dd className="font-bold tabular-nums">{formatCurrency(v, lang)}</dd></div>)}
              </dl>
              <p className="text-metadata text-text-secondary">{fa ? "ارقام از دفتر کل کمک‌های مالی خوانده می‌شوند و قابل ویرایش نیستند. هویت اهداکننده فقط اگر خودش نامی برای نمایش انتخاب کرده باشد نشان داده می‌شود." : "Figures come from the donation ledger and cannot be edited. A donor is only named if they chose a public name."}</p>
              {data.items.length === 0 ? <EmptyState title={fa ? "هنوز کمک مالی ثبت نشده" : "No donations yet"} /> : (
                <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={fa ? "فهرست کمک‌های مالی" : "Donations list"}>
                  <table className="w-full min-w-[520px] text-sm">
                    <thead><tr className="text-text-secondary"><th className="p-2 text-start">{fa ? "تاریخ" : "Date"}</th><th className="p-2 text-start">{fa ? "کارزار" : "Campaign"}</th><th className="p-2 text-start">{fa ? "نوع" : "Type"}</th><th className="p-2 text-start">{fa ? "اهداکننده" : "Donor"}</th><th className="p-2 text-end">{fa ? "مبلغ" : "Amount"}</th></tr></thead>
                    <tbody>{data.items.map((d) => <tr key={d.id} className="border-t border-border-subtle"><td className="p-2">{formatDay(d.createdAt.slice(0, 10), lang)}</td><td className="p-2">{d.campaign.title}</td><td className="p-2">{d.fundType === "RESTRICTED" ? (fa ? "محدود" : "Restricted") : fa ? "عمومی" : "General"}</td><td className="p-2">{d.donorName ?? (fa ? "ناشناس" : "Anonymous")}</td><td className="p-2 text-end tabular-nums">{formatCurrency(d.amountIrr, lang)}{d.refundedAt ? <span className="block text-metadata text-text-secondary">{fa ? "بازپرداخت شد" : "refunded"}</span> : null}</td></tr>)}</tbody>
                  </table>
                </div>
              )}
              {data.total > 20 ? <div className="flex gap-2"><Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>{fa ? "قبلی" : "Previous"}</Button><Button size="sm" variant="secondary" disabled={page * 20 >= data.total} onClick={() => setPage(page + 1)}>{fa ? "بعدی" : "Next"}</Button></div> : null}
            </>
          )}
        </div>
      )}
    </NgoFrame>
  );
}

export function NgoTeamView() {
  const { fa } = useLang();
  const [rows, setRows] = useState<Awaited<ReturnType<typeof ngoService.team>> | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<NgoRole>("COORDINATOR");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(() => {
    ngoService.team().then(setRows).catch(() => setRows([]));
  }, []);
  useEffect(load, [load]);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
      load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof ApiError ? (e.status === 404 ? (fa ? "حسابی با این ایمیل پیدا نشد." : "No account with that e-mail.") : e.status === 400 ? (fa ? "آخرین مالک را نمی‌توان حذف کرد." : "The last owner cannot be removed.") : e.message) : fa ? "انجام نشد." : "Failed." });
    }
  };
  return (
    <NgoFrame>
      {({ role: myRole }) => (
        <div className="flex flex-col gap-4">
          <h1 className="text-page-title">{fa ? "تیم سازمان" : "Team"}</h1>
          {msg ? <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-state-success" : "text-state-urgent"}`}>{msg.text}</p> : null}
          {rows === null ? <Skeleton className="h-32" /> : (
            <ul className="flex flex-col gap-2">
              {rows.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-subtle p-3 text-sm">
                  <span>{m.displayName ?? "—"} · {ROLE[m.role][fa ? 0 : 1]}{m.isActive ? "" : fa ? " · غیرفعال" : " · inactive"}</span>
                  {myRole === "OWNER" ? (
                    <span className="flex gap-2">
                      <select aria-label={fa ? "نقش" : "Role"} value={m.role} onChange={(e) => void run(() => ngoService.updateMember(m.id, { role: e.target.value as NgoRole }), fa ? "نقش تغییر کرد." : "Role changed.")} className="min-h-10 rounded-md border border-border-subtle bg-surface-base px-2">
                        {(Object.keys(ROLE) as NgoRole[]).map((r) => <option key={r} value={r}>{ROLE[r][fa ? 0 : 1]}</option>)}
                      </select>
                      <Button size="sm" variant="ghost" onClick={() => void run(() => ngoService.updateMember(m.id, { isActive: !m.isActive }), fa ? "به‌روز شد." : "Updated.")}>{m.isActive ? (fa ? "غیرفعال" : "Deactivate") : fa ? "فعال" : "Activate"}</Button>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {myRole === "OWNER" ? (
            <div className="flex flex-col gap-2 rounded-md border border-border-subtle p-3">
              <h2 className="font-bold">{fa ? "افزودن عضو" : "Add a member"}</h2>
              <p className="text-metadata text-text-secondary">{fa ? "فرد باید از قبل حساب PET LIFE داشته باشد." : "The person must already have a PET LIFE account."}</p>
              <Input label={fa ? "ایمیل" : "E-mail"} dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <select aria-label={fa ? "نقش" : "Role"} value={role} onChange={(e) => setRole(e.target.value as NgoRole)} className="min-h-11 rounded-md border border-border-subtle bg-surface-base px-2">
                {(Object.keys(ROLE) as NgoRole[]).map((r) => <option key={r} value={r}>{ROLE[r][fa ? 0 : 1]}</option>)}
              </select>
              <Button disabled={!email.includes("@")} onClick={() => void run(async () => { await ngoService.addMember(email.trim(), role); setEmail(""); }, fa ? "عضو اضافه شد." : "Member added.")}>{fa ? "افزودن" : "Add"}</Button>
            </div>
          ) : null}
          <p className="text-metadata text-text-secondary">{fa ? "مالک: تیم، احراز و مشخصات · هماهنگ‌کننده: نیازها، پیشنهادها و داوطلبان · بیننده: فقط مشاهده" : "Owner: team, verification and profile · Coordinator: needs, offers and volunteers · Viewer: read only"}</p>
        </div>
      )}
    </NgoFrame>
  );
}

export function NgoVerificationView() {
  const { lang, fa } = useLang();
  const [v, setV] = useState<NgoVerification | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(() => {
    ngoService.verification().then(setV).catch(() => setV(null));
  }, []);
  useEffect(load, [load]);
  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const keys: string[] = [];
      for (const file of files) {
        const target = await ngoService.verificationUpload(file.type, file.size);
        await fetch(target.uploadUrl, { method: "PUT", headers: target.headers, body: file });
        keys.push(target.key);
      }
      setV(await ngoService.submitVerification(keys));
      setFiles([]);
      setMsg({ ok: true, text: fa ? "برای بررسی ارسال شد." : "Submitted for review." });
    } catch (e) {
      setMsg({ ok: false, text: apiErrorText(e, lang, fa ? "ارسال نشد." : "Not submitted.")});
    } finally {
      setBusy(false);
    }
  };
  return (
    <NgoFrame>
      {({ role }) => !v ? <Skeleton className="h-32" /> : (
        <div className="flex flex-col gap-4">
          <h1 className="text-page-title">{fa ? "احراز سازمان" : "Organization verification"}</h1>
          <StatusLabel tone={VERIFY[v.status]?.[2] ?? "neutral"}>{VERIFY[v.status]?.[fa ? 0 : 1] ?? v.status}</StatusLabel>
          {v.submittedAt ? <p className="text-sm text-text-secondary">{fa ? "ارسال: " : "Submitted: "}{formatDay(v.submittedAt.slice(0, 10), lang)} · {fa ? `${localizeDigits(v.documentCount, "fa")} مدرک` : `${v.documentCount} document(s)`}</p> : null}
          {v.note ? <p className="rounded-md bg-state-attention/10 p-3 text-sm text-state-attention">{fa ? "یادداشت PET LIFE: " : "PET LIFE note: "}{v.note}</p> : null}
          <p className="text-sm text-text-secondary">{fa ? "مدارک (مثلاً مجوز یا ثبت رسمی) خصوصی می‌مانند و فقط تیم PET LIFE برای بررسی آن‌ها را می‌بیند؛ هرگز در صفحهٔ عمومی نمایش داده نمی‌شوند." : "Documents (e.g. registration or permit) stay private and are seen only by the PET LIFE team for review; never on the public page."}</p>
          {v.canSubmit && role === "OWNER" ? (
            <div className="flex flex-col gap-2 rounded-md border border-border-subtle p-3">
              <label className="flex flex-col gap-1 text-sm">{fa ? "مدارک (PDF یا تصویر، حداکثر ۱۰)" : "Documents (PDF or image, up to 10)"}<input type="file" multiple accept="application/pdf,image/jpeg,image/png" onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 10))} /></label>
              {msg ? <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-state-success" : "text-state-urgent"}`}>{msg.text}</p> : null}
              <Button disabled={files.length === 0} isLoading={busy} onClick={() => void submit()}>{fa ? "ارسال برای بررسی" : "Submit for review"}</Button>
            </div>
          ) : msg ? <p role="status" className="text-sm text-state-success">{msg.text}</p> : null}
        </div>
      )}
    </NgoFrame>
  );
}

export function NgoSettingsView() {
  const { fa } = useLang();
  const [o, setO] = useState<NgoOverview["organization"] | null>(null);
  const [form, setForm] = useState({ description: "", location: "", contactEmail: "", contactPhone: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    ngoService.overview().then((d) => { setO(d.organization); setForm({ description: d.organization.description ?? "", location: d.organization.location ?? "", contactEmail: d.organization.contactEmail ?? "", contactPhone: d.organization.contactPhone ?? "" }); }).catch(() => setO(null));
  }, []);
  return (
    <NgoFrame>
      {({ role }) => !o ? <Skeleton className="h-32" /> : (
        <div className="flex max-w-2xl flex-col gap-3">
          <h1 className="text-page-title">{fa ? "مشخصات عمومی سازمان" : "Public profile"}</h1>
          <p className="text-sm text-text-secondary">{fa ? "نام، نوع و وضعیت احراز را فقط تیم PET LIFE تغییر می‌دهد. اطلاعات تماس رسمی سازمان در صفحهٔ عمومی دیده می‌شود؛ شماره یا ایمیل شخصی ننویسید." : "Name, type and verification are changed only by PET LIFE. The organization's official contact appears publicly; don't use a personal number or e-mail."}</p>
          <label className="flex flex-col gap-1 text-sm">{fa ? "دربارهٔ سازمان" : "About"}<textarea dir="auto" disabled={role !== "OWNER"} value={form.description} maxLength={4000} onChange={(e) => setForm({ ...form, description: e.target.value })} className="min-h-28 rounded-md border border-border-subtle bg-surface-base p-2" /></label>
          <Input dir="auto" label={fa ? "محدوده (شهر/منطقه)" : "Area (city/district)"} disabled={role !== "OWNER"} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          <Input dir="ltr" label={fa ? "ایمیل رسمی" : "Official e-mail"} disabled={role !== "OWNER"} value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
          <Input dir="ltr" label={fa ? "تلفن رسمی" : "Official phone"} disabled={role !== "OWNER"} value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} />
          {msg ? <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-state-success" : "text-state-urgent"}`}>{msg.text}</p> : null}
          {role === "OWNER" ? <Button onClick={() => void ngoService.updateProfile({ description: form.description.trim() || undefined, location: form.location.trim() || undefined, contactEmail: form.contactEmail.trim() || null, contactPhone: form.contactPhone.trim() || null }).then(() => setMsg({ ok: true, text: fa ? "ذخیره شد." : "Saved." })).catch((e) => setMsg({ ok: false, text: apiErrorText(e, undefined, fa ? "ذخیره نشد." : "Not saved.")}))}>{fa ? "ذخیره" : "Save"}</Button> : null}
        </div>
      )}
    </NgoFrame>
  );
}
