"use client";

import { useEffect, useRef, useState } from "react";
import { PawPrint } from "@petlife/ui";
import { useLanding } from "./LandingShell";
import { useOplCopy } from "./opl-copy";
import { storyCopy } from "../story-copy";
import { formatLocaleNumber } from "@/lib/i18n/format";
import { observeResize, prefersReducedMotion } from "./cursor-bus";

const AT = [0.18, 0.5, 0.82];

/** The three real signup steps; paw prints walk along a path as the visitor scrolls and light each step. */
export function PathSteps() {
  const { locale, name, species } = useLanding();
  const s = storyCopy[locale], c = useOplCopy();
  const section = useRef<HTMLElement>(null);
  const trail = useRef<HTMLDivElement>(null);
  const [paws, setPaws] = useState<{ x: number; y: number; r: number; t: number }[]>([]);
  const [p, setP] = useState(1);
  useEffect(() => {
    const build = () => {
      const el = trail.current;
      if (!el) return;
      const w = el.clientWidth, h = el.clientHeight, n = Math.max(9, Math.round(w / 50)), A = h * 0.28, k = Math.PI * 2.2;
      const dirX = locale === "fa" ? -1 : 1;
      setPaws(Array.from({ length: n }, (_, i) => {
        const t = i / (n - 1), x = locale === "fa" ? w * (0.97 - 0.94 * t) : w * (0.03 + 0.94 * t), y = h / 2 + Math.sin(t * k) * A;
        const hd = Math.atan2(A * k * Math.cos(t * k), dirX * 0.94 * w), side = i % 2 ? 1 : -1;
        return { x: x - Math.sin(hd) * 8 * side, y: y + Math.cos(hd) * 8 * side, r: (hd * 180) / Math.PI + 90, t };
      }));
    };
    build();
    const stopResize = trail.current ? observeResize(trail.current, build) : () => undefined;
    if (prefersReducedMotion()) return stopResize;
    const onScroll = () => {
      const r = section.current?.getBoundingClientRect();
      if (r) setP(Math.max(0, Math.min(1, (innerHeight * 0.85 - r.top) / (r.height * 0.75))));
    };
    onScroll();
    addEventListener("scroll", onScroll, { passive: true });
    return () => { stopResize(); removeEventListener("scroll", onScroll); };
  }, [locale]);
  const frags = [
    <div key="a" className="opl-frag"><div className="opl-frag__row"><span>{c.path.name}</span><b>{name || c.world.defaultName}</b></div><div className="opl-frag__row"><span>{c.path.type}</span><b>{c.world.species[species]}</b></div><div className="opl-frag__row"><span>{c.path.photo}</span><b className="ok">{c.path.added}</b></div><small className="opl-tag">{c.path.sample}</small></div>,
    <div key="b" className="opl-frag"><div className="opl-fchips">{c.path.chips.map((chip, i) => <span key={chip} className={i === 0 ? "on" : undefined}>{chip}</span>)}</div><small className="opl-tag">{c.path.sample}</small></div>,
    <div key="c" className="opl-frag"><div className="opl-fline">{c.path.timeline.map((label, i) => <div key={label} className={i === 0 ? "done" : i === 1 ? "now" : undefined}><i />{label}</div>)}</div><small className="opl-tag">{c.path.sample}</small></div>,
  ];
  return <section ref={section} className="opl-sec opl-path" aria-labelledby="opl-path-title">
    <div className="opl-wrap">
      <header className="opl-head">
        <p className="opl-eyebrow"><PawPrint size={18} aria-hidden="true" />{s.howEyebrow}</p>
        <h2 className="opl-h2" id="opl-path-title">{s.howTitle}</h2>
      </header>
      <div ref={trail} className="opl-trail" aria-hidden="true">{paws.map((paw, i) => <PawPrint key={i} size={22} className={`opl-tp${p >= paw.t * 0.92 ? " on" : ""}`} style={{ left: paw.x, top: paw.y, ["--r" as string]: `${paw.r.toFixed(1)}deg` }} />)}</div>
      <ol className="opl-steps">{s.steps.map((step, i) => <li key={step.title} className={`opl-step${p >= AT[i]! ? " lit" : ""}`}>
        <span className="opl-step__n" aria-hidden="true">{formatLocaleNumber(i + 1, locale)}</span>
        <h3>{step.title}</h3><p>{step.body}</p>{frags[i]}
      </li>)}</ol>
    </div>
  </section>;
}
