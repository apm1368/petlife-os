"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { Button, ContextSurface, ErrorRecovery, Input, Skeleton, StatusLabel } from "@petlife/ui";
import {
  PetLifecycleStatus,
  type PetAccessFlags,
  type PetOverviewAttentionDto,
  type PetOverviewDto,
  type PetOverviewEventDto,
} from "@petlife/types";
import { petsService } from "@/services/pets.service";
import { usePetStore } from "@/stores/pet-store";

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

  async function load() {
    setError(false);
    try {
      const [data, permissions] = await Promise.all([petsService.getOverview(petId), petsService.getMyAccess(petId)]);
      setOverview(data);
      setAccess(permissions);
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

  return (
    <div className="flex flex-col gap-10">
      <header className="max-w-3xl">
        <p className="text-xs font-black uppercase tracking-[.14em] text-brand-natural">{c.eyebrow}</p>
        <h1 className="mt-2 text-page-title text-text-primary">{isMemorial ? c.memorialTitle : c.title}</h1>
        <p className="mt-3 max-w-2xl text-body leading-8 text-text-secondary">{isMemorial ? c.memorialDescription : c.description}</p>
        {overview.householdName ? <p className="mt-3 text-xs text-text-secondary">{c.household}: {overview.householdName}</p> : null}
      </header>

      {!isMemorial ? (
        <OverviewSection title={c.attention}>
          {overview.attention.length === 0 ? (
            <ContextSurface className="border-s-4 border-s-brand-natural">
              <p className="text-body text-text-primary">{c.noAttention}</p>
              <p className="mt-2 text-sm leading-7 text-text-secondary">{c.noAttentionHint}</p>
            </ContextSurface>
          ) : (
            <div className="divide-y divide-border-subtle border-y border-border-subtle">
              {overview.attention.map((item) => <AttentionRow key={item.id} item={item} base={base} locale={locale} />)}
            </div>
          )}
        </OverviewSection>
      ) : null}

      {!isMemorial ? (
        <OverviewSection title={c.upcoming}>
          <EventList items={overview.upcoming} empty={c.noUpcoming} base={base} locale={locale} />
        </OverviewSection>
      ) : null}

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
        <OverviewSection title={c.recentHealth}>
          <EventList items={overview.recentHealth} empty={c.noHealth} base={base} locale={locale} compact />
        </OverviewSection>
        <OverviewSection title={c.recentActivity}>
          <EventList items={overview.recentActivity} empty={c.noActivity} base={base} locale={locale} compact />
        </OverviewSection>
      </div>

      <div className="grid grid-cols-1 gap-8 border-t border-border-subtle pt-8 md:grid-cols-[1fr_1.2fr]">
        <OverviewSection title={c.recentMemory}>
          {overview.recentMemory ? (
            <Link href={base + "/memories/" + overview.recentMemory.id} className="block border-s-2 border-[#76638c] ps-4">
              <p className="font-bold text-text-primary">{overview.recentMemory.title ?? formatDate(overview.recentMemory.occurredAt, locale)}</p>
              <p className="mt-1 text-xs text-text-secondary">{formatDate(overview.recentMemory.occurredAt, locale)}</p>
            </Link>
          ) : <p className="text-sm text-text-secondary">{c.noMemory}</p>}
        </OverviewSection>
        <OverviewSection title={c.useful}>
          <div className="grid grid-cols-1 gap-px overflow-hidden border border-border-subtle bg-border-subtle sm:grid-cols-2">
            {access.canViewHealth ? <Shortcut href={base + "/health"} label={c.health} /> : null}
            {access.canViewCareProfile ? <Shortcut href={base + "/care"} label={c.care} /> : null}
            {access.canEditHealth ? <Shortcut href={base + "/health/advanced/documents"} label={c.document} /> : null}
            <Shortcut href={base + "/memories/new"} label={c.memory} />
          </div>
        </OverviewSection>
      </div>
    </div>
  );
}

function OverviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h2 className="mb-4 text-section-title text-text-primary">{title}</h2>{children}</section>;
}

