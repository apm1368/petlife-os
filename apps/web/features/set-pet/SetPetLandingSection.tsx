"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { SetPetZone } from "@petlife/types";
import { PawPrint, Play } from "@petlife/ui";
import type { RouteLocale } from "@/lib/i18n/config";
import { GarmentMockups } from "./GarmentMockups";
import { setPetReel } from "./set-pet-reel";
import "./set-pet.css";

const SAMPLE_ZONES: ReadonlySet<SetPetZone> = new Set<SetPetZone>(["FRONT_CENTER", "PET_BACK"]);
const NO_DESIGNS = new Map();

/**
 * «ست پت» on the landing page, right below the hero (owner, 2026-11-13; the hero itself is untouched): what it is,
 * three short lines, the way in (/set-pet), and X7's reel. The reel is click-to-play (poster first, nothing
 * downloaded until asked, which spares mobile data); until it is rendered, the matching shirts mockup stands in.
 */
export function SetPetLandingSection() {
  const t = useTranslations("setPet.landing");
  const locale = useLocale() as RouteLocale;
  const reel = setPetReel(locale);
  const [playing, setPlaying] = useState(false);
  const [side, setSide] = useState<"front" | "back">("front");

  return (
    <section id="set-pet" className="opl-sec setpet-landing" aria-labelledby="setpet-landing-title">
      <div className="opl-wrap setpet-landing__in">
      <div className="setpet-landing__copy">
        <p className="opl-eyebrow"><PawPrint size={16} aria-hidden="true" />{t("eyebrow")}</p>
        <h2 id="setpet-landing-title" className="opl-h2">{t("title")}</h2>
        <p className="setpet-landing__lede">{t("lede")}</p>
        <ul>
          <li>{t("line1")}</li>
          <li>{t("line2")}</li>
          <li>{t("line3")}</li>
        </ul>
        <Link className="opl-btn primary" href={`/${locale}/set-pet`}>{t("cta")}</Link>
      </div>
      <div className="setpet-landing__media">
        {reel ? (
          playing ? (
            <video className="setpet-landing__video" src={reel.video} poster={reel.poster} width={reel.width} height={reel.height} controls autoPlay muted playsInline preload="auto" aria-label={t("videoLabel")} />
          ) : (
            <button type="button" className="setpet-landing__poster" onClick={() => setPlaying(true)} aria-label={t("play")}>
              {/* eslint-disable-next-line @next/next/no-img-element -- poster from our CMS media store */}
              <img src={reel.poster} alt="" width={reel.width} height={reel.height} loading="lazy" />
              <span className="setpet-landing__play" aria-hidden="true"><Play size={28} /></span>
            </button>
          )
        ) : (
          <GarmentMockups humanSize="M" petSize="M" colour="white" side={side} onSideChange={setSide} zones={SAMPLE_ZONES} placements={{}} designs={NO_DESIGNS} />
        )}
      </div>
      </div>
    </section>
  );
}
