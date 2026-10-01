"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { Button, ErrorRecovery, Input, Skeleton, StatusLabel } from "@petlife/ui";
import {
  PetLifecycleStatus,
  type PetAccessFlags,
  type PetOverviewAttentionDto,
  type PetOverviewDto,
  type PetOverviewEventDto,
} from "@petlife/types";
import { petsService } from "@/services/pets.service";
import { usePetStore } from "@/stores/pet-store";
import { careRemindersService, type CareReminder } from "@/services/care-reminders.service";
import { careTitle } from "@/features/care/care-labels";
import { attentionTitle, eventSourceLabel, eventTitle, formatOverviewDate, severityBarClass, severityLabel, severityTone, collapseLabPanels } from "./overview-labels";

const copy = {
  fa: {
    eyebrow: "پرونده یکپارچه",
    title: "آنچه اکنون اهمیت دارد",
    description: "مراقبت‌های ضروری، رویدادهای پیش‌رو و سابقه اخیر بر اساس اطلاعات واقعی ثبت‌شده.",
    attention: "نیازمند توجه",
    noAttention: "بر اساس داده‌های ثبت‌شده، مورد اقدام‌پذیری پیدا نشد.",
    noAttentionHint: "این پیام به معنی تأیید کامل سلامت یا نبود اطلاعات ناشناخته نیست.",
    upcoming: "پیش‌رو",
    noUpcoming: "رویداد زمان‌داری برای آینده ثبت نشده است.",
    recentHealth: "سلامت اخیر",
    noHealth: "هنوز رویداد سلامت قابل نمایش ثبت نشده است.",
    recentActivity: "فعالیت اخیر",
    noActivity: "هنوز فعالیتی برای این حیوان ثبت نشده است.",
    recentMemory: "آخرین خاطره",
    noMemory: "هنوز خاطره‌ای ثبت نشده است.",
    useful: "دسترسی سریع",
    health: "مشاهده پرونده سلامت",
    care: "مرکز مراقبت",
    document: "بارگذاری سند پزشکی",
    memory: "ثبت خاطره",
    household: "خانواده",
    editTitle: "ویرایش مشخصات",
    name: "نام",
    breed: "نژاد",
    cancel: "انصراف",
    save: "ذخیره تغییرات",
    loadError: "نمای کلی پرونده بارگذاری نشد.",
    retry: "تلاش دوباره",
    loading: "در حال آماده‌سازی نمای کلی",
    recordedData: "داده ثبت‌شده",
    provider: "ارائه‌دهنده",
    owner: "مالک/خانواده",
    system: "سیستم",
    incomplete: "پروفایل سلامت کامل نشده است.",
    vaccinationOverdue: "موعد واکسیناسیون گذشته است.",
    vaccinationDue: "موعد واکسیناسیون نزدیک است.",
    memorialTitle: "داستان و سابقه زندگی",
    memorialDescription: "سابقه سلامت محترمانه در دسترس می‌ماند و یادها در اولویت قرار می‌گیرند.",
  },
  en: {
    eyebrow: "Unified pet record",
    title: "What matters now",
    description: "Actionable care, upcoming events, and recent history from real recorded information.",
    attention: "Needs attention",
    noAttention: "No actionable item was found in the recorded data.",
    noAttentionHint: "This does not mean all health information is known or clinically normal.",
    upcoming: "Upcoming",
    noUpcoming: "No future dated event has been recorded.",
    recentHealth: "Recent health",
    noHealth: "No health event is available yet.",
    recentActivity: "Recent activity",
    noActivity: "No activity has been recorded for this pet yet.",
    recentMemory: "Latest memory",
    noMemory: "No memory has been recorded yet.",
    useful: "Useful shortcuts",
    health: "Open health record",
    care: "Care center",
    document: "Upload medical document",
    memory: "Add memory",
    household: "Household",
    editTitle: "Edit identity",
    name: "Name",
    breed: "Breed",
    cancel: "Cancel",
    save: "Save changes",
    loadError: "The pet overview could not be loaded.",
    retry: "Try again",
    loading: "Preparing pet overview",
    recordedData: "Recorded data",
    provider: "Provider",
    owner: "Owner/household",
    system: "System",
    incomplete: "The health profile is incomplete.",
    vaccinationOverdue: "Vaccination is overdue.",
    vaccinationDue: "Vaccination is due soon.",
    memorialTitle: "Life story and history",
    memorialDescription: "Health history remains respectfully available while memories take priority.",
  },
} as const;