function AttentionRow({ item, base, locale }: { item: PetOverviewAttentionDto; base: string; locale: "fa" | "en" }) {
  const c = copy[locale];
  const label = item.title === "VACCINATION_OVERDUE" ? c.vaccinationOverdue : item.title === "VACCINATION_DUE_SOON" ? c.vaccinationDue : item.title === "HEALTH_PROFILE_INCOMPLETE" ? c.incomplete : item.title;
  const tone = item.severity === "INFORMATIONAL" ? "neutral" : "attention";
  return (
    <Link href={base + item.href} className="grid min-h-20 grid-cols-[auto_1fr_auto] items-center gap-4 py-4">
      <span className={"h-10 w-1 " + severityClass(item.severity)} aria-hidden="true" />
      <div><p className="font-bold text-text-primary">{label}</p>{item.dueAt ? <p className="mt-1 text-xs text-text-secondary">{formatDate(item.dueAt, locale)}</p> : null}</div>
      <StatusLabel tone={tone}>{item.severity}</StatusLabel>
    </Link>
  );
}

function EventList({ items, empty, base, locale, compact = false }: { items: PetOverviewEventDto[]; empty: string; base: string; locale: "fa" | "en"; compact?: boolean }) {
  if (items.length === 0) return <p className="border-y border-border-subtle py-5 text-sm text-text-secondary">{empty}</p>;
  return (
    <div className="divide-y divide-border-subtle border-y border-border-subtle">
      {items.map((item) => {
        const href = item.href.startsWith("/bookings/") ? "/" + locale + item.href : base + item.href;
        return (
          <Link key={item.type + "-" + item.id} href={href} className={"flex items-start justify-between gap-4 py-4 " + (compact ? "min-h-20" : "min-h-24")}>
            <div className="min-w-0"><p className="truncate font-bold text-text-primary">{eventTitle(item.title, locale)}</p><p className="mt-1 text-xs text-text-secondary">{formatDate(item.occurredAt, locale)}{item.providerName ? " · " + item.providerName : ""}</p></div>
            <StatusLabel tone="neutral">{sourceLabel(item, locale)}</StatusLabel>
          </Link>
        );
      })}
    </div>
  );
}

function Shortcut({ href, label }: { href: string; label: string }) {
  return <Link href={href} className="flex min-h-16 items-center justify-between bg-surface-elevated px-4 py-3 text-sm font-bold text-text-primary hover:bg-surface-subtle"><span>{label}</span><span aria-hidden="true">←</span></Link>;
}

function sourceLabel(item: PetOverviewEventDto, locale: "fa" | "en") {
  const c = copy[locale];
  if (item.sourceType === "PROVIDER" || item.sourceType === "CLINIC") return c.provider;
  if (item.sourceType === "OWNER" || item.sourceType === "HOUSEHOLD_MEMBER") return c.owner;
  return item.type === "BOOKING" ? c.recordedData : c.system;
}

function eventTitle(title: string, locale: "fa" | "en") {
  const labels: Record<string, readonly [string, string]> = {
    "careCalendar.event.vetAppointment": ["وقت دامپزشکی", "Vet appointment"],
    "careCalendar.event.grooming": ["آرایش و نظافت", "Grooming"],
    "careCalendar.event.training": ["جلسه آموزش", "Training session"],
    "careCalendar.event.walk": ["پیاده‌روی", "Walk"],
    "careCalendar.event.sitting": ["نگهداری", "Pet sitting"],
    "careCalendar.event.boarding": ["پانسیون", "Boarding"],
    "careCalendar.event.petTaxi": ["تاکسی حیوانات", "Pet taxi"],
    MEMORY: ["خاطره", "Memory"],
  };
  return labels[title]?.[locale === "fa" ? 0 : 1] ?? title;
}

function formatDate(value: string, locale: "fa" | "en") {
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : "en-US", { dateStyle: "medium", timeZone: "Asia/Tehran" }).format(new Date(value));
}

function severityClass(severity: PetOverviewAttentionDto["severity"]) {
  if (severity === "EMERGENCY" || severity === "URGENT") return "bg-state-urgent";
  if (severity === "CONCERN") return "bg-[#d86f61]";
  if (severity === "ATTENTION") return "bg-state-attention";
  return "bg-brand-natural";
}
