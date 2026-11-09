"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { usePathname } from "next/navigation";
import { Avatar, Dialog, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import { PetLifecycleStatus, type PetAccessFlags, type PetDto } from "@petlife/types";
import { petsService } from "@/services/pets.service";
import { SystemState, systemStateFor, type SystemStateKind } from "@/features/system/SystemState";
import { formatAge, formatWeight, speciesLabel } from "./pet-identity";
import { useActivePet } from "@/hooks/use-active-pet";
import type { RouteLocale } from "@/lib/i18n/config";

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
    expenses: "هزینه‌ها",
    edit: "ویرایش مشخصات",
    unknownBreed: "نژاد ثبت نشده",
    unknownAge: "سن ثبت نشده",
    weight: "وزن",
    microchip: "میکروچیپ",
    unknown: "ثبت نشده",
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
    sex: "جنسیت",
    male: "نر",
    female: "ماده",
    registered: "ثبت شده",
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
    expenses: "Expenses",
    edit: "Edit identity",
    unknownBreed: "Breed not recorded",
    unknownAge: "Age not recorded",
    weight: "Weight",
    microchip: "Microchip",
    unknown: "Not recorded",
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
    sex: "Sex",
    male: "Male",
    female: "Female",
    registered: "Registered",
  },
  de: {
    aria: "Bereiche des Haustierprofils",
    overview: "Übersicht",
    health: "Gesundheit",
    care: "Pflege",
    documents: "Dokumente",
    memories: "Erinnerungen",
    activity: "Aktivitäten",
    travel: "Reisen",
    expenses: "Ausgaben",
    edit: "Angaben bearbeiten",
    unknownBreed: "Rasse nicht angegeben",
    unknownAge: "Alter nicht angegeben",
    weight: "Gewicht",
    microchip: "Mikrochip",
    unknown: "Nicht angegeben",
    loadError: "Dieses Haustierprofil ist nicht verfügbar.",
    retry: "Erneut versuchen",
    loading: "Haustierprofil wird geladen",
    active: "Aktiv",
    lost: "Vermisst",
    transferred: "Vorübergehend übergeben",
    deceased: "Verstorben",
    memorial: "Erinnerungsseite",
    lostMessage: "Der Vermisstenmodus ist aktiv; medizinische Informationen bleiben privat.",
    transferredMessage: "Die Betreuung wurde vorübergehend übergeben. Prüfen Sie den aktuellen Zugriff.",
    memorialMessage:
      "Die Gesundheitsgeschichte bleibt verfügbar; Erinnerungen und Lebensgeschichte stehen im Vordergrund.",
    sex: "Geschlecht",
    male: "Männlich",
    female: "Weiblich",
    registered: "Registriert",
  },
  es: {
    aria: "Secciones del perfil de la mascota",
    overview: "Resumen",
    health: "Salud",
    care: "Cuidados",
    documents: "Documentos",
    memories: "Recuerdos",
    activity: "Actividad",
    travel: "Viajes",
    expenses: "Gastos",
    edit: "Editar datos",
    unknownBreed: "Raza no indicada",
    unknownAge: "Edad no indicada",
    weight: "Peso",
    microchip: "Microchip",
    unknown: "No indicado",
    loadError: "Este perfil de mascota no está disponible.",
    retry: "Intentar de nuevo",
    loading: "Cargando perfil de mascota",
    active: "Activa",
    lost: "Perdida",
    transferred: "Transferida temporalmente",
    deceased: "Fallecida",
    memorial: "En recuerdo",
    lostMessage: "El modo de mascota perdida está activo; la información médica sigue siendo privada.",
    transferredMessage: "El cuidado se ha transferido temporalmente. Revisa el acceso actual.",
    memorialMessage:
      "El historial de salud sigue disponible; los recuerdos y su historia de vida tienen prioridad.",
    sex: "Sexo",
    male: "Macho",
    female: "Hembra",
    registered: "Registrado",
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
  { key: "expenses", suffix: "/expenses" },
] as const;

