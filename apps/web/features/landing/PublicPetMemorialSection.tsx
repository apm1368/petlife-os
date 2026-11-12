"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { EmptyState, ErrorRecovery, Heart, Plus, Skeleton } from "@petlife/ui";
import { memoriesService, type PublicPetMemorialDto } from "@/services/memories.service";
import { isRouteLocale } from "@/lib/i18n/config";
import { fillVars, useOplCopy } from "./opl/opl-copy";
import { observeResize, observeVisible, prefersReducedMotion } from "./opl/cursor-bus";

const CANDLES_KEY = "opl-candles";

/**
 * Public memorials at twilight, in Persian arches (pattern-2026-11): only owner-consented, admin-approved names and
 * photos. A candle lit here stays on this device only; nothing is counted or sent.
 */
export function PublicPetMemorialSection() {
  const t = useTranslations("landing.publicMemorial");
  const tc = useTranslations("common");
  const raw = useLocale();
  const locale = isRouteLocale(raw) ? raw : "en";
  const c = useOplCopy().memorial;
  const [items, setItems] = useState<PublicPetMemorialDto[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [lit, setLit] = useState<Set<string>>(new Set());
  const sky = useRef<HTMLCanvasElement>(null);
  const load = useCallback(async () => {
    setFailed(false);
    try { setItems(await memoriesService.listPublicMemorials()); } catch { setFailed(true); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    try { setLit(new Set(JSON.parse(window.localStorage.getItem(CANDLES_KEY) ?? "[]") as string[])); } catch { setLit(new Set()); }
  }, []);
  const toggle = (id: string) => setLit((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    try { window.localStorage.setItem(CANDLES_KEY, JSON.stringify([...next])); } catch { /* storage may be blocked */ }
    return next;
  });
  useEffect(() => {
    const cv = sky.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const reduce = prefersReducedMotion();
    let W = 0, H = 0, raf = 0, visible = false;
    let motes: { x: number; y: number; r: number; v: number; ph: number; star: boolean }[] = [];
    const size = () => {
      const r = cv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
      W = r.width; H = r.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      motes = Array.from({ length: Math.round(Math.max(24, Math.min(90, W / 18))) }, (_, i) => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.7 + 0.6, v: Math.random() * 0.22 + 0.06, ph: Math.random() * 6.28, star: i % 3 === 0 }));
      draw(0);
    };
    const draw = (t: number) => {
      ctx.clearRect(0, 0, W, H);
      for (const m of motes) {
        if (!reduce && !m.star) { m.y -= m.v; m.x += Math.sin(t * 0.0006 + m.ph) * 0.15; if (m.y < -10) { m.y = H + 10; m.x = Math.random() * W; } }
        const a = m.star ? 0.25 + 0.25 * Math.sin(t * 0.0012 + m.ph) : 0.35 + 0.4 * Math.sin(t * 0.002 + m.ph);
        ctx.beginPath(); ctx.fillStyle = m.star ? `rgba(244,238,228,${a.toFixed(3)})` : `rgba(255,201,120,${a.toFixed(3)})`;
        ctx.arc(m.x, m.y, m.star ? m.r * 0.7 : m.r, 0, Math.PI * 2); ctx.fill();
      }
    };
    const loop = (t: number) => { draw(t); if (visible) raf = requestAnimationFrame(loop); };
    const stopResize = observeResize(cv, size);
    const stopVisible = observeVisible(cv, (v) => { visible = v && !reduce; cancelAnimationFrame(raf); if (visible) raf = requestAnimationFrame(loop); });
    size();
    return () => { stopResize(); stopVisible(); cancelAnimationFrame(raf); };
  }, []);

  return <section className="opl-sec opl-memory" data-zone="calm" aria-labelledby="park-memorial-title">
    <canvas ref={sky} className="opl-sky" aria-hidden="true" />
    <div className="opl-moon" aria-hidden="true" />
    <div className="opl-wrap">
      <header className="opl-head center">
        <p className="opl-eyebrow"><Heart size={18} aria-hidden="true" />{t("eyebrow")}</p>
        <h2 className="opl-h2" id="park-memorial-title">{t("title")}</h2>
        <p className="opl-lede">{t("description")}</p>
      </header>
      {failed ? <ErrorRecovery title={t("title")} message={t("loadError")} retryLabel={tc("retry")} onRetry={() => void load()} /> : null}
      {!failed && items === null ? <Skeleton className="h-64 w-full" aria-label={tc("loading")} /> : null}
      {!failed && items?.length === 0 ? <EmptyState title={t("empty")} /> : null}
      {!failed && items ? <div className="opl-arches">
        {items.slice(0, 8).map((item) => {
          const on = lit.has(item.id);
          return <figure key={item.id} className={`opl-arch${on ? " lit" : ""}`}>
            <div className="opl-arch__frame"><Image unoptimized src={item.imageUrl} alt={t("imageAlt", { name: item.name })} width={360} height={516} loading="lazy" /></div>
            <figcaption>{item.name}</figcaption>
            <button type="button" className="opl-candle" aria-pressed={on} aria-label={fillVars(on ? c.putOut : c.lightFor, { name: item.name })} onClick={() => toggle(item.id)}>
              <span className="opl-candle__body"><span className="opl-candle__flame" /></span><span>{on ? c.candleLit : c.lightCandle}</span>
            </button>
          </figure>;
        })}
        <figure className="opl-arch opl-arch--new">
          <Link className="opl-arch__frame" href={`/${locale}/pets`}><span className="opl-arch__plus"><Plus size={22} aria-hidden="true" /></span><span>{c.newArch}</span></Link>
          <figcaption>{c.newArchCaption}</figcaption>
        </figure>
      </div> : null}
      <div className="opl-memory__cta"><p>{c.ctaBody}</p><Link className="opl-btn glow" href={`/${locale}/pets`}>{c.cta}</Link></div>
    </div>
  </section>;
}
