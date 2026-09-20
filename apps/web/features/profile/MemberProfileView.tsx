"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Avatar, Button, Input, ContextSurface, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { HouseholdDto, UserDto } from "@petlife/types";
import { usersService } from "@/services/users.service";
import { householdsService } from "@/services/households.service";
import { useSessionStore } from "@/stores/session-store";
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
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [saved, setSaved] = useState(false);
  async function saveProfile() {
    if (!displayName.trim() || saving) return;
    setSaving(true); setSaveError(false); setSaved(false);
    try { const updated = await usersService.updateMe({displayName:displayName.trim()}); setUser(updated); useSessionStore.getState().setUser(updated); setEditing(false); setSaved(true); }
    catch { setSaveError(true); } finally { setSaving(false); }
  }

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const [member, home] = await Promise.all([usersService.getMe(), householdId ? householdsService.getById(householdId) : Promise.resolve(null)]);
      setUser(member); setDisplayName(member.displayName); setHousehold(home);
    } catch { setFailed(true); }
  }, [householdId]);
  useEffect(() => { void load(); }, [load]);
  if (failed) return <ErrorRecovery title={t("title")} message={t("loadError")} retryLabel={common("retry")} onRetry={load} />;
  if (!user) return <Skeleton className="h-72 w-full" aria-label={common("loading")} />;

  return <div className="profile-workspace">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-4"><Avatar src={user.avatarUrl} name={user.displayName} size="lg" /><div>
        <p className="text-metadata text-text-secondary">{t("eyebrow")}</p><h1 className="text-page-title text-text-primary">{user.displayName}</h1>
        <p className="text-body text-text-secondary">{user.email ?? user.phone ?? t("contactMissing")}</p>
      </div></div>
      <Button variant="secondary" onClick={() => { setDisplayName(user.displayName); setEditing(true); setSaved(false); }}>{locale === "fa" ? "ویرایش پروفایل" : "Edit profile"}</Button>
    </header>
    {saved && <p role="status" className="text-brand-natural">{locale === "fa" ? "اطلاعات پروفایل ذخیره شد." : "Profile saved."}</p>}
    {editing && <form className="profile-editor" onSubmit={(event) => { event.preventDefault(); void saveProfile(); }}><h2 className="text-section-title">{locale === "fa" ? "اطلاعات شخصی" : "Personal information"}</h2><Input label={locale === "fa" ? "نام نمایشی" : "Display name"} value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={120} required disabled={saving} />{saveError && <p role="alert" className="text-state-urgent">{locale === "fa" ? "ذخیره انجام نشد. دوباره تلاش کنید." : "Could not save. Please try again."}</p>}<div className="flex gap-3"><Button type="submit" isLoading={saving} disabled={!displayName.trim()}>{locale === "fa" ? "ذخیره تغییرات" : "Save changes"}</Button><Button type="button" variant="ghost" disabled={saving} onClick={() => setEditing(false)}>{locale === "fa" ? "انصراف" : "Cancel"}</Button></div></form>}
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(17rem,0.6fr)]">
      <ContextSurface className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3"><div><p className="text-metadata text-text-secondary">{t("household")}</p><h2 className="text-section-title text-text-primary">{household?.name ?? t("defaultHousehold")}</h2></div>{household && <StatusLabel tone="success">{t("active")}</StatusLabel>}</div>
        <div className="grid grid-cols-2 gap-3 border-y border-border-subtle py-4"><Metric label={t("petsCount")} value={String(pets.length)} /><Metric label={t("location")} value={[household?.city, household?.countryCode].filter(Boolean).join("، ") || t("notSet")} /></div>
        <div className="flex flex-wrap gap-2">{pets.slice(0, 4).map((pet) => <Button key={pet.id} size="sm" variant="ghost" onClick={() => router.push(`/${locale}/pets/${pet.id}`)}>{pet.name}</Button>)}<Button size="sm" variant="secondary" onClick={() => router.push(`/${locale}/pets`)}>{t("managePets")}</Button></div>
      </ContextSurface>
      <ContextSurface className="flex flex-col justify-between gap-4 bg-brand-wash"><div><p className="text-metadata text-brand-natural">{t("membership")}</p><h2 className="text-section-title text-text-primary">{t("careMembership")}</h2><p className="mt-2 text-body text-text-secondary">{t("membershipDescription")}</p></div><Button onClick={() => router.push(`/${locale}/subscription`)}>{t("viewMembership")}</Button></ContextSurface>
    </section>
    <section><h2 className="mb-3 text-section-title text-text-primary">{t("manage")}</h2><div className="profile-destinations">
      {destinations.map((item) => <button key={item.key} type="button" onClick={() => router.push(`/${locale}${item.href}`)} className="min-h-20 border-b border-border-subtle px-1 py-4 text-start transition-colors hover:bg-surface-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"><span className="text-label font-semibold text-text-primary">{t(`destinations.${item.key}.title`)}</span><span className="mt-1 block text-metadata text-text-secondary">{t(`destinations.${item.key}.description`)}</span></button>)}
    </div></section>
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div><p className="text-metadata text-text-secondary">{label}</p><p className="text-body font-semibold text-text-primary">{value}</p></div>; }
