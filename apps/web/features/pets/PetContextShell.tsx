"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { usePathname } from "next/navigation";
import { Avatar, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import { PetLifecycleStatus, type PetAccessFlags, type PetDto } from "@petlife/types";
import { petsService } from "@/services/pets.service";
import { SystemState, systemStateFor, type SystemStateKind } from "@/features/system/SystemState";

const copy = {
  fa: {
    aria: "بخش‌های پرونده حیوان",
    overview: "نمای کلی",
    health: "سلامت",
    care: "مراقبت",
    documents: "اسناد",
    memories: "خاطرات",
    activity: "فعالیت",
    travel: "سفر",
    edit: "ویرایش مشخصات",
    unknownBreed: "نژاد ثبت نشده",
    unknownAge: "سن ثبت نشده",
    weight: "وزن",
    microchip: "میکروچیپ",
    unknown: "نامشخص",
    loadError: "پرونده این حیوان در دسترس نیست.",
    retry: "تلاش دوباره",
    loading: "در حال بارگذاری پرونده",
    active: "فعال",
    lost: "گمشده",
    transferred: "واگذاری موقت",
    deceased: "درگذشته",
    memorial: "یادبود",
    lostMessage: "حالت گمشده فعال است؛ اطلاعات پزشکی همچنان خصوصی می‌ماند.",
    transferredMessage: "مراقبت این حیوان موقتاً واگذار شده است؛ سطح دسترسی جاری را بررسی کنید.",
    memorialMessage: "پرونده سلامت برای حفظ سابقه در دسترس است؛ یادها و داستان زندگی در اولویت‌اند.",
  },
  en: {
    aria: "Pet profile sections",
    overview: "Overview",
    health: "Health",
    care: "Care",
    documents: "Documents",
    memories: "Memories",
    activity: "Activity",
    travel: "Travel",
    edit: "Edit identity",
    unknownBreed: "Breed not recorded",
    unknownAge: "Age not recorded",
    weight: "Weight",
    microchip: "Microchip",
    unknown: "Unknown",
    loadError: "This pet profile is unavailable.",
    retry: "Try again",
    loading: "Loading pet profile",
    active: "Active",
    lost: "Lost",
    transferred: "Temporarily transferred",
    deceased: "Deceased",
    memorial: "Memorial",
    lostMessage: "Lost mode is active; medical information remains private.",
    transferredMessage: "Care is temporarily transferred; review the current access scope.",
    memorialMessage: "Health history remains available; memories and the pet's life story take priority.",
  },
} as const;

const sections = [
  { key: "overview", suffix: "" },
  { key: "health", suffix: "/health" },
  { key: "care", suffix: "/care" },
  { key: "documents", suffix: "/health/documents" },
  { key: "memories", suffix: "/memories" },
  { key: "activity", suffix: "/life-timeline" },
  { key: "travel", suffix: "/travel" },
] as const;

export function PetContextShell({ petId, children }: { petId: string; children: ReactNode }) {
  const locale = useLocale() as "fa" | "en";
  const pathname = usePathname() ?? "";
  const c = copy[locale];
  const [pet, setPet] = useState<PetDto | null>(null);
  const [access, setAccess] = useState<PetAccessFlags | null>(null);
  const [error, setError] = useState<SystemStateKind | null>(null);

  async function load() {
    setError(null);
    try {
      const [petData, accessData] = await Promise.all([petsService.getById(petId), petsService.getMyAccess(petId)]);
      setPet(petData);
      setAccess(accessData);
    } catch (err) {
      setError(systemStateFor(err));
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId]);

  if (error === "GENERIC_RETRYABLE_ERROR") return <ErrorRecovery title={c.loadError} message="" retryLabel={c.retry} onRetry={load} />;
  // Access that ended, was removed or never existed explains itself — and says nothing about the pet.
  if (error) return <SystemState kind={error} returnTo={pathname} />;
  if (!pet || !access) return <Skeleton className="h-72 w-full" aria-label={c.loading} />;

  const isMemorial = pet.lifecycleStatus === PetLifecycleStatus.DECEASED || pet.lifecycleStatus === PetLifecycleStatus.MEMORIAL;
  const visibleSections = sections.filter((section) => {
    if (section.key === "health" || section.key === "documents") return access.canViewHealth;
    if (section.key === "care") return access.canViewCareProfile;
    if (section.key === "travel") return !isMemorial;
    return true;
  });
  const lifecycle = lifecyclePresentation(pet.lifecycleStatus, c);
  const base = "/" + locale + "/pets/" + petId;

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-0">
      <header className="flex flex-col gap-5 border-b border-border-subtle pb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar src={pet.photoUrl} name={pet.name} size="lg" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-[clamp(1.6rem,4vw,2.5rem)] font-bold leading-tight text-text-primary">{pet.name}</p>
              <StatusLabel tone={lifecycle.tone}>{lifecycle.label}</StatusLabel>
            </div>
            <p className="mt-1 text-sm text-text-secondary">
              {speciesLabel(pet, locale)} · {pet.breed ?? c.unknownBreed} · {formatAge(pet, locale, c.unknownAge)}
            </p>
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs">
              <div className="flex gap-2"><dt className="text-text-secondary">{c.weight}</dt><dd className="text-text-primary">{pet.latestWeightValue ? String(pet.latestWeightValue) + " " + (pet.latestWeightUnit ?? "") : c.unknown}</dd></div>
              <div className="flex gap-2"><dt className="text-text-secondary">{c.microchip}</dt><dd className="text-text-primary">{pet.microchipNumber ?? c.unknown}</dd></div>
            </dl>
          </div>
        </div>
        {access.canEditIdentity ? <Link className="self-start border-b border-brand-natural pb-1 text-sm font-bold text-brand-natural" href={base + "?edit=identity"}>{c.edit}</Link> : null}
      </header>

      {lifecycle.message ? (
        <div className={"my-4 border-s-4 px-4 py-3 text-sm leading-7 " + lifecycle.className} role="status">
          {lifecycle.message}
        </div>
      ) : null}

      <nav className="flex gap-1 overflow-x-auto border-b border-border-subtle py-3" aria-label={c.aria}>
        {visibleSections.map((section) => {
          const href = base + section.suffix;
          const active = section.key === "health"
            ? (pathname === href || pathname.startsWith(href + "/")) && !pathname.startsWith(base + "/health/documents")
            : section.suffix ? pathname === href || pathname.startsWith(href + "/") : pathname === base;
          return (
            <Link key={section.key} href={href} aria-current={active ? "page" : undefined} className="shrink-0 border-b-2 border-transparent px-3 py-2 text-sm text-text-secondary hover:text-text-primary aria-[current=page]:border-brand-natural aria-[current=page]:font-bold aria-[current=page]:text-brand-natural">
              {c[section.key]}
            </Link>
          );
        })}
      </nav>

      <main className="min-w-0 py-7">{children}</main>
    </div>
  );
}

