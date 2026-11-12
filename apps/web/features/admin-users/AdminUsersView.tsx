"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button, ContextSurface, Dialog, Input, Select, Download, Filter, ShoppingBag, Activity, Hotel, LifeBuoy, LogIn, UserPlus, Star, Receipt, CircleAlert, Wallet } from "@petlife/ui";
import type { AdminCustomerSegment, AdminUserBehaviorDto, AdminUserDirectoryRowDto, AdminUserProfileDto, AdminUserRoleKind, AdminUserTimelineKind } from "@petlife/types";
import { useAdminStore } from "@/stores/admin-store";
import { ApiError, apiFetch } from "@/lib/api/client";
import { adminUsersService } from "@/services/admin-users.service";
import { ColumnChart } from "@/features/admin/reports/charts";
import { asLocale, downloadCsv, fmtCompact, fmtDay } from "@/features/admin/reports/report-format";
import "@/features/admin/admin-glass.css";

const KINDS: AdminUserRoleKind[] = ["ADMIN_INTERNAL", "CUSTOMER", "CLINIC", "GROOMER", "HOST", "PROVIDER_OTHER", "SHOP", "INSURER", "NGO"];
const SEGMENTS: AdminCustomerSegment[] = ["NEW", "VIP", "ACTIVE", "AT_RISK", "DORMANT", "NEVER_PURCHASED"];
const SORTS = ["newest", "oldest", "lastActive", "spend", "orders", "bookings"] as const;
const ACTIVITY = ["", "active7", "active30", "active90", "inactive30", "inactive90", "inactive180"] as const;
const FLAGS = ["hasServiceBooking", "hasTravelBooking", "hasCancellations", "hasSupportCases"] as const;
const PROFILE_TABS = ["profile", "activity", "households", "businesses", "orders", "requests", "tickets", "reviews", "audit"] as const;
type ProfileTab = typeof PROFILE_TABS[number];
type Flag = typeof FLAGS[number];

type Filters = {
  q: string; kind: string; status: string; segment: string; sort: string; joinedFrom: string; joinedTo: string;
  activity: string; minOrders: string; minSpend: string; page: number;
} & Record<Flag, string>;
const EMPTY: Filters = { q: "", kind: "", status: "", segment: "", sort: "", joinedFrom: "", joinedTo: "", activity: "", minOrders: "", minSpend: "", page: 1, hasServiceBooking: "", hasTravelBooking: "", hasCancellations: "", hasSupportCases: "" };
const FILTER_KEYS = Object.keys(EMPTY).filter((k) => k !== "page" && k !== "activity") as (keyof Filters)[];

type Result = { key: string; rows: AdminUserDirectoryRowDto[]; total: number; profile: AdminUserProfileDto | null; error?: "failed" | "forbidden" | "notFound" };

/** Filters → API query. Only set keys are sent, so the request stays exactly what the admin chose. */
function toParams(filter: Filters) {
  const params = new URLSearchParams({ page: String(filter.page), pageSize: "20" });
  for (const key of FILTER_KEYS) {
    const value = String(filter[key] ?? "").trim();
    if (value) params.set(key, value);
  }
  const match = /^(active|inactive)(\d+)$/.exec(filter.activity);
  if (match) params.set(match[1] === "active" ? "activeWithinDays" : "inactiveForDays", match[2]!);
  return params;
}

function fromSearch(search: string): Filters {
  const params = new URLSearchParams(search);
  const next: Filters = { ...EMPTY };
  for (const key of FILTER_KEYS) { const v = params.get(key); if (v) (next as Record<string, unknown>)[key] = v; }
  if (params.get("activeWithinDays")) next.activity = `active${params.get("activeWithinDays")}`;
  if (params.get("inactiveForDays")) next.activity = `inactive${params.get("inactiveForDays")}`;
  const page = Number(params.get("page"));
  if (Number.isInteger(page) && page > 1) next.page = page;
  return next;
}

export function AdminUsersView({ id }: { id?: string }) {
  return <Directory key={id ?? "list"} id={id} />;
}

