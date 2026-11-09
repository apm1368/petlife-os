"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import type { RouteLocale } from "@/lib/i18n/config";
import { ApiError } from "@/lib/api/client";

const PLAN_CODES = new Set(["SUBSCRIPTION_FEATURE_NOT_INCLUDED", "SUBSCRIPTION_ENTITLEMENT_LIMIT_EXCEEDED"]);

/** True when the API refused an action because of the household's plan (a feature it lacks or a limit it reached). */
export function isPlanError(error: unknown): error is ApiError {
  return error instanceof ApiError && PLAN_CODES.has(error.code ?? "");
}

const FEATURE: Record<string, Record<RouteLocale, string>> = {
  "care.reminders": { fa: "یادآورهای شخصی و تکرارشونده", en: "Personal and recurring reminders", de: "Persönliche und wiederkehrende Erinnerungen", es: "Recordatorios personales y recurrentes" },
  "vet.share": { fa: "اشتراک موقت پرونده با دامپزشک", en: "Time-limited sharing with a vet", de: "Zeitlich begrenzte Freigabe für eine Tierarztpraxis", es: "Acceso temporal para una clínica veterinaria" },
  "health.documents.max": { fa: "فضای اسناد پزشکی", en: "Medical document storage", de: "Speicherplatz für medizinische Dokumente", es: "Almacenamiento de documentos médicos" },
  "memories.entries.max": { fa: "تعداد خاطره‌ها", en: "Memories", de: "Erinnerungen", es: "Recuerdos" },
  "household.members.max": { fa: "اعضای خانواده", en: "Household members", de: "Haushaltsmitglieder", es: "Miembros del hogar" },
  "health.observations.max": { fa: "مشاهدات سلامت", en: "Health observations", de: "Gesundheitsbeobachtungen", es: "Observaciones de salud" },
};

/**
 * What a member sees when the server refuses an action because of their plan: what is missing, in
 * their language, and the way to the plans. Functional only — the presentation is Codex's to design.
 */
export function PlanRequiredNote({ error }: { error: ApiError }) {
  const locale = useLocale() as RouteLocale;
  const key = String((error.details as { key?: string } | undefined)?.key ?? "");
  const name = FEATURE[key]?.[locale];
  const isLimit = error.code === "SUBSCRIPTION_ENTITLEMENT_LIMIT_EXCEEDED";
  const fallback = {
    fa: isLimit ? `به سقف ${name ?? "این امکان"} در طرح فعلی رسیده‌اید.` : `${name ?? "این امکان"} در طرح فعلی شما نیست.`,
    en: isLimit ? `You've reached your plan's limit for ${name?.toLowerCase() ?? "this feature"}.` : `${name ?? "This feature"} isn't included in your current plan.`,
    de: isLimit ? `Du hast das Limit deines Tarifs für ${name ?? "diese Funktion"} erreicht.` : `${name ?? "Diese Funktion"} ist in deinem aktuellen Tarif nicht enthalten.`,
    es: isLimit ? `Has alcanzado el límite de tu plan para ${name ?? "esta función"}.` : `${name ?? "Esta función"} no está incluida en tu plan actual.`,
  }[locale];
  const text = fallback;
  return (
    <p role="alert" className="plan-required" data-key={key}>
      <span>{text}</span>{" "}
      <Link href={`/${locale}/subscription/plans`}>{({ fa: "مشاهدهٔ طرح‌ها", en: "See plans", de: "Tarife ansehen", es: "Ver planes" })[locale]}</Link>
    </p>
  );
}
