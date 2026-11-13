"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { SetPetRequestDto } from "@petlife/types";
import { CircleCheck, Clock, PawPrint, Ruler, Shirt, Sparkles } from "@petlife/ui";
import type { RouteLocale } from "@/lib/i18n/config";
import { formatLocaleNumber } from "@/lib/i18n/format";
import { useSessionStore } from "@/stores/session-store";
import { setPetService } from "@/services/set-pet.service";
import { SetPetBuilder } from "./SetPetBuilder";
import { SetPetOrders } from "./SetPetOrders";
import { readSnapshot, type BuilderSnapshot } from "./builder-state";
import "./set-pet.css";

const HOW_STEPS = ["build", "proof", "pay", "make", "ship"] as const;
const FACTS = [
  { key: "print", Icon: Shirt },
  { key: "sizing", Icon: Ruler },
  { key: "timing", Icon: Clock },
  { key: "price", Icon: Sparkles },
] as const;

/**
 * /set-pet — «ست پت» (owner's #368 answers): matching custom-printed outfits for a member and their pets. A plain
 * explanation (the steps, what gets printed, sizing, timing, the fixed price and proof-then-pay), then the builder,
 * open to everyone (sign-in only to send), and the member's own orders. `?edit=<id>` opens a sent order for changes
 * (P39); `?draft=1` opens the draft a one-click reorder made (P40).
 */
export function SetPetView({ locale }: { locale: RouteLocale }) {
  const t = useTranslations("setPet.page");
  const tb = useTranslations("setPet.builder");
  const status = useSessionStore((s) => s.status);
  const signedIn = useSessionStore((s) => s.status === "authenticated" && !!s.user);
  const [sent, setSent] = useState<{ order: SetPetRequestDto; edited: boolean } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [mode, setMode] = useState<{ edit: SetPetRequestDto | null; initial: BuilderSnapshot | null; ready: boolean }>({ edit: null, initial: null, ready: false });
  const [builderKey, setBuilderKey] = useState(0);
  const returnTo = encodeURIComponent(`/${locale}/set-pet#setpet-builder`);

  // Read ?edit / ?draft once the session is known (they need the member's own order or draft).
  useEffect(() => {
    if (status === "idle" || status === "loading") return;
    const params = new URLSearchParams(window.location.search);
    const editId = params.get("edit");
    if (signedIn && editId && /^[0-9a-f-]{36}$/i.test(editId)) {
      setPetService.get(editId).then((order) => setMode({ edit: order.canEdit ? order : null, initial: null, ready: true })).catch(() => setMode({ edit: null, initial: null, ready: true }));
      return;
    }
    if (signedIn && params.get("draft") === "1") {
      setPetService.draft().then(({ draft }) => setMode({ edit: null, initial: draft ? readSnapshot(draft.data) : null, ready: true })).catch(() => setMode({ edit: null, initial: null, ready: true }));
      return;
    }
    setMode({ edit: null, initial: null, ready: true });
  }, [status, signedIn]);

  function startAnother() {
    setSent(null);
    setMode({ edit: null, initial: null, ready: true });
    setBuilderKey((k) => k + 1);
    window.history.replaceState(null, "", `/${locale}/set-pet#setpet-builder`);
  }

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
              <strong>{t(`how.${step}.title`)}</strong>
              <span>{t(`how.${step}.body`)}</span>
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
        <h2 id="setpet-build-title">{mode.edit ? t("editTitle", { reference: mode.edit.reference }) : t("buildTitle")}</h2>
        {sent ? (
          <div className="setpet-done" role="status">
            <CircleCheck size={28} aria-hidden="true" />
            <h3>{sent.edited ? t("done.editedTitle", { reference: sent.order.reference }) : t("done.title", { reference: sent.order.reference })}</h3>
            <p>{t("done.body")}</p>
            <div className="setpet-signin__actions">
              <Link className="opl-btn soft sm" href={`/${locale}/orders/set-pet/${sent.order.id}`}>{t("done.view")}</Link>
              <button type="button" className="opl-btn line sm" onClick={startAnother}>{t("done.another")}</button>
            </div>
          </div>
        ) : status === "idle" || status === "loading" || !mode.ready ? (
          <p className="setpet-state" role="status">{tb("loading")}</p>
        ) : (
          <>
            {/* Owner P4: anyone can build; signing in is needed only to send. */}
            {signedIn ? null : (
              <div className="setpet-signin">
                <p>{t("signIn.body")}</p>
                <div className="setpet-signin__actions">
                  <Link className="opl-btn soft sm" href={`/${locale}/welcome?returnTo=${returnTo}`}>{t("signIn.cta")}</Link>
                  <Link className="opl-btn line sm" href={`/${locale}/register?returnTo=${returnTo}`}>{t("signIn.join")}</Link>
                </div>
              </div>
            )}
            <SetPetBuilder
              key={`${builderKey}-${mode.edit?.id ?? ""}-${mode.initial ? "d" : ""}`}
              signedIn={signedIn}
              editOrder={mode.edit}
              initial={mode.initial}
              onSubmitted={(order, edited) => {
                setSent({ order, edited });
                setRefreshKey((k) => k + 1);
              }}
            />
          </>
        )}
      </section>

      {signedIn ? (
        <section className="setpet-mine" aria-labelledby="setpet-mine-title">
          <h2 id="setpet-mine-title">{t("mineTitle")}</h2>
          <SetPetOrders refreshKey={refreshKey} />
        </section>
      ) : null}
    </div>
  );
}
