"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ContextSurface, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { AdminPartnerKycDto, AdminPartnerServiceDetailDto, AdminPartnerShopDetailDto } from "@petlife/types";
import { adminPartnersService } from "@/services/admin-partners.service";
import { useAdminStore } from "@/stores/admin-store";
import { useStatusText } from "@/lib/status/use-status-text";
import { ApiError } from "@/lib/api/client";
import { formatCurrency } from "@/lib/currency/format-currency";
import { intlLocale } from "@/features/admin/admin-copy";
import { DemoRecordTag } from "../DemoRecordTag";
import { adminStatusTone } from "../status-tone";

type Locale = "fa" | "en" | "de" | "es" | "ar" | "nl";
type LoadError = "forbidden" | "notFound" | "load" | null;

/** Weekdays in the order an Iranian week reads (Saturday first); `dayOfWeek` is 0 = Sunday … 6 = Saturday. */
const WEEK = [6, 0, 1, 2, 3, 4, 5];

function useProfile<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<LoadError>(null);
  const run = useCallback(async () => {
    setError(null);
    try {
      setData(await load());
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? "forbidden" : e instanceof ApiError && e.status === 404 ? "notFound" : "load");
    }
  }, [load]);
  useEffect(() => {
    void run();
  }, [run]);
  return { data, error, retry: run };
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <ContextSurface className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-section-title text-text-primary">{title}</h2>
        {aside}
      </div>
      {children}
    </ContextSurface>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-metadata text-text-secondary">{label}</dt>
      <dd className="break-words text-body text-text-primary">{value ?? "—"}</dd>
    </div>
  );
}

function useFormat() {
  const locale = useLocale() as Locale;
  return {
    locale,
    money: (amount: number | null) => (amount === null ? "—" : formatCurrency(amount, locale)),
    num: (value: number) => new Intl.NumberFormat(intlLocale(locale)).format(value),
    date: (iso: string) => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium" }).format(new Date(iso)),
    dateTime: (iso: string) => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)),
  };
}

function ProfileState({ error, retry }: { error: LoadError; retry: () => void }) {
  const t = useTranslations("admin.partners.profile");
  if (error === "forbidden") return <EmptyState title={t("forbidden")} />;
  if (error === "notFound") return <EmptyState title={t("notFound")} />;
  if (error === "load") return <ErrorRecovery title={t("loadFailed")} message="" retryLabel={t("retry")} onRetry={retry} />;
  return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;
}