function Directory({ id }: { id?: string }) {
  const t = useTranslations("adminUsers"), roles = useTranslations("adminAccess.roles"), locale = useLocale();
  const loc = asLocale(locale);
  const context = useAdminStore(s => s.context);
  const allowed = !!context?.isAdmin && context.permissions.includes("customer.view");
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [filter, setFilter] = useState<Filters>(EMPTY);
  const [advanced, setAdvanced] = useState(false);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  // The first request waits until deep-link filters are read, so a shared link costs one request, not two.
  const [seeded, setSeeded] = useState(Boolean(id));
  const key = JSON.stringify([id, filter, retry, context?.adminUserId, context?.role, allowed]);

  // Deep links (?segment=VIP from reports, ?q= from the command palette) seed the filters once.
  useEffect(() => {
    if (id || typeof window === "undefined") return;
    if (window.location.search) {
      const initial = fromSearch(window.location.search);
      setDraft(initial);
      setFilter(initial);
      if (initial.joinedFrom || initial.joinedTo || initial.minOrders || initial.minSpend || initial.activity || FLAGS.some(f => initial[f])) setAdvanced(true);
    }
    setSeeded(true);
  }, [id]);

  useEffect(() => {
    if (!allowed || !seeded) return;
    const controller = new AbortController();
    const params = toParams(filter);
    if (!id && typeof window !== "undefined") {
      const shown = new URLSearchParams(params); shown.delete("pageSize"); if (shown.get("page") === "1") shown.delete("page");
      const qs = shown.toString();
      window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    }
    const request = id
      ? adminUsersService.detail(id, controller.signal).then(profile => ({ rows: [profile.user], total: 1, profile }))
      : adminUsersService.list(params, controller.signal).then(data => ({ rows: data.items, total: data.total, profile: null }));
    void request.then(data => { if (!controller.signal.aborted) setResult({ ...data, key }); })
      .catch(error => {
        if (!controller.signal.aborted) setResult({ key, rows: [], total: 0, profile: null, error: error instanceof ApiError && error.status === 403 ? "forbidden" : id && error instanceof ApiError && error.status === 404 ? "notFound" : "failed" });
      });
    return () => controller.abort();
  }, [allowed, seeded, filter, id, key]);

  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const money = (value: number) => t("moneyCompact", { amount: fmtCompact(value, loc) });
  const date = (value: string | null) => value && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : t("notRecorded");
  const roleName = (value: string) => roles.has(value) ? roles(value) : t.has(`roleNames.${value}`) ? t(`roleNames.${value}`) : t("otherRole");
  const statusName = (value: string | null) => value ? t.has(`statuses.${value}`) ? t(`statuses.${value}`) : t("otherStatus") : t("notRecorded");
  if (!context) return <p role="status">{t("loading")}</p>;
  if (!allowed) return <p role="alert">{t("forbidden")}</p>;
  const current = result?.key === key ? result : null;
  const set = (patch: Partial<Filters>) => setDraft(value => ({ ...value, ...patch }));
  const applySegment = (segment: string) => { const next = { ...draft, segment, page: 1 }; setDraft(next); setFilter(next); };
  const exportPage = () => {
    if (!current) return;
    downloadCsv(`opetlife-users-page-${filter.page}.csv`, [
      [t("title"), t("segmentLabel"), t("email"), t("phone"), t("columns.orders"), t("columns.spend"), t("columns.bookings"), t("created"), t("lastActive")],
      ...current.rows.map(u => [u.displayName, u.behavior ? t(`segments.${u.behavior.segment}`) : "", u.emailMasked, u.phoneMasked, u.behavior?.orderCount ?? "", u.behavior?.totalSpend ?? "", u.behavior ? u.behavior.serviceBookingCount + u.behavior.travelBookingCount : "", u.createdAt, u.lastActiveAt]),
    ]);
  };

  return <section className="gx-page">
    <header className="gx-head">
      <div><h1 className="text-page-title">{t(id ? "detailTitle" : "title")}</h1><p className="text-text-secondary">{t("intro")}</p></div>
      {!id && current && !current.error ? <button type="button" className="gx-btn" onClick={exportPage}><Download size={16} aria-hidden="true" />{t("exportPage")}</button> : null}
    </header>
    {id ? <Link className="underline" href={`/${locale}/admin/users`}>{t("back")}</Link> : <>
      <div className="gx-chips" role="group" aria-label={t("segmentLabel")}>
        <button type="button" className="gx-chip" aria-pressed={!filter.segment} onClick={() => applySegment("")}>{t("allSegments")}</button>
        {SEGMENTS.map(s => <button key={s} type="button" className="gx-chip" aria-pressed={filter.segment === s} onClick={() => applySegment(s)} title={t(`segmentHints.${s}`)}><span className={`gx-tag gx-tag--${s}`} style={{ padding: 0, background: "none" }}>●</span>{t(`segments.${s}`)}</button>)}
      </div>
      <ContextSurface>
        <form className="space-y-4" onSubmit={event => { event.preventDefault(); setFilter({ ...draft, q: draft.q.trim(), page: 1 }); }}>
          <div className="grid gap-3 md:grid-cols-4">
            <Input label={t("search")} maxLength={120} value={draft.q} onChange={event => set({ q: event.target.value })} />
            <Select label={t("kind")} value={draft.kind} onChange={event => set({ kind: event.target.value })} options={[{ value: "", label: t("all") }, ...KINDS.map(value => ({ value, label: t(`kinds.${value}`) }))]} />
            <Select label={t("accountStatus")} value={draft.status} onChange={event => set({ status: event.target.value })} options={[{ value: "", label: t("anyStatus") }, { value: "ACTIVE", label: t("statuses.ACTIVE") }, { value: "SUSPENDED", label: t("statuses.SUSPENDED") }]} />
            <Select label={t("sortLabel")} value={draft.sort} onChange={event => set({ sort: event.target.value })} options={SORTS.map(value => ({ value: value === "newest" ? "" : value, label: t(`sort.${value}`) }))} />
          </div>
          {advanced ? <div className="grid gap-3 md:grid-cols-4">
            <Input label={t("joinedFrom")} type="date" dir="ltr" value={draft.joinedFrom} onChange={event => set({ joinedFrom: event.target.value })} />
            <Input label={t("joinedTo")} type="date" dir="ltr" value={draft.joinedTo} onChange={event => set({ joinedTo: event.target.value })} />
            <Select label={t("activityLabel")} value={draft.activity} onChange={event => set({ activity: event.target.value })} options={ACTIVITY.map(value => ({ value, label: t(`activity.${value || "any"}`) }))} />
            <Input label={t("minOrders")} type="number" inputMode="numeric" min={0} value={draft.minOrders} onChange={event => set({ minOrders: event.target.value })} />
            <Input label={t("minSpend")} type="number" inputMode="numeric" min={0} step={1000000} value={draft.minSpend} onChange={event => set({ minSpend: event.target.value })} />
            {FLAGS.map(flag => <Select key={flag} label={t(`flags.${flag}`)} value={draft[flag]} onChange={event => set({ [flag]: event.target.value } as Partial<Filters>)} options={[{ value: "", label: t("flagAny") }, { value: "true", label: t("flagYes") }, { value: "false", label: t("flagNo") }]} />)}
          </div> : null}
          <div className="flex flex-wrap items-end gap-2">
            <Button type="submit">{t("apply")}</Button>
            <Button type="button" variant="secondary" onClick={() => { setDraft(EMPTY); setFilter(EMPTY); }}>{t("clear")}</Button>
            <Button type="button" variant="ghost" aria-expanded={advanced} onClick={() => setAdvanced(v => !v)}><Filter size={16} aria-hidden="true" />{t(advanced ? "fewerFilters" : "moreFilters")}</Button>
          </div>
        </form>
      </ContextSurface>
    </>}
    {!current ? <p role="status">{t("loading")}</p> : current.error ? <div><p role="alert">{t(current.error)}</p>{current.error === "failed" && <Button onClick={() => setRetry(value => value + 1)}>{t("retry")}</Button>}</div> : <>
      {!id && <p role="status">{t("total", { count: number(current.total) })}</p>}
      {current.rows.length === 0 ? <p>{t("empty")}</p> : id ? <ContextSurface className="min-w-0 space-y-4 break-words">{current.rows.map(user => <div key={user.id}><div className="gx-person"><span className="gx-initial" aria-hidden="true">{(user.displayName || "?").slice(0, 1)}</span><div><h2 className="text-section-title">{user.displayName || t("unnamed")}</h2><p>{statusName(user.accountStatus)}</p></div></div><dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div><dt className="gx-muted">{t("email")}</dt><dd><bdi dir="ltr">{user.emailMasked || t("notRecorded")}</bdi></dd></div><div><dt className="gx-muted">{t("phone")}</dt><dd><bdi dir="ltr">{user.phoneMasked || t("notRecorded")}</bdi></dd></div><div><dt className="gx-muted">{t("created")}</dt><dd>{date(user.createdAt)}</dd></div><div><dt className="gx-muted">{t("lastActive")}</dt><dd>{date(user.lastActiveAt)}</dd></div></dl></div>)}</ContextSurface> : <ContextSurface className="overflow-x-auto"><table className="gx-table min-w-[64rem]"><thead><tr><th>{t("title")}</th><th>{t("segmentLabel")}</th><th>{t("contact")}</th><th>{t("relationships")}</th><th className="gx-num">{t("columns.orders")}</th><th className="gx-num">{t("columns.spend")}</th><th className="gx-num">{t("columns.bookings")}</th><th>{t("lastActive")}</th><th>{t("detail")}</th></tr></thead><tbody>{current.rows.map(user => <tr key={user.id}>
        <td><div className="gx-person"><span className="gx-initial" aria-hidden="true">{(user.displayName || "?").slice(0, 1)}</span><div><b>{user.displayName || t("unnamed")}</b><small>{statusName(user.accountStatus)}</small></div></div></td>
        <td>{user.behavior ? <span className={`gx-tag gx-tag--${user.behavior.segment}`}>{t(`segments.${user.behavior.segment}`)}</span> : null}</td>
        <td><bdi dir="ltr" className="block">{user.emailMasked || t("notRecorded")}</bdi><bdi dir="ltr" className="block text-text-secondary">{user.phoneMasked || t("notRecorded")}</bdi></td>
        <td>{user.roles.length ? <ul className="space-y-1">{user.roles.map((role,index)=><li key={`${role.kind}-${role.business?.id??index}`}><span>{t(`kinds.${role.kind}`)} · {roleName(role.role)}</span>{role.business?<span className="block text-text-secondary">{t("business",{name:role.business.name})}</span>:null}</li>)}</ul> : t("noRoles")}</td>
        <td className="gx-num">{user.behavior ? number(user.behavior.orderCount) : "—"}</td>
        <td className="gx-num">{user.behavior ? money(user.behavior.totalSpend) : "—"}</td>
        <td className="gx-num">{user.behavior ? number(user.behavior.serviceBookingCount + user.behavior.travelBookingCount) : "—"}{user.behavior && user.behavior.cancelledCount + user.behavior.noShowCount > 0 ? <small className="block text-state-urgent">{t("cancelledShort", { count: number(user.behavior.cancelledCount + user.behavior.noShowCount) })}</small> : null}</td>
        <td>{date(user.lastActiveAt)}</td>
        <td><Link className="underline" href={`/${locale}/admin/users/${encodeURIComponent(user.id)}`}>{t("detail")}</Link></td>
      </tr>)}</tbody></table></ContextSurface>}
      {current.profile && <ProfileDetails profile={current.profile} onChanged={() => setRetry(value => value + 1)} />}
      {!id && <nav className="flex flex-wrap items-center gap-3" aria-label={t("pagination")}>
        <Button disabled={filter.page <= 1} onClick={() => setFilter(value => ({ ...value, page: value.page - 1 }))}>{t("previous")}</Button>
        <span>{t("page", { page: number(filter.page) })}</span>
        <Button disabled={filter.page * 20 >= current.total} onClick={() => setFilter(value => ({ ...value, page: value.page + 1 }))}>{t("next")}</Button>
      </nav>}
    </>}
  </section>;
}