export function PetContextShell({ petId, children }: { petId: string; children: ReactNode }) {
  // Pet-scoped pages hold client state while their requests resolve. Remount the
  // entire scope when the pet changes so neither the shell nor a nested medical
  // screen can briefly render the previous pet's data under the new URL.
  return (
    <PetContextForId key={petId} petId={petId}>
      {children}
    </PetContextForId>
  );
}

function PetContextForId({ petId, children }: { petId: string; children: ReactNode }) {
  const locale = useLocale() as RouteLocale;
  const pathname = usePathname() ?? "";
  const c = copy[locale];
  const [pet, setPet] = useState<PetDto | null>(null);
  const [access, setAccess] = useState<PetAccessFlags | null>(null);
  const [error, setError] = useState<SystemStateKind | null>(null);
  const [photoOpen, setPhotoOpen] = useState(false);
  const { pets: householdPets, activePetId, switchActivePet } = useActivePet();
  // The pet on screen is the pet in context: keep the header's active-pet control in step with it
  // (household pets only — a pet shared with you from another household never becomes "active").
  useEffect(() => {
    // Also when no active pet is saved yet (the header would otherwise fall back to the first pet).
    if (activePetId !== petId && householdPets.some((p) => p.id === petId))
      void switchActivePet(petId).catch(() => undefined);
  }, [petId, activePetId, householdPets, switchActivePet]);

  async function load() {
    setError(null);
    try {
      const [petData, accessData] = await Promise.all([
        petsService.getById(petId),
        petsService.getMyAccess(petId),
      ]);
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

  if (error === "GENERIC_RETRYABLE_ERROR")
    return <ErrorRecovery title={c.loadError} message="" retryLabel={c.retry} onRetry={load} />;
  // Access that ended, was removed or never existed explains itself — and says nothing about the pet.
  if (error) return <SystemState kind={error} returnTo={pathname} />;
  if (!pet || !access) return <Skeleton className="h-72 w-full" aria-label={c.loading} />;

  const isMemorial =
    pet.lifecycleStatus === PetLifecycleStatus.DECEASED ||
    pet.lifecycleStatus === PetLifecycleStatus.MEMORIAL;
  const visibleSections = sections.filter((section) => {
    if (section.key === "health" || section.key === "documents") return access.canViewHealth;
    if (section.key === "care") return access.canViewCareProfile;
    if (section.key === "travel") return !isMemorial;
    // Spending is household money: only for a pet in your own household, never one shared with you.
    if (section.key === "expenses") return householdPets.some((p) => p.id === petId);
    return true;
  });
  const lifecycle = lifecyclePresentation(pet.lifecycleStatus, c);
  const base = "/" + locale + "/pets/" + petId;

  return (
    <div className="pet-shell">
      <header className="pet-hero">
        <div className="pet-hero__identity">
          <button
            type="button"
            className="pet-hero__photo-button"
            aria-label={
              pet.photoUrl
                ? locale === "fa"
                  ? `نمایش تصویر بزرگ ${pet.name}`
                  : `View larger photo of ${pet.name}`
                : locale === "fa"
                  ? `تصویر ${pet.name} ثبت نشده`
                  : `No photo set for ${pet.name}`
            }
            disabled={!pet.photoUrl}
            onClick={() => setPhotoOpen(true)}
          >
            <span className="pet-hero__photo">
              <Avatar src={pet.photoUrl} name={pet.name} size="lg" />
            </span>
            {pet.photoUrl ? (
              <span className="pet-hero__photo-hint">{locale === "fa" ? "نمایش تصویر" : "View photo"}</span>
            ) : null}
          </button>
          <div className="min-w-0">
            <div className="pet-hero__title">
              <p className="pet-hero__name">{pet.name}</p>
              <StatusLabel tone={lifecycle.tone}>{lifecycle.label}</StatusLabel>
            </div>
            <p className="pet-hero__meta">
              {speciesLabel(pet, locale)} · {pet.breed ?? c.unknownBreed} ·{" "}
              {formatAge(pet, locale, c.unknownAge)}
            </p>
            <dl className="pet-hero__facts">
              <div>
                <dt>{c.weight}</dt>
                <dd>{formatWeight(pet, locale, c.unknown)}</dd>
              </div>
              {pet.sex && pet.sex !== "UNKNOWN" ? (
                <div>
                  <dt>{locale === "fa" ? "جنسیت" : locale === "en" ? "Sex" : c.sex}</dt>
                  <dd>
                    {pet.sex === "MALE"
                      ? locale === "fa"
                        ? "نر"
                        : locale === "en"
                          ? "Male"
                          : c.male
                      : locale === "fa"
                        ? "ماده"
                        : locale === "en"
                          ? "Female"
                          : c.female}
                  </dd>
                </div>
              ) : null}
              {/* An identifier, not a headline: say that a chip is registered, never print its number here. */}
              {pet.microchipNumber ? (
                <div>
                  <dt>{c.microchip}</dt>
                  <dd>{locale === "fa" ? "ثبت شده" : locale === "en" ? "Registered" : c.registered}</dd>
                </div>
              ) : null}
            </dl>
          </div>
        </div>
        {access.canEditIdentity ? (
          <Link className="pet-hero__edit" href={base + "?edit=identity"}>
            {c.edit}
          </Link>
        ) : null}
      </header>

      {pet.photoUrl ? (
        <Dialog open={photoOpen} onClose={() => setPhotoOpen(false)} title={pet.name}>
          {/* eslint-disable-next-line @next/next/no-img-element -- user-owned pet profile image; shown in an accessible lightbox */}
          <img
            src={pet.photoUrl}
            alt={locale === "fa" ? `تصویر ${pet.name}` : `${pet.name}'s photo`}
            className="pet-hero__photo-expanded"
          />
        </Dialog>
      ) : null}

      {lifecycle.message ? (
        <div className={"my-4 border-s-4 px-4 py-3 text-sm leading-7 " + lifecycle.className} role="status">
          {lifecycle.message}
        </div>
      ) : null}

      <nav className="pet-tabs" aria-label={c.aria}>
        {visibleSections.map((section) => {
          const href = base + section.suffix;
          const active =
            section.key === "health"
              ? (pathname === href || pathname.startsWith(href + "/")) &&
                !pathname.startsWith(base + "/health/documents")
              : section.suffix
                ? pathname === href || pathname.startsWith(href + "/")
                : pathname === base;
          return (
            <Link
              key={section.key}
              href={href}
              aria-current={active ? "page" : undefined}
              className="pet-tabs__link"
            >
              {c[section.key]}
            </Link>
          );
        })}
      </nav>

      <div className="pet-shell__content">{children}</div>
    </div>
  );
}

function lifecyclePresentation(status: PetLifecycleStatus, c: (typeof copy)[RouteLocale]) {
  if (status === PetLifecycleStatus.LOST)
    return {
      label: c.lost,
      message: c.lostMessage,
      tone: "attention" as const,
      className: "border-state-urgent bg-state-urgent/5 text-text-primary",
    };
  if (status === PetLifecycleStatus.TEMPORARILY_TRANSFERRED)
    return {
      label: c.transferred,
      message: c.transferredMessage,
      tone: "neutral" as const,
      className: "border-state-attention bg-state-attention/5 text-text-primary",
    };
  if (status === PetLifecycleStatus.DECEASED)
    return {
      label: c.deceased,
      message: c.memorialMessage,
      tone: "neutral" as const,
      className: "border-[#76638c] bg-surface-subtle text-text-primary",
    };
  if (status === PetLifecycleStatus.MEMORIAL)
    return {
      label: c.memorial,
      message: c.memorialMessage,
      tone: "neutral" as const,
      className: "border-[#76638c] bg-surface-subtle text-text-primary",
    };
  return { label: c.active, message: null, tone: "success" as const, className: "" };
}
