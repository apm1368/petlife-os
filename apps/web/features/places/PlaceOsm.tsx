"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@petlife/ui";
import type { PetFriendlyPlaceCategory, PetFriendlyPlaceDto, PlaceClaimResultDto } from "@petlife/types";
import { placesService } from "@/services/places.service";
import { ApiError } from "@/lib/api/client";
import { useSessionStore } from "@/stores/session-store";

export const OSM_COPYRIGHT_URL = "https://www.openstreetmap.org/copyright";

/** An OpenStreetMap import that no verified business has taken over yet. */
export const isOsmUnclaimed = (place: Pick<PetFriendlyPlaceDto, "source" | "claimed">) => place.source === "OSM" && !place.claimed;

/** A dialable tel: link from a phone as published (Persian/Arabic digits normalised), or null. */
export function telHref(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[^+0-9]/g, "");
  return digits.replace(/\D/g, "").length >= 5 ? `tel:${digits}` : null;
}

/** Parks and beaches are nobody's business to claim. */
const NOT_CLAIMABLE: PetFriendlyPlaceCategory[] = ["PARK", "DOG_PARK", "BEACH"] as PetFriendlyPlaceCategory[];
export const isClaimable = (place: Pick<PetFriendlyPlaceDto, "category" | "claimed">) => !place.claimed && !NOT_CLAIMABLE.includes(place.category);

/** "© OpenStreetMap contributors", linked to the licence page, wherever OSM data is shown (ODbL). */
export function OsmAttribution({ className }: { className?: string }) {
  const t = useTranslations("places.osm");
  return (
    <p className={className ?? "text-metadata text-text-secondary"}>
      <a href={OSM_COPYRIGHT_URL} target="_blank" rel="noopener noreferrer" className="underline">{t("attribution")}</a>
    </p>
  );
}

/** "Is this your business? Claim it" — files a claim, then says what is left (partner account, KYC, or our review). */
export function PlaceClaimPanel({ place }: { place: PetFriendlyPlaceDto }) {
  const t = useTranslations("places.claim");
  const locale = useLocale();
  const session = useSessionStore((s) => s.status);
  const [claim, setClaim] = useState<PlaceClaimResultDto | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "auth" | "error" | "limit">("idle");

  useEffect(() => {
    if (session !== "authenticated") return;
    let live = true;
    placesService.myClaim(place.id).then((r) => live && setClaim(r.claim), () => undefined);
    return () => {
      live = false;
    };
  }, [place.id, session]);

  async function send() {
    if (session !== "authenticated") return setState("auth");
    setState("sending");
    try {
      setClaim(await placesService.claim(place.id));
      setState("idle");
    } catch (err) {
      setState(err instanceof ApiError && err.status === 401 ? "auth" : err instanceof ApiError && err.details?.reason === "OPEN_CLAIMS_LIMIT" ? "limit" : "error");
    }
  }

  const returnTo = encodeURIComponent(`/${locale}/places/${place.id}`);
  return (
    <section className="split-panel flex flex-col gap-2" aria-labelledby="place-claim-title">
      <h2 id="place-claim-title" className="text-sm font-bold text-text-primary">{t("title")}</h2>
      {claim ? (
        <div role="status" className="flex flex-col gap-2 text-sm">
          <p>{claim.status === "PENDING" && claim.nextStep ? t(`next.${claim.nextStep}`) : t(`status.${claim.status}`)}</p>
          {claim.status === "PENDING" && claim.nextStep === "CREATE_PARTNER_ACCOUNT" ? <Link className="underline" href={`/${locale}/contact`}>{t("goPartner")}</Link> : null}
          {claim.status === "PENDING" && claim.nextStep === "COMPLETE_VERIFICATION" ? <Link className="underline" href={`/${locale}/provider/verification`}>{t("goVerification")}</Link> : null}
          {/* After partner sign-up or KYC, refreshing the claim attaches the verified business staff will check. */}
          {claim.status === "PENDING" && claim.nextStep !== "AWAITING_REVIEW" ? (
            <Button size="sm" variant="ghost" className="w-fit" isLoading={state === "sending"} onClick={() => void send()}>{t("refresh")}</Button>
          ) : null}
          {state === "error" ? <p role="alert" className="text-sm text-state-urgent">{t("failed")}</p> : null}
        </div>
      ) : (
        <>
          <p className="text-sm text-text-secondary">{t("body")}</p>
          {state === "auth" ? <Link className="text-sm underline" href={`/${locale}/welcome?returnTo=${returnTo}`}>{t("signIn")}</Link> : null}
          {state === "error" ? <p role="alert" className="text-sm text-state-urgent">{t("failed")}</p> : null}
          {state === "limit" ? <p role="alert" className="text-sm text-state-urgent">{t("limit")}</p> : null}
          <Button size="sm" variant="secondary" className="w-fit" isLoading={state === "sending"} onClick={() => void send()}>{state === "sending" ? t("sending") : t("button")}</Button>
        </>
      )}
    </section>
  );
}