function ProfileDetails({ profile, onChanged }: { profile: AdminUserProfileDto; onChanged: () => void }) {
  const t = useTranslations("adminUsers"), locale = useLocale();
  const context = useAdminStore(s => s.context);
  const [tab, setTab] = useState<ProfileTab>("profile");
  const households = profile.households ?? [], businesses = profile.businesses ?? [], orders = profile.orders ?? [], requests = profile.requests ?? [], tickets = profile.tickets ?? [], reviews = profile.reviews ?? [], auditTrail = profile.auditTrail ?? [];
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const date = (value: string) => new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  const empty = <p>{t("sectionEmpty")}</p>;
  const reviewPage = (kind: string) => kind === "PRODUCT" ? "commerce/reviews" : kind === "TRAVEL" ? "travel/reviews" : "services/reviews";
  const can = (p: string) => !!context?.permissions.includes(p as never);
  return <div className="space-y-4">
    <BehaviorSummary userId={profile.user.id} />
    {(can("customer.account.manage") || can("customer.sessions.revoke")) ? <AccountActions userId={profile.user.id} status={profile.user.accountStatus} canSuspend={can("customer.account.manage")} canRevoke={can("customer.sessions.revoke")} onChanged={onChanged} /> : null}
    {can("support.manage") ? <ManualMessage userId={profile.user.id} /> : null}
    <nav className="flex flex-wrap gap-2" aria-label={t("profileSections")}>{PROFILE_TABS.map(value => <Button key={value} variant={tab === value ? "primary" : "secondary"} aria-pressed={tab === value} onClick={() => setTab(value)}>{t(`tabs.${value}`)}</Button>)}</nav>
    <ContextSurface className="space-y-4">
      {tab === "profile" && <><h2 className="text-section-title">{t("tabs.profile")}</h2><p>{t("households", { count: number(profile.householdCount) })}</p><p>{t("pets", { count: number(profile.petCount) })}</p><Link className="underline" href={`/${locale}/admin/customers/${encodeURIComponent(profile.user.id)}`}>{t("customer360")}</Link></>}
      {tab === "activity" && <ActivityTimeline userId={profile.user.id} />}
      {tab === "households" && <><h2 className="text-section-title">{t("tabs.households")}</h2>{households.length ? <ul className="space-y-3">{households.map(household => <li key={household.id} className="rounded-xl border border-current/20 p-3"><p className="font-medium">{household.name || t("unnamedHousehold")}</p><p>{t("householdSummary", { members: number(household.memberCount), pets: number(household.pets.length) })}</p>{household.city && <p>{household.city}</p>}<ul className="mt-2 flex flex-wrap gap-2">{household.pets.map(pet => <li key={pet.id} className="rounded-full border border-current/20 px-3 py-1">{pet.name} · {t.has(`species.${pet.species}`) ? t(`species.${pet.species}`) : t("otherSpecies")}</li>)}</ul></li>)}</ul> : empty}</>}
      {tab === "businesses" && <><h2 className="text-section-title">{t("tabs.businesses")}</h2>{businesses.length ? <ul className="space-y-3">{businesses.map(business => <li key={`${business.kind}-${business.id}`} className="rounded-xl border border-current/20 p-3"><p className="font-medium">{business.name}</p><p>{t(`kinds.${business.kind}`)}</p><p>{t("verification", { status: business.verificationStatus && t.has(`statuses.${business.verificationStatus}`) ? t(`statuses.${business.verificationStatus}`) : t("otherStatus") })}</p></li>)}</ul> : empty}</>}
      {tab === "orders" && <><h2 className="text-section-title">{t("tabs.orders")}</h2>{orders.length ? <ul className="space-y-3">{orders.map(order => <li key={order.id}><Link className="underline" href={`/${locale}/admin/commerce/orders/${order.id}`}>{t("orderItem", { amount: number(order.totalAmount), currency: order.currency === "IRR" ? t("irr") : t("otherCurrency"), date: date(order.createdAt) })}</Link></li>)}</ul> : empty}</>}
      {tab === "requests" && <><h2 className="text-section-title">{t("tabs.requests")}</h2>{requests.length ? <ul className="space-y-3">{requests.map(request => <li key={request.id}><Link className="underline" href={`/${locale}/admin/services/bookings/${request.id}`}>{t("requestItem", { category: t.has(`requestCategories.${request.category}`) ? t(`requestCategories.${request.category}`) : t("otherRequest"), date: date(request.startAt) })}</Link></li>)}</ul> : empty}</>}
      {tab === "tickets" && <><h2 className="text-section-title">{t("tabs.tickets")}</h2>{tickets.length ? <ul className="space-y-3">{tickets.map(ticket => <li key={ticket.id}><Link className="underline" href={`/${locale}/admin/support/${ticket.id}`}>{ticket.caseNumber} · {ticket.subject}</Link></li>)}</ul> : empty}</>}
      {tab === "reviews" && <><h2 className="text-section-title">{t("tabs.reviews")}</h2>{reviews.length ? <ul className="space-y-3">{reviews.map(review => <li key={`${review.kind}-${review.id}`}><Link className="underline" href={`/${locale}/admin/${reviewPage(review.kind)}`}>{t("reviewItem", { kind: t(`reviewKinds.${review.kind}`), rating: number(review.rating), date: date(review.createdAt) })}</Link></li>)}</ul> : empty}</>}
      {tab === "audit" && <><h2 className="text-section-title">{t("tabs.audit")}</h2>{auditTrail.length ? <ul className="space-y-3">{auditTrail.map(entry => <li key={entry.id} className="rounded-xl border border-current/20 p-3"><p>{locale === "en" ? <bdi dir="ltr">{entry.action}</bdi> : t("auditEntry")}</p><p>{t("auditActor", { name: entry.adminUser.displayName, date: date(entry.createdAt) })}</p>{entry.reason && <p>{entry.reason}</p>}</li>)}</ul> : empty}</>}
    </ContextSurface>
  </div>;
}

