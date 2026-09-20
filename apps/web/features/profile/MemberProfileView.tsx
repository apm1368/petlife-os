"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Avatar, Button, ContextSurface, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { HouseholdDto, UserDto } from "@petlife/types";
import { usersService } from "@/services/users.service";
import { householdsService } from "@/services/households.service";
import { usePetStore } from "@/stores/pet-store";

const destinations = [
  { href: "/pets", key: "pets" }, { href: "/subscription", key: "membership" },
  { href: "/bookings", key: "bookings" }, { href: "/orders", key: "orders" },
  { href: "/notifications/preferences", key: "notifications" }, { href: "/support", key: "support" },
] as const;

export function MemberProfileView() {
  const t = useTranslations("memberProfile"); const common = useTranslations("common");
  const locale = useLocale(); const router = useRouter();
  const householdId = usePetStore((state) => state.householdId); const pets = usePetStore((state) => state.pets);
  const [user, setUser] = useState<UserDto | null>(null); const [household, setHousehold] = useState<HouseholdDto | null>(null);
  const [failed, setFailed] = useState(false);

  async function load() {
    setFailed(false);
    try {
      const [member, home] = await Promise.all([usersService.getMe(), householdId ? householdsService.getById(householdId) : Promise.resolve(null)]);
      setUser(member); setHousehold(home);
    } catch { setFailed(true); }
  }
  useEffect(() => { void load(); }, [householdId]);
  if (failed) return <ErrorRecovery title={t("title")} message={t("loadError")} retryLabel={common("retry")} onRetry={load} />;
  if (!user) return <Skeleton className="h-72 w-full" aria-label={common("loading")} />;

  return <div className="flex flex-col gap-6">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-4"><Avatar src={user.avatarUrl} name={user.displayName} size="lg" /><div>
        <p className="text-metadata text-text-secondary">{t("eyebrow")}</p><h1 className="text-page-title text-text-primary">{user.displayName}</h1>
        <p className="text-body text-text-secondary">{user.email ?? user.phone ?? t("contactMissing")}</p>
      </div></div>
      <Button variant="secondary" onClick={() => router.push(`/${locale}/notifications/preferences`)}>{t("settings")}</Button>
    </header>
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(17rem,0.6fr)]">
      <ContextSurface className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3"><div><p className="text-metadata text-text-secondary">{t("household")}</p><h2 className="text-section-title text-text-primary">{household?.name ?? t("defaultHousehold")}</h2></div><StatusLabel tone="success">{t("active")}</StatusLabel></div>
        <div className="grid grid-cols-2 gap-3 rounded-xl bg-surface-subtle p-4"><Metric label={t("petsCount")} value={String(pets.length)} /><Metric label={t("location")} value={[household?.city, household?.countryCode].filter(Boolean).join("، ") || t("notSet")} /></div>
        <div className="flex flex-wrap gap-2">{pets.slice(0, 4).map((pet) => <Button key={pet.id} size="sm" variant="ghost" onClick={() => router.push(`/${locale}/pets/${pet.id}`)}>{pet.name}</Button>)}<Button size="sm" variant="secondary" onClick={() => router.push(`/${locale}/pets`)}>{t("managePets")}</Button></div>
      </ContextSurface>
      <ContextSurface className="flex flex-col justify-between gap-4 bg-brand-wash"><div><p className="text-metadata text-brand-natural">{t("membership")}</p><h2 className="text-section-title text-text-primary">{t("careMembership")}</h2><p className="mt-2 text-body text-text-secondary">{t("membershipDescription")}</p></div><Button onClick={() => router.push(`/${locale}/subscription`)}>{t("viewMembership")}</Button></ContextSurface>
    </section>
    <section><h2 className="mb-3 text-section-title text-text-primary">{t("manage")}</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {destinations.map((item) => <button key={item.key} type="button" onClick={() => router.push(`/${locale}${item.href}`)} className="min-h-24 rounded-2xl border border-border-subtle bg-surface-elevated p-4 text-start shadow-sm transition hover:-translate-y-0.5 hover:border-border-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"><span className="text-label font-semibold text-text-primary">{t(`destinations.${item.key}.title`)}</span><span className="mt-1 block text-metadata text-text-secondary">{t(`destinations.${item.key}.description`)}</span></button>)}
    </div></section>
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div><p className="text-metadata text-text-secondary">{label}</p><p className="text-body font-semibold text-text-primary">{value}</p></div>; }
