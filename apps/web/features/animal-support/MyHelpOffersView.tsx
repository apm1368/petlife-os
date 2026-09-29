"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { HelpOfferDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { formatDay, localizeDigits } from "@/lib/date/jalali";
import { supportNeedsService } from "@/services/support-needs.service";
import { OFFER_TONE } from "./SupportOfferInbox";

/** A helper's own offers across every listing, with the only action a helper has: cancelling. */
export function MyHelpOffersView() {
  const t = useTranslations("supportNeeds");
  const lang = useLocale() as "fa" | "en";
  const fa = lang === "fa";
  const [offers, setOffers] = useState<HelpOfferDto[] | null>(null);
  const [state, setState] = useState<"ready" | "signIn" | "error">("ready");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setOffers(await supportNeedsService.listMyOffers());
      setState("ready");
    } catch (e) {
      setState(e instanceof ApiError && e.status === 401 ? "signIn" : "error");
    }
  }, []);
  useEffect(() => void load(), [load]);

  if (state === "signIn") return <EmptyState title={fa ? "برای دیدن کمک‌هایتان وارد شوید" : "Sign in to see your help offers"} />;
  if (state === "error") return <ErrorRecovery title={fa ? "بارگیری نشد" : "Could not load"} message="" retryLabel={fa ? "تلاش دوباره" : "Try again"} onRetry={() => void load()} />;
  if (!offers) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{fa ? "کمک‌های من" : "My help"}</h1>
      {offers.length === 0 ? (
        <EmptyState title={fa ? "هنوز پیشنهاد کمکی نداده‌اید" : "You haven't offered help yet"} description={fa ? "نیازهای باز را ببینید و اگر توانستید کمک کنید." : "Browse open needs and help where you can."} />
      ) : (
        <ul className="flex flex-col gap-3">
          {offers.map((o) => (
            <li key={o.id} className="flex flex-col gap-1 rounded-md border border-border-subtle p-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusLabel tone={OFFER_TONE[o.status]}>{t(`offerStatus.${o.status}`)}</StatusLabel>
                <span className="text-metadata text-text-secondary">{t(`category.${o.helpType}`)}{o.quantity !== null ? ` ×${localizeDigits(o.quantity, lang)}` : ""} · {formatDay(o.createdAt.slice(0, 10), lang)}</span>
              </div>
              <p className="text-body">{o.message}</p>
              {o.timing ? <p className="text-metadata text-text-secondary">{fa ? "زمان: " : "Timing: "}{o.timing}</p> : null}
              <div className="flex flex-wrap gap-2">
                <Link className="text-sm underline" href={`/${lang}/animal-support/needs/${o.listingId}`}>{fa ? "مشاهدهٔ درخواست" : "View request"}</Link>
                {o.status === "PENDING" || o.status === "ACCEPTED" || o.status === "IN_PROGRESS" ? (
                  <Button variant="ghost" size="sm" isLoading={busy === o.id} onClick={() => { setBusy(o.id); void supportNeedsService.respondToOffer(o.listingId, o.id, { status: "CANCELLED" as HelpOfferDto["status"] }).then(load).finally(() => setBusy(null)); }}>{fa ? "لغو پیشنهاد" : "Withdraw offer"}</Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