/** Shared loader so the summary strip and the activity tab reuse one request per user. */
const behaviorCache = new Map<string, Promise<AdminUserBehaviorDto>>();
function loadBehavior(userId: string) {
  let pending = behaviorCache.get(userId);
  if (!pending) {
    pending = Promise.resolve().then(() => adminUsersService.behavior(userId));
    behaviorCache.set(userId, pending);
    pending.catch(() => behaviorCache.delete(userId));
    setTimeout(() => behaviorCache.delete(userId), 30_000);
  }
  return pending;
}

function useBehavior(userId: string) {
  const [state, setState] = useState<{ data: AdminUserBehaviorDto | null; failed: boolean }>({ data: null, failed: false });
  useEffect(() => {
    let cancelled = false;
    loadBehavior(userId).then(data => { if (!cancelled) setState({ data, failed: false }); }).catch(() => { if (!cancelled) setState({ data: null, failed: true }); });
    return () => { cancelled = true; };
  }, [userId]);
  return state;
}

function BehaviorSummary({ userId }: { userId: string }) {
  const t = useTranslations("adminUsers"), locale = useLocale(), loc = asLocale(locale);
  const { data, failed } = useBehavior(userId);
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  if (failed) return <p className="gx-muted" role="status">{t("behaviorUnavailable")}</p>;
  if (!data) return <div className="gx-skel" style={{ height: 110 }} aria-label={t("loading")} />;
  const s = data.summary;
  const cards = [
    { key: "segment", Icon: Star, value: t(`segments.${s.segment}`), tag: s.segment },
    { key: "spend", Icon: Wallet, value: t("moneyCompact", { amount: fmtCompact(s.totalSpend, loc) }) },
    { key: "orders", Icon: ShoppingBag, value: number(s.orderCount) },
    { key: "bookings", Icon: Activity, value: number(s.serviceBookingCount) },
    { key: "stays", Icon: Hotel, value: number(s.travelBookingCount) },
    { key: "reliability", Icon: CircleAlert, value: number(s.cancelledCount + s.noShowCount) },
    { key: "support", Icon: LifeBuoy, value: number(s.supportCaseCount) },
  ];
  return <section className="gx-grid gx-grid--kpi" aria-label={t("behaviorTitle")}>
    {cards.map(({ key, Icon, value, tag }) => <div key={key} className={`gx-kpi${key === "segment" ? " gx-kpi--accent" : ""}`}>
      <span className="gx-kpi__label"><Icon size={16} aria-hidden="true" />{t(`behavior.${key}`)}</span>
      <span className="gx-kpi__value" data-segment={tag}>{value}</span>
      {key === "segment" ? <span className="gx-kpi__foot">{t(`segmentHints.${s.segment}`)}</span> : null}
    </div>)}
  </section>;
}

