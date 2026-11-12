"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, MapPin } from "@petlife/ui";
import { useLanding } from "./LandingShell";
import { oplCopy, withName } from "./opl-copy";
import { Bird } from "./Bird";

export function LostStrip() {
  const { locale, name } = useLanding();
  const c = oplCopy[locale].lost;
  const Arrow = locale === "fa" ? ArrowLeft : ArrowRight;
  return <section className="opl-lost" aria-labelledby="opl-lost-title">
    <div className="opl-wrap opl-lost__in">
      <span className="opl-lost__ic"><Bird kind="lovebird" style={{ top: -40, insetInlineStart: 6 }} /><MapPin size={28} aria-hidden="true" /></span>
      <div className="opl-lost__t"><h2 id="opl-lost-title">{c.title}</h2><p>{withName(c.body, name)}</p></div>
      <Link className="opl-btn sun" href={`/${locale}/lost-pets`}>{c.cta}<Arrow size={20} aria-hidden="true" /></Link>
    </div>
  </section>;
}
