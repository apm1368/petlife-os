"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button, ContextSurface, Input, Select } from "@petlife/ui";
import type { AdminUserDirectoryRowDto, AdminUserProfileDto, AdminUserRoleKind } from "@petlife/types";
import { useAdminStore } from "@/stores/admin-store";
import { ApiError } from "@/lib/api/client";
import { adminUsersService } from "@/services/admin-users.service";

const KINDS: AdminUserRoleKind[] = ["ADMIN_INTERNAL", "CUSTOMER", "CLINIC", "GROOMER", "HOST", "PROVIDER_OTHER", "SHOP", "INSURER", "NGO"];
const PROFILE_TABS = ["profile", "households", "businesses", "orders", "requests", "tickets", "reviews", "audit"] as const;
type ProfileTab = typeof PROFILE_TABS[number];
type Result = { key: string; rows: AdminUserDirectoryRowDto[]; total: number; profile: AdminUserProfileDto | null; error?: "failed" | "forbidden" | "notFound" };

export function AdminUsersView({ id }: { id?: string }) {
  return <Directory key={id ?? "list"} id={id} />;
}

function Directory({ id }: { id?: string }) {
  const t = useTranslations("adminUsers"), roles = useTranslations("adminAccess.roles"), locale = useLocale();
  const context = useAdminStore(s => s.context);
  const allowed = !!context?.isAdmin && context.permissions.includes("customer.view");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("");
  const [filter, setFilter] = useState({ q: "", kind: "", page: 1 });
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const key = JSON.stringify([id, filter, retry, context?.adminUserId, context?.role, allowed]);

  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(filter.page), pageSize: "20" });
    if (filter.q) params.set("q", filter.q);
    if (filter.kind) params.set("kind", filter.kind);
    const request = id
      ? adminUsersService.detail(id, controller.signal).then(profile => ({ rows: [profile.user], total: 1, profile }))
      : adminUsersService.list(params, controller.signal).then(data => ({ rows: data.items, total: data.total, profile: null }));
    void request.then(data => { if (!controller.signal.aborted) setResult({ ...data, key }); })
      .catch(error => {
        if (!controller.signal.aborted) setResult({ key, rows: [], total: 0, profile: null, error: error instanceof ApiError && error.status === 403 ? "forbidden" : id && error instanceof ApiError && error.status === 404 ? "notFound" : "failed" });
      });
    return () => controller.abort();
  }, [allowed, filter, id, key]);

  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const date = (value: string | null) => value && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : t("notRecorded");
  const roleName = (value: string) => roles.has(value) ? roles(value) : t.has(`roleNames.${value}`) ? t(`roleNames.${value}`) : t("otherRole");
  const statusName = (value: string | null) => value ? t.has(`statuses.${value}`) ? t(`statuses.${value}`) : t("otherStatus") : t("notRecorded");
  if (!context) return <p role="status">{t("loading")}</p>;
  if (!allowed) return <p role="alert">{t("forbidden")}</p>;
  const current = result?.key === key ? result : null;

  return <section className="min-w-0 space-y-5">
    <header><h1 className="text-page-title">{t(id ? "detailTitle" : "title")}</h1><p className="text-text-secondary">{t("intro")}</p></header>
    {id ? <Link className="underline" href={`/${locale}/admin/users`}>{t("back")}</Link> : <ContextSurface>
      <form className="grid gap-3 md:grid-cols-3" onSubmit={event => { event.preventDefault(); setFilter({ q: query.trim(), kind, page: 1 }); }}>
        <Input label={t("search")} maxLength={120} value={query} onChange={event => setQuery(event.target.value)} />
        <Select label={t("kind")} value={kind} onChange={event => setKind(event.target.value)} options={[{ value: "", label: t("all") }, ...KINDS.map(value => ({ value, label: t(`kinds.${value}`) }))]} />
        <div className="flex items-end gap-2"><Button type="submit">{t("apply")}</Button><Button type="button" variant="secondary" onClick={() => { setQuery(""); setKind(""); setFilter({ q: "", kind: "", page: 1 }); }}>{t("clear")}</Button></div>
      </form>
    </ContextSurface>}
    {!current ? <p role="status">{t("loading")}</p> : current.error ? <div><p role="alert">{t(current.error)}</p>{current.error === "failed" && <Button onClick={() => setRetry(value => value + 1)}>{t("retry")}</Button>}</div> : <>
      {!id && <p role="status">{t("total", { count: number(current.total) })}</p>}
      {current.rows.length === 0 ? <p>{t("empty")}</p> : <ul className={`grid min-w-0 gap-4 ${id ? "" : "xl:grid-cols-2"}`}>
        {current.rows.map(user => <li key={user.id} className="min-w-0"><ContextSurface className="min-w-0 space-y-4 break-words">
          <div><h2 className="text-section-title">{user.displayName || t("unnamed")}</h2><p>{statusName(user.accountStatus)}</p></div>
          <dl className="grid gap-3 sm:grid-cols-2">
            <div><dt>{t("email")}</dt><dd><bdi dir="ltr">{user.emailMasked || t("notRecorded")}</bdi></dd></div>
            <div><dt>{t("phone")}</dt><dd><bdi dir="ltr">{user.phoneMasked || t("notRecorded")}</bdi></dd></div>
            <div><dt>{t("created")}</dt><dd>{date(user.createdAt)}</dd></div>
            <div><dt>{t("lastActive")}</dt><dd>{date(user.lastActiveAt)}</dd></div>
          </dl>
          <h3 className="font-medium">{t("relationships")}</h3>
          {user.roles.length ? <ul className="space-y-2">{user.roles.map((role, index) => <li key={`${role.kind}-${role.business?.id ?? index}`} className="rounded-xl border border-current/20 p-3">
            <p>{t(`kinds.${role.kind}`)} · {roleName(role.role)}</p>
            {role.business && <><p>{t("business", { name: role.business.name })}</p><p className="text-sm">{t("verification", { status: statusName(role.business.verificationStatus) })}</p></>}
          </li>)}</ul> : <p>{t("noRoles")}</p>}
          {!id && <Link className="underline" href={`/${locale}/admin/users/${encodeURIComponent(user.id)}`}>{t("detail")}</Link>}
        </ContextSurface></li>)}
      </ul>}
      {current.profile && <ProfileDetails profile={current.profile} />}
      {!id && <nav className="flex flex-wrap items-center gap-3" aria-label={t("pagination")}>
        <Button disabled={filter.page <= 1} onClick={() => setFilter(value => ({ ...value, page: value.page - 1 }))}>{t("previous")}</Button>
        <span>{t("page", { page: number(filter.page) })}</span>
        <Button disabled={filter.page * 20 >= current.total} onClick={() => setFilter(value => ({ ...value, page: value.page + 1 }))}>{t("next")}</Button>
      </nav>}
    </>}
  </section>;
}