const TIMELINE_ICONS: Record<AdminUserTimelineKind, typeof ShoppingBag> = { ORDER: ShoppingBag, SERVICE_BOOKING: Activity, TRAVEL_BOOKING: Hotel, SUPPORT_CASE: LifeBuoy, REVIEW: Star, SIGN_IN: LogIn, SIGN_UP: UserPlus };

function ActivityTimeline({ userId }: { userId: string }) {
  const t = useTranslations("adminUsers"), locale = useLocale(), loc = asLocale(locale);
  const { data, failed } = useBehavior(userId);
  const [kind, setKind] = useState<AdminUserTimelineKind | "">("");
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  if (failed) return <p role="alert">{t("behaviorUnavailable")}</p>;
  if (!data) return <div className="gx-skel" style={{ height: 240 }} aria-label={t("loading")} />;
  const kinds = [...new Set(data.timeline.map(e => e.kind))];
  const entries = data.timeline.filter(e => !kind || e.kind === kind);
  const status = (value: string | null) => value ? (t.has(`eventStatus.${value}`) ? t(`eventStatus.${value}`) : value) : null;
  return <div className="space-y-5">
    <h2 className="text-section-title">{t("tabs.activity")}</h2>
    <div className="gx-grid gx-grid--wide">
      <div>
        <p className="gx-muted">{t("monthlyActivity")}</p>
        <ColumnChart
          labels={data.monthlyActivity.map(m => m.month)}
          series={[{ key: "orders", label: t("behavior.orders"), color: "var(--chart-1)", values: data.monthlyActivity.map(m => m.orders) }, { key: "bookings", label: t("behavior.bookings"), color: "var(--chart-2)", values: data.monthlyActivity.map(m => m.bookings) }]}
          formatValue={v => number(Math.round(v))}
          formatLabel={m => fmtDay(m, loc, { month: "short" })}
          ariaLabel={t("monthlyActivity")}
        />
      </div>
      <div>
        <p className="gx-muted">{t("favoriteCategories")}</p>
        {data.favoriteCategories.length ? <ul className="space-y-2">{data.favoriteCategories.map(c => <li key={c.key} className="flex justify-between gap-3"><span>{t.has(`requestCategories.${c.key}`) ? t(`requestCategories.${c.key}`) : c.key}</span><b>{number(c.count)}</b></li>)}</ul> : <p>{t("sectionEmpty")}</p>}
      </div>
    </div>
    <div className="gx-chips" role="group" aria-label={t("timelineFilter")}>
      <button type="button" className="gx-chip" aria-pressed={!kind} onClick={() => setKind("")}>{t("allEvents")}</button>
      {kinds.map(k => <button key={k} type="button" className="gx-chip" aria-pressed={kind === k} onClick={() => setKind(k)}>{t(`events.${k}`)}</button>)}
    </div>
    {entries.length === 0 ? <p>{t("sectionEmpty")}</p> : <ol className="gx-timeline">{entries.map(entry => {
      const Icon = TIMELINE_ICONS[entry.kind] ?? Receipt;
      const amount = entry.amount !== null ? (entry.kind === "REVIEW" ? t("ratingValue", { rating: number(entry.amount) }) : t("moneyCompact", { amount: fmtCompact(entry.amount, loc) })) : null;
      const labelText = entry.label ? (entry.kind === "SERVICE_BOOKING" && t.has(`requestCategories.${entry.label}`) ? t(`requestCategories.${entry.label}`) : entry.kind === "SIGN_IN" && t.has(`device.${entry.label}`) ? t(`device.${entry.label}`) : entry.kind === "REVIEW" ? t(`reviewKinds.${entry.label}`) : entry.label) : null;
      const title = <>{t(`events.${entry.kind}`)}{labelText ? <> · <bdi>{labelText}</bdi></> : null}</>;
      return <li key={`${entry.kind}-${entry.id}`}>
        <span className="gx-timeline__icon"><Icon size={16} aria-hidden="true" /></span>
        <div><b>{entry.href ? <Link className="underline" href={`/${locale}/admin${entry.href}`}>{title}</Link> : title}</b><small>{new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.at))}{status(entry.status) ? ` · ${status(entry.status)}` : ""}</small></div>
        {amount ? <b className="gx-num">{amount}</b> : <span />}
      </li>;
    })}</ol>}
  </div>;
}

