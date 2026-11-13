"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button, CalendarDays, Check, Copy, Sparkles, Ticket } from "@petlife/ui";
import type { MembershipOffersDto } from "@petlife/types";
import { membershipOffersService } from "@/services/membership-offers.service";
import { usePetStore } from "@/stores/pet-store";
import { ApiError } from "@/lib/api/client";
import { formatDay, todayIso } from "@/lib/date/jalali";
import type { RouteLocale } from "@/lib/i18n/config";
import "./membership-offers.css";

export interface MembershipOffersCardProps {
  /** "household" (default): the active household's offers. "account": before any household, e.g. right after sign-up. */
  scope?: "household" | "account";
  /** On the checkout page: pre-fill the gift there instead of linking to it. */
  onApplyGift?: (code: string, percentOff: number) => void;
  /** Called with what the server offered, so a page can reuse it (e.g. pre-apply the gift at checkout). */
  onOffersLoaded?: (offers: MembershipOffersDto) => void;
  /** Called after the free week started, so a page can reload its subscription. */
  onTrialStarted?: () => void;
  /** Reload the offers whenever this changes (e.g. the subscription after a purchase). */
  refreshKey?: string;
  className?: string;
}

/** The Tehran calendar day of an instant, shown in the member's calendar (Jalali for fa). */
function tehranDay(iso: string, locale: RouteLocale) {
  return formatDay(todayIso(new Date(iso)), locale);
}

/**
 * The membership offers card: the free week (one click, no card, nothing charged afterwards) and the first-purchase
 * gift code (copy, apply at checkout). Self-contained: it loads its own data, decides nothing itself (the server says
 * what this member can use), and renders nothing while loading, on an error, or when there is nothing to offer.
 */
export function MembershipOffersCard({ scope = "household", onApplyGift, onOffersLoaded, onTrialStarted, refreshKey, className }: MembershipOffersCardProps) {
  const t = useTranslations("subscription.offers");
  const locale = useLocale() as RouteLocale;
  const householdId = usePetStore((s) => s.householdId);
  const [offers, setOffers] = useState<MembershipOffersDto | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const loaded = useRef(onOffersLoaded);
  loaded.current = onOffersLoaded;

  useEffect(() => {
    let cancelled = false;
    setOffers(null);
    if (scope === "household" && !householdId) return;
    const request = scope === "account" ? membershipOffersService.forAccount() : membershipOffersService.forHousehold(householdId!);
    request
      .then((result) => {
        if (cancelled) return;
        setOffers(result);
        loaded.current?.(result);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [scope, householdId, refreshKey]);

  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  if (!offers) return null;
  const { freeWeek, firstPurchaseGift: gift } = offers;
  const showWeek = freeWeek.status === "AVAILABLE" || freeWeek.status === "ACTIVE" || freeWeek.status === "PHONE_REQUIRED";
  if (!showWeek && !gift) return null;

  const planName = freeWeek.plan ? (locale === "fa" ? freeWeek.plan.nameFa : freeWeek.plan.nameEn) : null;

  async function startFreeWeek() {
    if (!householdId) return;
    setStarting(true);
    setStartError(null);
    try {
      const result = await membershipOffersService.startFreeWeek(householdId);
      setOffers((current) => current && { ...current, freeWeek: { ...current.freeWeek, status: "ACTIVE", canStart: false, trialUsed: true, trialEndsAt: result.subscription.trialEndsAt } });
      onTrialStarted?.();
    } catch (err) {
      setStartError(err instanceof ApiError && err.code === "SUBSCRIPTION_TRIAL_NOT_ELIGIBLE" ? t("freeWeek.notEligible") : t("freeWeek.failed"));
    } finally {
      setStarting(false);
    }
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className={["membership-offers", className].filter(Boolean).join(" ")} aria-label={t("region")}>
      {showWeek ? (
        <div className="membership-offers__week" data-status={freeWeek.status}>
          <p className="membership-offers__eyebrow"><Sparkles size={16} aria-hidden="true" />{t("freeWeek.eyebrow")}</p>
          {freeWeek.status === "ACTIVE" && freeWeek.trialEndsAt ? (
            <>
              <h2 className="membership-offers__title">{t("freeWeek.activeTitle")}</h2>
              <p className="membership-offers__date"><CalendarDays size={18} aria-hidden="true" />{t("freeWeek.activeUntil", { date: tehranDay(freeWeek.trialEndsAt, locale) })}</p>
              <ul className="membership-offers__points">
                <li>{t("freeWeek.points.noCharge")}</li>
                <li>{t("freeWeek.points.reminder")}</li>
              </ul>
            </>
          ) : (
            <>
              <h2 className="membership-offers__title">{planName ? t("freeWeek.title", { days: freeWeek.days, plan: planName }) : t("freeWeek.titleNoPlan", { days: freeWeek.days })}</h2>
              <ul className="membership-offers__points">
                <li>{t("freeWeek.points.noCard")}</li>
                <li>{t("freeWeek.points.noCharge")}</li>
                <li>{t("freeWeek.points.once")}</li>
              </ul>
              {freeWeek.status === "PHONE_REQUIRED" ? (
                <div className="membership-offers__actions">
                  <p className="membership-offers__note">{t("freeWeek.phoneRequired")}</p>
                  <Link className="membership-offers__link" href={`/${locale}/profile/security`}>{t("freeWeek.verifyPhone")}</Link>
                </div>
              ) : scope === "account" ? (
                <p className="membership-offers__note">{t("freeWeek.withFirstPet")}</p>
              ) : freeWeek.canStart ? (
                <div className="membership-offers__actions">
                  <Button onClick={() => void startFreeWeek()} isLoading={starting}>{t("freeWeek.start")}</Button>
                </div>
              ) : (
                <p className="membership-offers__note">{t("freeWeek.ownerOnly")}</p>
              )}
              {startError ? <p className="membership-offers__error" role="alert">{startError}</p> : null}
            </>
          )}
        </div>
      ) : null}

      {gift ? (
        <div className="membership-offers__gift">
          <p className="membership-offers__eyebrow"><Ticket size={16} aria-hidden="true" />{t("gift.eyebrow")}</p>
          <h2 className="membership-offers__title">{t("gift.title", { percent: gift.percentOff })}</h2>
          <div className="membership-offers__code-row">
            <span className="membership-offers__code-label">{t("gift.codeLabel")}</span>
            <code className="membership-offers__code" dir="ltr" translate="no">{gift.code}</code>
            <button type="button" className="membership-offers__copy" onClick={() => void copyCode(gift.code)} aria-label={copied ? t("gift.copied") : t("gift.copy")}>
              {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
              <span>{copied ? t("gift.copied") : t("gift.copy")}</span>
            </button>
            <span className="sr-only" role="status">{copied ? t("gift.copied") : ""}</span>
          </div>
          {gift.expiresOn ? <p className="membership-offers__note">{t("gift.expires", { date: formatDay(gift.expiresOn, locale) })}</p> : null}
          <div className="membership-offers__actions">
            {onApplyGift ? (
              <Button variant="secondary" onClick={() => onApplyGift(gift.code, gift.percentOff)}>{t("gift.apply")}</Button>
            ) : (
              <Link className="membership-offers__link" href={`/${locale}/subscription/plans?gift=${encodeURIComponent(gift.code)}`}>{t("gift.apply")}</Link>
            )}
          </div>
          <p className="membership-offers__terms">{t("gift.terms")}</p>
        </div>
      ) : null}
    </section>
  );
}
