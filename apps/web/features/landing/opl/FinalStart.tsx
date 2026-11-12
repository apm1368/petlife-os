"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, PawPrint } from "@petlife/ui";
import { useLanding } from "./LandingShell";
import { useOplCopy, withName } from "./opl-copy";
import { storyCopy } from "../story-copy";
import { observeResize, observeVisible, prefersReducedMotion } from "./cursor-bus";

/** The closing call: a field of paw prints that all point at signup and turn, wave-like, toward the pointer. */
export function FinalStart() {
  const { locale, name } = useLanding();
  const s = storyCopy[locale], c = useOplCopy().final;
  const Arrow = locale === "fa" ? ArrowLeft : ArrowRight;
  const canvas = useRef<HTMLCanvasElement>(null);
  const cta = useRef<HTMLAnchorElement>(null);
  const [hot, setHot] = useState(false);
  const hotRef = useRef(false);
  hotRef.current = hot;
  useEffect(() => {
    const cv = canvas.current, button = cta.current;
    if (!cv || !button) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const reduce = prefersReducedMotion();
    let W = 0, H = 0, paws: { x: number; y: number; a: number }[] = [], ptr: { x: number; y: number } | null = null, raf = 0, visible = false;
    let near = "#1F5A3D", far = "#DED2BF";
    const colours = () => { const cs = getComputedStyle(cv); near = cs.getPropertyValue("--opl-forest").trim() || near; far = cs.getPropertyValue("--opl-line-2").trim() || far; };
    const size = () => {
      const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
      W = r.width; H = r.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const gap = W < 600 ? 40 : 48; paws = [];
      for (let y = gap / 2; y < H; y += gap) for (let x = gap / 2; x < W; x += gap) {
        const j = Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1, j2 = Math.abs(Math.sin(x * 39.3 + y * 11.1) * 9631.7) % 1;
        paws.push({ x: x + (j - 0.5) * 16, y: y + (j2 - 0.5) * 16, a: j * 6.28 });
      }
      colours(); draw(performance.now(), true);
    };
    const shape = () => {
      ctx.beginPath(); ctx.ellipse(0, 3.4, 5, 4.2, 0, 0, Math.PI * 2);
      for (const [x, y, rx, ry] of [[-5.8, -1.9, 1.9, 2.4], [-2.4, -5.2, 1.9, 2.5], [2.4, -5.2, 1.9, 2.5], [5.8, -1.9, 1.9, 2.4]] as const) { ctx.moveTo(x + rx, y); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); }
      ctx.fill();
    };
    const draw = (t: number, instant: boolean) => {
      ctx.clearRect(0, 0, W, H);
      const b = button.getBoundingClientRect(), c0 = cv.getBoundingClientRect();
      const T = ptr ?? { x: b.left + b.width / 2 - c0.left, y: b.top + b.height / 2 - c0.top };
      for (const p of paws) {
        const dx = T.x - p.x, dy = T.y - p.y, d = Math.hypot(dx, dy), ta = Math.atan2(dy, dx) + Math.PI / 2;
        const diff = Math.atan2(Math.sin(ta - p.a), Math.cos(ta - p.a)); p.a += diff * (instant || reduce ? 1 : 0.035 + 0.22 * Math.exp(-d / 420));
        const n = Math.exp(-(d * d) / (2 * 170 * 170)), pulse = hotRef.current && !reduce ? 0.18 * Math.max(0, Math.sin(t * 0.008 - d * 0.025)) : 0, sc = 0.7 + 0.6 * n + pulse;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.scale(sc, sc); ctx.globalAlpha = 0.22 + 0.6 * n; ctx.fillStyle = n > 0.3 ? near : far; shape(); ctx.restore();
      }
      ctx.globalAlpha = 1;
    };
    const loop = (t: number) => { draw(t, false); if (visible) raf = requestAnimationFrame(loop); };
    const section = cv.parentElement!;
    const move = (e: PointerEvent) => { const r = cv.getBoundingClientRect(); ptr = { x: e.clientX - r.left, y: e.clientY - r.top }; if (reduce) draw(0, true); };
    const leave = () => { ptr = null; if (reduce) draw(0, true); };
    section.addEventListener("pointermove", move); section.addEventListener("pointerleave", leave);
    const stopResize = observeResize(cv, size);
    const stopVisible = observeVisible(cv, (v) => { visible = v && !reduce; cancelAnimationFrame(raf); if (visible) raf = requestAnimationFrame(loop); });
    size();
    const theme = new MutationObserver(() => { colours(); draw(0, true); });
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => { stopResize(); stopVisible(); theme.disconnect(); cancelAnimationFrame(raf); section.removeEventListener("pointermove", move); section.removeEventListener("pointerleave", leave); };
  }, []);
  return <section id="opl-start" className="opl-final" aria-labelledby="opl-final-title">
    <canvas ref={canvas} aria-hidden="true" />
    <div className="opl-wrap opl-final__in">
      <span className="opl-final__badge"><PawPrint size={34} aria-hidden="true" /></span>
      <h2 className="opl-h2" id="opl-final-title">{withName(c.title, name)}</h2>
      <p className="opl-lede">{withName(c.body, name)}</p>
      <div className="opl-actions">
        <Link ref={cta} className="opl-btn primary lg" href={`/${locale}/register`} onPointerEnter={() => setHot(true)} onPointerLeave={() => setHot(false)} data-ck={useOplCopy().cookie.go}>{s.join}<Arrow size={20} aria-hidden="true" /></Link>
        <Link className="opl-btn line lg" href={`/${locale}/auth`}>{s.login}</Link>
      </div>
    </div>
  </section>;
}