function AccountActions({ userId, status, canSuspend, canRevoke, onChanged }: { userId: string; status: "ACTIVE" | "SUSPENDED"; canSuspend: boolean; canRevoke: boolean; onChanged: () => void }) {
  const t = useTranslations("adminUsers.account");
  const [action, setAction] = useState<"suspend" | "unsuspend" | "revoke" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<"done" | "failed" | "self" | null>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!action || reason.trim().length < 5 || busy) return;
    setBusy(true); setResult(null);
    const path = action === "revoke" ? "sessions/revoke" : action;
    try {
      await apiFetch(`/admin/customers/${encodeURIComponent(userId)}/${path}`, { method: "POST", body: { reason: reason.trim() } });
      behaviorCache.delete(userId);
      setResult("done"); setAction(null); setReason("");
      onChanged();
    } catch (error) {
      setResult(error instanceof ApiError && error.status === 409 ? "self" : "failed");
    } finally { setBusy(false); }
  }
  return <ContextSurface className="space-y-3">
    <h2 className="text-section-title">{t("title")}</h2>
    <p className="text-text-secondary">{t("hint")}</p>
    <div className="flex flex-wrap gap-2">
      {canSuspend ? <Button variant={status === "ACTIVE" ? "danger" : "primary"} onClick={() => { setAction(status === "ACTIVE" ? "suspend" : "unsuspend"); setResult(null); }}>{t(status === "ACTIVE" ? "suspend" : "unsuspend")}</Button> : null}
      {canRevoke ? <Button variant="secondary" onClick={() => { setAction("revoke"); setResult(null); }}>{t("revoke")}</Button> : null}
    </div>
    {result === "done" ? <p role="status">{t("done")}</p> : null}
    {result === "failed" ? <p role="alert">{t("failed")}</p> : null}
    {result === "self" ? <p role="alert">{t("selfForbidden")}</p> : null}
    {action ? <Dialog open onClose={() => setAction(null)} title={t(`${action}Title`)}>
      <form className="space-y-3" onSubmit={submit}>
        <p>{t(`${action}Body`)}</p>
        <label className="flex flex-col gap-1 text-sm"><span className="text-text-secondary">{t("reason")}</span><textarea className="min-h-24 rounded-md border border-border-strong bg-surface-elevated p-3" value={reason} minLength={5} maxLength={500} required onChange={e => setReason(e.target.value)} /></label>
        <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy || reason.trim().length < 5} variant={action === "suspend" ? "danger" : "primary"}>{busy ? t("working") : t("confirm")}</Button><Button type="button" variant="secondary" onClick={() => setAction(null)}>{t("cancel")}</Button></div>
      </form>
    </Dialog> : null}
  </ContextSurface>;
}