function lifecyclePresentation(status: PetLifecycleStatus, c: typeof copy.fa | typeof copy.en) {
  if (status === PetLifecycleStatus.LOST) return { label: c.lost, message: c.lostMessage, tone: "attention" as const, className: "border-state-urgent bg-state-urgent/5 text-text-primary" };
  if (status === PetLifecycleStatus.TEMPORARILY_TRANSFERRED) return { label: c.transferred, message: c.transferredMessage, tone: "neutral" as const, className: "border-state-attention bg-state-attention/5 text-text-primary" };
  if (status === PetLifecycleStatus.DECEASED) return { label: c.deceased, message: c.memorialMessage, tone: "neutral" as const, className: "border-[#76638c] bg-surface-subtle text-text-primary" };
  if (status === PetLifecycleStatus.MEMORIAL) return { label: c.memorial, message: c.memorialMessage, tone: "neutral" as const, className: "border-[#76638c] bg-surface-subtle text-text-primary" };
  return { label: c.active, message: null, tone: "success" as const, className: "" };
}

function speciesLabel(pet: PetDto, locale: "fa" | "en") {
  if (locale === "fa") return pet.species === "DOG" ? "سگ" : "گربه";
  return pet.species === "DOG" ? "Dog" : "Cat";
}

function formatAge(pet: PetDto, locale: "fa" | "en", unknown: string): string {
  const months = pet.birthDate ? Math.max(0, Math.floor((Date.now() - new Date(pet.birthDate).getTime()) / 2629746000)) : pet.approximateAgeMonths;
  if (months === null) return unknown;
  const years = Math.floor(months / 12);
  const remaining = months % 12;
  if (locale === "fa") return years > 0 ? String(years) + " سال و " + String(remaining) + " ماه" : String(remaining) + " ماه";
  return years > 0 ? String(years) + "y " + String(remaining) + "m" : String(remaining) + "m";
}
