"use client";

import Link from "next/link";
import { useLocale } from "next-intl";
import { ApiError } from "@/lib/api/client";

const PLAN_CODES = new Set(["SUBSCRIPTION_FEATURE_NOT_INCLUDED", "SUBSCRIPTION_ENTITLEMENT_LIMIT_EXCEEDED"]);

/** True when the API refused an action because of the household's plan (a feature it lacks or a limit it reached). */
export function isPlanError(error: unknown): error is ApiError {
  return error instanceof ApiError && PLAN_CODES.has(error.code ?? "");
}

const FEATURE: Record<string, [string, string]> = {
  "care.reminders": ["یادآورهای شخصی و تکرارشونده", "Personal and recurring reminders"],
  "vet.share": ["اشتراک موقت پرونده با دامپزشک", "Time-limited sharing with a vet"],
  "health.documents.max": ["فضای اسناد پزشکی", "Medical document storage"],
  "memories.entries.max": ["تعداد خاطره‌ها", "Memories"],
  "household.members.max": ["اعضای خانواده", "Household members"],
  "health.observations.max": ["مشاهدات سلامت", "Health observations"],
};

/**
 * What a member sees when the server refuses an action because of their plan: what is missing, in
 * their language, and the way to the plans. Functional only — the presentation is Codex's to design.
 */
export function PlanRequiredNote({ error }: { error: ApiError }) {
  const locale = useLocale() === "en" ? "en" : "fa";
  const key = String((error.details as { key?: string } | undefined)?.key ?? "");
  const name = FEATURE[key]?.[locale === "fa" ? 0 : 1];
  const isLimit = error.code === "SUBSCRIPTION_ENTITLEMENT_LIMIT_EXCEEDED";
  const text = locale === "fa"
    ? isLimit ? `به سقف ${name ?? "این امکان"} در طرح فعلی رسیده‌اید.` : `${name ?? "این امکان"} در طرح فعلی شما نیست.`
    : isLimit ? `You've reached your plan's limit for ${name?.toLowerCase() ?? "this"}.` : `${name ?? "This feature"} isn't included in your current plan.`;
  return (
    <p role="alert" className="plan-required" data-key={key}>
      <span>{text}</span>{" "}
      <Link href={`/${locale}/subscription/plans`}>{locale === "fa" ? "مشاهدهٔ طرح‌ها" : "See plans"}</Link>
    </p>
  );
}