function ManualMessage({ userId }: { userId: string }) {
  const t = useTranslations("adminUsers.manualMessage");
  const [title, setTitle] = useState(""), [message, setMessage] = useState(""), [attemptSms, setAttemptSms] = useState(true), [busy, setBusy] = useState(false), [result, setResult] = useState<"saved" | "failed" | null>(null);
  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (title.trim().length < 3 || message.trim().length < 3 || busy) return;
    setBusy(true); setResult(null);
    try { await adminUsersService.sendMessage(userId, { title: title.trim(), message: message.trim(), attemptSms }); setTitle(""); setMessage(""); setResult("saved"); }
    catch { setResult("failed"); } finally { setBusy(false); }
  }
  return <ContextSurface><form className="space-y-3" onSubmit={send}><h2 className="text-section-title">{t("title")}</h2><p className="text-text-secondary">{t("smsNote")}</p><Input label={t("subject")} value={title} minLength={3} maxLength={120} required onChange={event => setTitle(event.target.value)} /><label className="flex flex-col gap-1 text-sm"><span className="text-text-secondary">{t("message")}</span><textarea className="min-h-28 rounded-md border border-border-strong bg-surface-elevated p-3" value={message} minLength={3} maxLength={700} required onChange={event => setMessage(event.target.value)} /></label><label className="flex items-center gap-2"><input type="checkbox" checked={attemptSms} onChange={event => setAttemptSms(event.target.checked)} />{t("attemptSms")}</label>{result === "saved" ? <p role="status">{t("saved")}</p> : null}{result === "failed" ? <p role="alert">{t("failed")}</p> : null}<Button type="submit" disabled={busy || title.trim().length < 3 || message.trim().length < 3}>{busy ? t("sending") : t("send")}</Button></form></ContextSurface>;
}