/** KYC block shared by both sides. Files open only on the audited verification screen. */
function KycSection({ kyc, subject, id }: { kyc: AdminPartnerKycDto; subject: "provider" | "seller"; id: string }) {
  const t = useTranslations("admin.partners.profile");
  const kinds = useTranslations("partnerVerification.documentKinds");
  const status = useStatusText();
  const { locale, dateTime, date } = useFormat();
  const canReview = !!useAdminStore((s) => s.context?.permissions)?.includes("verification.manage");
  return (
    <Section
      title={t("kyc")}
      aside={
        <div className="flex flex-wrap items-center gap-2">
          <StatusLabel tone={adminStatusTone(kyc.status)}>{status.label(kyc.status)}</StatusLabel>
          {canReview ? (
            <Link className="text-metadata underline" href={`/${locale}/admin/verification/${subject}/${id}`}>
              {t("reviewKyc")}
            </Link>
          ) : null}
        </div>
      }
    >
      {kyc.submittedAt ? <p className="text-metadata text-text-secondary">{t("submittedAt", { when: dateTime(kyc.submittedAt) })}</p> : <p className="text-metadata text-text-secondary">{t("notSubmitted")}</p>}
      {kyc.note ? <p className="text-metadata text-text-secondary">{t("kycNote", { note: kyc.note })}</p> : null}
      {kyc.contact ? (
        <dl className="grid gap-3 sm:grid-cols-2">
          <Fact label={t("contactName")} value={`${kyc.contact.firstName} ${kyc.contact.lastName}`} />
          <Fact label={t("contactMobile")} value={kyc.contact.mobile} />
          <Fact label={t("contactLandline")} value={kyc.contact.landline} />
          {kyc.contact.enamadId ? <Fact label={t("enamad")} value={kyc.contact.enamadId} /> : null}
        </dl>
      ) : (
        <p className="text-metadata text-text-secondary">{t("noContact")}</p>
      )}
      {kyc.documents.length === 0 ? (
        <p className="text-metadata text-text-secondary">{t("noDocuments")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {kyc.documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-2 first:border-t-0 first:pt-0">
              <span className="min-w-0">
                <span className="block text-body text-text-primary">{kinds(d.kind)}</span>
                <span className="block text-metadata text-text-secondary">
                  {t("uploaded", { when: date(d.uploadedAt) })}
                  {d.expiresAt ? ` · ${t("expires", { when: date(d.expiresAt) })}` : ""}
                </span>
                {d.reviewNote ? <span className="block text-metadata text-text-secondary">{t("reviewNote", { note: d.reviewNote })}</span> : null}
              </span>
              <StatusLabel tone={adminStatusTone(d.status)}>{status.label(d.status)}</StatusLabel>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function Header({ name, logoUrl, subtitle, tags, demo }: { name: string; logoUrl: string | null; subtitle: string; tags: ReactNode; demo?: boolean }) {
  return (
    <header className="flex flex-wrap items-center gap-3">
      {logoUrl ? <img src={logoUrl} alt="" className="h-14 w-14 rounded-lg object-cover" /> : null}
      <div className="min-w-0 flex-1">
        <h1 className="text-page-title text-text-primary">
          {name}
          <DemoRecordTag isDemoRecord={demo} />
        </h1>
        <p className="text-metadata text-text-secondary">{subtitle}</p>
      </div>
      <div className="flex flex-wrap gap-2">{tags}</div>
    </header>
  );
}

export function AdminPartnerServiceProfile({ id }: { id: string }) {
  const t = useTranslations("admin.partners.profile");
  const types = useTranslations("providerDiscovery.providerTypes");
  const exceptionTypes = useTranslations("provider.availability.exceptions.type");
  const status = useStatusText();
  const { locale, money, num, dateTime } = useFormat();
  const load = useCallback(() => adminPartnersService.getService(id), [id]);
  const { data, error, retry } = useProfile(load);
  if (!data) return <ProfileState error={error} retry={retry} />;
  const byDay = new Map<number, AdminPartnerServiceDetailDto["calendar"]["rules"]>();
  for (const r of data.calendar.rules) byDay.set(r.dayOfWeek, [...(byDay.get(r.dayOfWeek) ?? []), r]);

  return (
    <div className="flex min-w-0 flex-col gap-4 break-words">
      <Link className="text-metadata underline" href={`/${locale}/admin/providers`}>
        {t("backServices")}
      </Link>
      <Header
        name={data.name}
        logoUrl={data.logoUrl}
        demo={data.isDemoRecord}
        subtitle={data.serviceKinds.map((k) => types(k)).join(" · ")}
        tags={<StatusLabel tone={adminStatusTone(data.kyc.status)}>{status.label(data.kyc.status)}</StatusLabel>}
      />
      {data.linkedShop ? (
        <p className="text-metadata">
          <Link className="underline" href={`/${locale}/admin/sellers/${data.linkedShop.id}`}>
            {t("alsoShop", { name: data.linkedShop.name })}
          </Link>{" "}
          · {status.label(data.linkedShop.verificationStatus)}
        </p>
      ) : null}

      <Section title={t("identity")}>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Fact label={t("phone")} value={data.phone} />
          <Fact label={t("email")} value={data.email} />
          <Fact label={t("website")} value={data.websiteUrl} />
          <Fact label={t("joined")} value={dateTime(data.createdAt)} />
        </dl>
        {data.description ? <p className="whitespace-pre-wrap text-body text-text-secondary">{data.description}</p> : null}
      </Section>

      <KycSection kyc={data.kyc} subject="provider" id={data.id} />

      <Section title={t("address")}>
        {data.locations.length === 0 ? <p className="text-metadata text-text-secondary">{t("noAddress")}</p> : null}
        {data.locations.map((l) => (
          <dl key={l.id} className="grid gap-3 sm:grid-cols-2">
            <Fact label={t("province")} value={l.province} />
            <Fact label={t("city")} value={l.city} />
            <Fact label={t("addressLine")} value={l.addressLine} />
            <Fact label={t("pin")} value={l.latitude !== null && l.longitude !== null ? `${l.latitude.toFixed(5)}, ${l.longitude.toFixed(5)}` : null} />
            {l.phone ? <Fact label={t("phone")} value={l.phone} /> : null}
          </dl>
        ))}
      </Section>

      <Section title={t("services")}>
        {data.services.length === 0 ? <p className="text-metadata text-text-secondary">{t("noServices")}</p> : null}
        <ul className="flex flex-col gap-3">
          {data.services.map((s) => (
            <li key={s.id} className="border-t border-border-subtle pt-3 first:border-t-0 first:pt-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-body font-medium text-text-primary">{s.name}</span>
                <StatusLabel tone={s.isActive ? "success" : "neutral"}>{t(s.isActive ? "serviceActive" : "serviceInactive")}</StatusLabel>
              </div>
              <p className="text-metadata text-text-secondary">
                {t(`category.${s.category}`)} · {t("perPet", { price: money(s.priceAmount) })} · {t("minutes", { count: num(s.durationMinutes) })} · {t("maxPets", { count: num(s.maxPetsPerBooking) })}
                {s.supportsDog || s.supportsCat ? ` · ${[s.supportsDog ? t("dogs") : null, s.supportsCat ? t("cats") : null].filter(Boolean).join("، ")}` : ""}
              </p>
              {s.variants.length ? (
                <ul className="mt-1 flex flex-col gap-0.5 text-metadata text-text-secondary">
                  {s.variants.map((v) => (
                    <li key={v.id}>
                      {v.name}: {money(v.priceAmount)} · {t("minutes", { count: num(v.durationMinutes) })}
                      {v.isActive ? "" : ` · ${t("serviceInactive")}`}
                    </li>
                  ))}
                </ul>
              ) : null}
              {s.transportPricing ? (
                <p className="text-metadata text-text-secondary">{t("taxiFare", { base: money(s.transportPricing.baseFareIrr), perKm: money(s.transportPricing.perKmRateIrr) })}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t("calendar")}>
        {data.calendar.rules.length === 0 ? <p className="text-metadata text-text-secondary">{t("noCalendar")}</p> : null}
        {data.calendar.rules.length ? (
          <dl className="grid gap-2 sm:grid-cols-2">
            {WEEK.filter((d) => byDay.has(d)).map((d) => (
              <Fact
                key={d}
                label={t(`weekday.${d}`)}
                value={byDay
                  .get(d)!
                  .map((r) => `${r.start}–${r.end}${r.staffName ? ` (${r.staffName})` : ""}${r.serviceName ? ` · ${r.serviceName}` : ""}`)
                  .join("، ")}
              />
            ))}
          </dl>
        ) : null}
        {data.calendar.exceptions.length ? (
          <div className="flex flex-col gap-1">
            <h3 className="text-metadata font-medium text-text-primary">{t("exceptions")}</h3>
            {data.calendar.exceptions.map((e) => (
              <p key={e.id} className="text-metadata text-text-secondary">
                {exceptionTypes(e.type)}: {dateTime(e.startAt)} – {dateTime(e.endAt)}
                {e.reason ? ` · ${e.reason}` : ""}
              </p>
            ))}
          </div>
        ) : null}
      </Section>

      <TeamSection members={data.team.map((m) => ({ id: m.id, name: m.displayName, role: t(`providerRole.${m.role}`), title: m.displayTitle }))} />
      <SupportLink subject="PROVIDER" id={data.id} />
    </div>
  );
}

export function AdminPartnerShopProfile({ id }: { id: string }) {
  const t = useTranslations("admin.partners.profile");
  const types = useTranslations("providerDiscovery.providerTypes");
  const roles = useTranslations("seller.team.roles");
  const status = useStatusText();
  const { locale, money, num, dateTime } = useFormat();
  const load = useCallback(() => adminPartnersService.getShop(id), [id]);
  const { data, error, retry } = useProfile<AdminPartnerShopDetailDto>(load);
  if (!data) return <ProfileState error={error} retry={retry} />;
  const hours = new Map<number, string[]>();
  for (const h of data.openingHours) hours.set(h.dayOfWeek, [...(hours.get(h.dayOfWeek) ?? []), `${h.open}–${h.close}`]);

  return (
    <div className="flex min-w-0 flex-col gap-4 break-words">
      <Link className="text-metadata underline" href={`/${locale}/admin/sellers`}>
        {t("backShops")}
      </Link>
      <Header
        name={data.name}
        logoUrl={data.logoUrl}
        subtitle={[data.address.city, data.address.province].filter(Boolean).join(" · ")}
        tags={
          <>
            <StatusLabel tone={adminStatusTone(data.status)}>{status.label(data.status)}</StatusLabel>
            <StatusLabel tone={adminStatusTone(data.kyc.status)}>{status.label(data.kyc.status)}</StatusLabel>
          </>
        }
      />
      {data.linkedService ? (
        <p className="text-metadata">
          <Link className="underline" href={`/${locale}/admin/providers/${data.linkedService.id}`}>
            {t("alsoService", { name: data.linkedService.name })}
          </Link>{" "}
          · {data.linkedService.serviceKinds.map((k) => types(k)).join(" · ")} · {status.label(data.linkedService.verificationStatus)}
        </p>
      ) : null}

      <Section title={t("identity")}>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Fact label={t("phone")} value={data.phone} />
          <Fact label={t("email")} value={data.email} />
          <Fact label={t("joined")} value={dateTime(data.createdAt)} />
          {data.slug ? (
            <Fact
              label={t("storefront")}
              value={
                <Link className="underline" href={`/${locale}/shop/sellers/${data.slug}`}>
                  {data.slug}
                </Link>
              }
            />
          ) : null}
        </dl>
        {data.description ? <p className="whitespace-pre-wrap text-body text-text-secondary">{data.description}</p> : null}
      </Section>

      <KycSection kyc={data.kyc} subject="seller" id={data.id} />

      <Section title={t("address")}>
        <dl className="grid gap-3 sm:grid-cols-2">
          <Fact label={t("province")} value={data.address.province} />
          <Fact label={t("city")} value={data.address.city} />
          <Fact label={t("addressLine")} value={data.address.addressLine} />
          <Fact label={t("postalCode")} value={data.address.postalCode} />
          <Fact label={t("pin")} value={data.address.latitude !== null && data.address.longitude !== null ? `${data.address.latitude.toFixed(5)}, ${data.address.longitude.toFixed(5)}` : null} />
        </dl>
      </Section>

      <Section title={t("hours")}>
        {data.openingHours.length === 0 ? (
          <p className="text-metadata text-text-secondary">{t("noHours")}</p>
        ) : (
          <dl className="grid gap-2 sm:grid-cols-2">
            {WEEK.map((d) => (
              <Fact key={d} label={t(`weekday.${d}`)} value={hours.get(d)?.join("، ") ?? t("closed")} />
            ))}
          </dl>
        )}
      </Section>

      <Section
        title={t("products")}
        aside={
          <span className="text-metadata text-text-secondary">
            {t("offerSummary", { active: num(data.offers.counts.ACTIVE ?? 0), pending: num(data.offers.pendingReview), requests: num(data.pendingCatalogRequests) })}
          </span>
        }
      >
        {data.offers.items.length === 0 ? <p className="text-metadata text-text-secondary">{t("noOffers")}</p> : null}
        <ul className="flex flex-col gap-2">
          {data.offers.items.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-2 first:border-t-0 first:pt-0">
              <span className="min-w-0">
                <Link className="block text-body text-text-primary underline" href={`/${locale}/admin/commerce/products/${o.productId}`}>
                  {o.productTitle}
                </Link>
                <span className="block text-metadata text-text-secondary">
                  {o.variantTitle ?? o.variantSku} · {money(o.priceAmount)} · {o.available === null ? t("noStock") : t("inStock", { count: num(o.available) })}
                </span>
              </span>
              <span className="flex flex-wrap gap-1">
                <StatusLabel tone={adminStatusTone(o.status)}>{status.label(o.status)}</StatusLabel>
                <StatusLabel tone={adminStatusTone(o.moderationStatus)}>{status.label(o.moderationStatus)}</StatusLabel>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <TeamSection members={data.team.map((m) => ({ id: m.id, name: m.displayName, role: roles(m.role), title: null }))} />
      <SupportLink subject="SELLER" id={data.id} />
    </div>
  );
}

function TeamSection({ members }: { members: Array<{ id: string; name: string; role: string; title: string | null }> }) {
  const t = useTranslations("admin.partners.profile");
  return (
    <Section title={t("team")}>
      {members.length === 0 ? <p className="text-metadata text-text-secondary">{t("noTeam")}</p> : null}
      <ul className="flex flex-col gap-1">
        {members.map((m) => (
          <li key={m.id} className="text-body text-text-primary">
            {m.name}
            <span className="text-metadata text-text-secondary">
              {" "}
              · {m.role}
              {m.title ? ` · ${m.title}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** The business's own support cases (the Partners queue in admin support). */
function SupportLink({ subject, id }: { subject: "PROVIDER" | "SELLER"; id: string }) {
  const t = useTranslations("admin.partners.profile");
  const locale = useLocale();
  return (
    <p className="text-metadata">
      <Link className="underline" href={`/${locale}/admin/support?requester=${subject}&org=${id}`}>
        {t("supportCases")}
      </Link>
    </p>
  );
}
