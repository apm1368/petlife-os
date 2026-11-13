"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { SetPetRequestDto } from "@petlife/types";
import { CircleCheck, Clock, PawPrint, Ruler, Shirt, Sparkles } from "@petlife/ui";
import type { RouteLocale } from "@/lib/i18n/config";
import { formatLocaleNumber } from "@/lib/i18n/format";
import { useSessionStore } from "@/stores/session-store";
import { SetPetBuilder } from "./SetPetBuilder";
import { SetPetRequests } from "./SetPetRequests";
import "./set-pet.css";

const HOW_STEPS = ["shirts", "pet", "colour", "zones", "designs", "review"] as const;
const FACTS = [
  { key: "print", Icon: Shirt },
  { key: "sizing", Icon: Ruler },
  { key: "timing", Icon: Clock },
  { key: "price", Icon: Sparkles },
] as const;

/**
 * /set-pet — «ست پت» (owner, 2026-11-13): matching custom-printed shirts for a member and their pet. First a plain
 * explanation (what it is, the steps, what gets printed, sizing, timing, and that it is an order request priced by
 * staff); then the builder, open to everyone (sign-in only to send), and a member's requests with quotes.
 */
export function SetPetView({ locale }: { locale: RouteLocale }) {
  const t = useTranslations("setPet.page");
  const tb = useTranslations("setPet.builder");
  const status = useSessionStore((s) => s.status);
  const signedIn = useSessionStore((s) => s.status === "authenticated" && !!s.user);
  const [sent, setSent] = useState<SetPetRequestDto | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const returnTo = encodeURIComponent(`/${locale}/set-pet#setpet-builder`);

  return (
    <div className="setpet">
      <header className="setpet-hero">
        <p className="setpet-hero__eyebrow"><PawPrint size={16} aria-hidden="true" />{t("eyebrow")}</p>
        <h1>{t("title")}</h1>
        <p className="setpet-hero__lede">{t("lede")}</p>
        <a className="opl-btn primary" href="#setpet-builder">{t("start")}</a>
      </header>

      <section className="setpet-how" aria-labelledby="setpet-how-title">
        <h2 id="setpet-how-title">{t("howTitle")}</h2>
        <ol>
          {HOW_STEPS.map((step, i) => (
            <li key={step}>
              <span className="setpet-how__n" aria-hidden="true">{formatLocaleNumber(i + 1, locale)}</span>
              <strong>{tb(`steps.${step}`)}</strong>
              <span>{t(`how.${step}`)}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="setpet-facts" aria-label={t("factsLabel")}>
        {FACTS.map(({ key, Icon }) => (
          <article key={key}>
            <span className="setpet-facts__icon" aria-hidden="true"><Icon size={20} /></span>
            <h3>{t(`facts.${key}.title`)}</h3>
            <p>{t(`facts.${key}.body`)}</p>
          </article>
        ))}
      </section>

      <section id="setpet-builder" className="setpet-build" aria-labelledby="setpet-build-title">
        <h2 id="setpet-build-title">{t("buildTitle")}</h2>
        {sent ? (
          <div className="setpet-done" role="status">
            <CircleCheck size={28} aria-hidden="true" />
            <h3>{t("done.title", { reference: sent.reference })}</h3>
            <p>{t("done.body")}</p>
            <button type="button" className="opl-btn soft" onClick={() => setSent(null)}>{t("done.another")}</button>
          </div>
        ) : status === "idle" || status === "loading" ? (
          <p className="setpet-state" role="status">{tb("loading")}</p>
        ) : (
          <>
            {/* Owner, #368 P4: anyone can build; signing in is needed only to send. */}
            {signedIn ? null : (
              <div className="setpet-signin">
                <p>{t("signIn.body")}</p>
                <div className="setpet-signin__actions">
                  <Link className="opl-btn soft sm" href={`/${locale}/welcome?returnTo=${returnTo}`}>{t("signIn.cta")}</Link>
                  <Link className="opl-btn line sm" href={`/${locale}/register?returnTo=${returnTo}`}>{t("signIn.join")}</Link>
                </div>
              </div>
            )}
            <SetPetBuilder signedIn={signedIn} onSubmitted={(request) => { setSent(request); setRefreshKey((k) => k + 1); }} />
          </>
        )}
      </section>

      {signedIn ? (
        <section className="setpet-mine" aria-labelledby="setpet-mine-title">
          <h2 id="setpet-mine-title">{t("mineTitle")}</h2>
          <SetPetRequests refreshKey={refreshKey} highlightId={sent?.id} />
        </section>
      ) : null}
    </div>
  );
}
