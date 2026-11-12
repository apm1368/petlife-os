"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ArrowLeft, ArrowRight, HandHeart } from "@petlife/ui";
import { useLanding } from "./LandingShell";
import { useOplCopy } from "./opl-copy";
import { storyCopy } from "../story-copy";
import { KINDNESS_SRC } from "./kindness-art";
import { observeVisible, prefersReducedMotion } from "./cursor-bus";

/** Animal support: the pointer is a warm light that brings colour to a grey illustration. */
export function KindnessLight() {
  const { locale } = useLanding();
  const s = storyCopy[locale], c = useOplCopy().kindness;
  const Arrow = (locale === "fa" || locale === "ar") ? ArrowLeft : ArrowRight;
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const target = { x: 0.56, y: 0.6, hover: false }, cur = { x: 0.56, y: 0.6 };
    const move = (e: PointerEvent) => { const r = el.getBoundingClientRect(); target.hover = true; target.x = (e.clientX - r.left) / r.width; target.y = (e.clientY - r.top) / r.height; };
    const leave = () => { target.hover = false; };
    el.addEventListener("pointermove", move); el.addEventListener("pointerleave", leave);
    if (prefersReducedMotion()) return () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave); };
    let raf = 0, visible = false;
    const tick = (t: number) => {
      const tx = target.hover ? target.x : 0.54 + Math.sin(t * 0.00035) * 0.26, ty = target.hover ? target.y : 0.56 + Math.sin(t * 0.00051 + 1) * 0.18;
      cur.x += (tx - cur.x) * 0.1; cur.y += (ty - cur.y) * 0.1;
      el.style.setProperty("--mx", `${(cur.x * 100).toFixed(2)}%`); el.style.setProperty("--my", `${(cur.y * 100).toFixed(2)}%`);
      if (visible) raf = requestAnimationFrame(tick);
    };
    const stopVisible = observeVisible(el, (v) => { visible = v; cancelAnimationFrame(raf); if (visible) raf = requestAnimationFrame(tick); });
    return () => { stopVisible(); cancelAnimationFrame(raf); el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave); };
  }, []);
  return <section className="opl-sec opl-kind" aria-labelledby="opl-kind-title">
    <div className="opl-wrap opl-kind__grid">
      <div ref={box} className="opl-lightbox">
        {/* eslint-disable-next-line @next/next/no-img-element -- inline vector art from a data URI */}
        <img className="base" src={KINDNESS_SRC} alt={c.alt} width={400} height={300} />
        {/* eslint-disable-next-line @next/next/no-img-element -- the colour layer of the same illustration */}
        <img className="color" src={KINDNESS_SRC} alt="" aria-hidden="true" width={400} height={300} />
        <span className="opl-lightbox__hint">{c.hint}</span>
      </div>
      <div className="opl-kind__copy">
        <p className="opl-eyebrow"><HandHeart size={18} aria-hidden="true" />{s.supportEyebrow}</p>
        <h2 className="opl-h2" id="opl-kind-title">{s.supportTitle}</h2>
        <p className="opl-lede">{s.supportBody}</p>
        <div className="opl-actions">
          <Link className="opl-btn primary" href={`/${locale}/animal-support/needs`}>{s.supportCta}<Arrow size={20} aria-hidden="true" /></Link>
          <Link className="opl-btn line" href={`/${locale}/community`}>{s.communityCta}</Link>
        </div>
      </div>
    </div>
  </section>;
}