function ProfileDetails({ profile }: { profile: AdminUserProfileDto }) {
  const t = useTranslations("adminUsers"), locale = useLocale();
  const [tab, setTab] = useState<ProfileTab>("profile");
  const households = profile.households ?? [], businesses = profile.businesses ?? [], orders = profile.orders ?? [], requests = profile.requests ?? [], tickets = profile.tickets ?? [], reviews = profile.reviews ?? [], auditTrail = profile.auditTrail ?? [];
  const number = (value: number) => new Intl.NumberFormat(locale).format(value);
  const date = (value: string) => new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  const empty = <p>{t("sectionEmpty")}</p>;
  const reviewPage = (kind: string) => kind === "PRODUCT" ? "commerce/reviews" : kind === "TRAVEL" ? "travel/reviews" : "services/reviews";
  return <div className="space-y-4">
    <nav className="flex flex-wrap gap-2" aria-label={t("profileSections")}>{PROFILE_TABS.map(value => <Button key={value} variant={tab === value ? "primary" : "secondary"} aria-pressed={tab === value} onClick={() => setTab(value)}>{t(`tabs.${value}`)}</Button>)}</nav>
    <ContextSurface className="space-y-4">
      {tab === "profile" && <><h2 className="text-section-title">{t("tabs.profile")}</h2><p>{t("households", { count: number(profile.householdCount) })}</p><p>{t("pets", { count: number(profile.petCount) })}</p><Link className="underline" href={`/${locale}/admin/customers/${encodeURIComponent(profile.user.id)}`}>{t("customer360")}</Link></>}
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