export function PetProfileView({ petId }: { petId: string }) {
  const locale = useLocale() as "fa" | "en";
  const c = copy[locale];
  const upsertPet = usePetStore((state) => state.upsertPet);
  const [overview, setOverview] = useState<PetOverviewDto | null>(null);
  const [access, setAccess] = useState<PetAccessFlags | null>(null);
  const [error, setError] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState("");
  const [breed, setBreed] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  // The owner's care items (the care center's data) — read only when this person may see care.
  const [care, setCare] = useState<CareReminder[]>([]);

  async function load() {
    setError(false);
    try {
      const [data, permissions] = await Promise.all([petsService.getOverview(petId), petsService.getMyAccess(petId)]);
      setOverview(data);
      setAccess(permissions);
      setCare(permissions.canViewCareProfile ? await careRemindersService.list(petId).catch(() => []) : []);
      setName(data.pet.name);
      setBreed(data.pet.breed ?? "");
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
    setIsEditing(new URLSearchParams(window.location.search).get("edit") === "identity");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId]);

  async function saveIdentity() {
    if (!name.trim()) return;
    setIsSaving(true);
    try {
      const updated = await petsService.update(petId, { name: name.trim(), breed: breed.trim() || null });
      upsertPet(updated);
      setIsEditing(false);
      await load();
    } finally {
      setIsSaving(false);
    }
  }

  if (error) return <ErrorRecovery title={c.loadError} message="" retryLabel={c.retry} onRetry={load} />;
  if (!overview || !access) return <Skeleton className="h-96 w-full" aria-label={c.loading} />;

  const base = "/" + locale + "/pets/" + petId;
  const isMemorial = overview.pet.lifecycleStatus === PetLifecycleStatus.DECEASED || overview.pet.lifecycleStatus === PetLifecycleStatus.MEMORIAL;

  if (isEditing && access.canEditIdentity) {
    return (
      <section className="max-w-2xl">
        <p className="text-xs font-black uppercase tracking-[.14em] text-brand-natural">{c.eyebrow}</p>
        <h1 className="mt-2 text-page-title text-text-primary">{c.editTitle}</h1>
        <div className="mt-8 flex flex-col gap-5 border-y border-border-subtle py-7">
          <Input label={c.name} value={name} onChange={(event) => setName(event.target.value)} />
          <Input label={c.breed} value={breed} onChange={(event) => setBreed(event.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setIsEditing(false)}>{c.cancel}</Button>
            <Button variant="primary" isLoading={isSaving} disabled={!name.trim()} onClick={saveIdentity}>{c.save}</Button>
          </div>
        </div>
      </section>
    );
  }

  // Overdue / soon-due care belongs with "needs attention"; the next care items with "upcoming".
  const careAttention: PetOverviewAttentionDto[] = care
    .filter((item) => item.state === "OVERDUE" || item.state === "DUE")
    .map((item) => ({ id: `care-${item.id}`, severity: item.state === "OVERDUE" ? "ATTENTION" : "INFORMATIONAL", title: careTitle(item, locale), dueAt: item.dueAt, href: `/care/${item.id}` }));
  const careUpcoming: PetOverviewEventDto[] = care
    .filter((item) => item.state === "UPCOMING" || item.state === "SNOOZED")
    .slice(0, 3)
    .map((item) => ({ id: `care-${item.id}`, type: "CARE", title: careTitle(item, locale), occurredAt: item.snoozedUntil ?? item.dueAt, sourceType: null, providerName: null, href: `/care/${item.id}`, status: item.state }));
  const attention = [...careAttention.filter((i) => i.severity === "ATTENTION"), ...overview.attention, ...careAttention.filter((i) => i.severity !== "ATTENTION")];
  const upcoming = [...overview.upcoming, ...careUpcoming].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)).slice(0, 5);

  return (
    <div className="pet-overview">
      <h1 className="sr-only">{isMemorial ? c.memorialTitle : c.title}</h1>
      <div className="pet-overview__main">
        {isMemorial ? (
          <section className="pet-overview__memorial">
            <h2>{c.memorialTitle}</h2>
            <p>{c.memorialDescription}</p>
          </section>
        ) : null}
        {!isMemorial ? (
          <OverviewSection title={c.attention}>
            {attention.length === 0 ? (
              <div className="pet-overview__calm">
                <p>{c.noAttention}</p>
                <p>{c.noAttentionHint}</p>
              </div>
            ) : (
              <div className="divide-y divide-border-subtle border-y border-border-subtle">
                {attention.map((item) => <AttentionRow key={item.id} item={item} base={base} locale={locale} />)}
              </div>
            )}
          </OverviewSection>
        ) : null}
        {!isMemorial ? (
          <OverviewSection title={c.upcoming}>
            <EventList items={upcoming} empty={c.noUpcoming} base={base} locale={locale} showSource={false} compact />
          </OverviewSection>
        ) : null}
        <OverviewSection title={c.recentHealth}>
          <EventList items={collapseLabPanels(overview.recentHealth, locale)} empty={c.noHealth} base={base} locale={locale} compact />
        </OverviewSection>
      </div>

      <aside className="pet-overview__aside">
        <OverviewSection title={c.useful}>
          <div className="pet-overview__actions">
            {access.canViewHealth ? <Shortcut href={base + "/health"} label={c.health} /> : null}
            {access.canViewCareProfile ? <Shortcut href={base + "/care"} label={c.care} /> : null}
            {access.canEditHealth ? <Shortcut href={base + "/health/advanced/documents"} label={c.document} /> : null}
            <Shortcut href={base + "/memories/new"} label={c.memory} />
          </div>
        </OverviewSection>
        <OverviewSection title={c.recentActivity}>
          <EventList items={collapseLabPanels(overview.recentActivity.filter((a) => !overview.recentHealth.some((h) => h.type === a.type && h.id === a.id)), locale)} empty={c.noActivity} base={base} locale={locale} compact />
        </OverviewSection>
        <OverviewSection title={c.recentMemory}>
          {overview.recentMemory ? (
            <Link href={base + "/memories/" + overview.recentMemory.id} className="pet-overview__memory">
              <p>{overview.recentMemory.title ?? formatOverviewDate(overview.recentMemory.occurredAt, locale)}</p>
              <span>{formatOverviewDate(overview.recentMemory.occurredAt, locale)}</span>
            </Link>
          ) : <p className="text-sm text-text-secondary">{c.noMemory}</p>}
        </OverviewSection>
        {overview.householdName ? <p className="pet-overview__household">{c.household}: {overview.householdName}</p> : null}
      </aside>
    </div>
  );
}

function OverviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h2 className="mb-4 text-section-title text-text-primary">{title}</h2>{children}</section>;
}

function AttentionRow({ item, base, locale }: { item: PetOverviewAttentionDto; base: string; locale: "fa" | "en" }) {
  const label = attentionTitle(item.title, locale);
  const tone = severityTone(item.severity);
  return (
    <Link href={base + item.href} className="grid min-h-20 grid-cols-[auto_1fr_auto] items-center gap-4 py-4">
      <span className={"h-10 w-1 " + severityBarClass(item.severity)} aria-hidden="true" />
      <div><p className="font-bold text-text-primary">{label}</p>{item.dueAt ? <p className="mt-1 text-xs text-text-secondary">{formatOverviewDate(item.dueAt, locale)}</p> : null}</div>
      {item.severity === "ATTENTION" ? null : <StatusLabel tone={tone}>{severityLabel(item.severity, locale)}</StatusLabel>}
    </Link>
  );
}

function EventList({ items, empty, base, locale, compact = false, showSource = true }: { items: PetOverviewEventDto[]; empty: string; base: string; locale: "fa" | "en"; compact?: boolean; showSource?: boolean }) {
  if (items.length === 0) return <p className="border-y border-border-subtle py-5 text-sm text-text-secondary">{empty}</p>;
  return (
    <div className="divide-y divide-border-subtle border-y border-border-subtle">
      {items.map((item) => {
        const href = item.href.startsWith("/bookings/") ? "/" + locale + item.href : base + item.href;
        return (
          <Link key={item.type + "-" + item.id} href={href} className={"flex items-center justify-between gap-4 " + (compact ? "min-h-16 py-3" : "min-h-20 py-4")}>
            <div className="min-w-0"><p className="truncate font-bold text-text-primary">{eventTitle(item.title, locale)}</p><p className="mt-1 text-xs text-text-secondary">{formatOverviewDate(item.occurredAt, locale)}{item.providerName ? " · " + item.providerName : ""}</p></div>
            {showSource ? <StatusLabel tone="neutral">{eventSourceLabel(item, locale)}</StatusLabel> : null}
          </Link>
        );
      })}
    </div>
  );
}

function Shortcut({ href, label }: { href: string; label: string }) {
  return <Link href={href} className="pet-overview__action"><span>{label}</span><span aria-hidden="true" className="dir-flip">←</span></Link>;
}




