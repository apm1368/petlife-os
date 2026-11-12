"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowLeft, ArrowRight, Bird as BirdIcon, HeartPulse, PawPrint, Plane, ShieldCheck, ShoppingBag, Users } from "@petlife/ui";
import { useLanding, type Species } from "./LandingShell";
import { useOplCopy, withName, worldOrder, worldRoutes, type WorldKey } from "./opl-copy";
import { buildReelScenes } from "./reel-scenes";
import { cursorBus, observeResize, prefersReducedMotion, say } from "./cursor-bus";
import { Bird } from "./Bird";

const ANGLES: Record<WorldKey, number> = { health: -90, daily: -18, travel: 54, safe: 126, together: 198 };
const ICONS = { health: HeartPulse, daily: ShoppingBag, travel: Plane, safe: ShieldCheck, together: Users } as const;
const SCENE_FOR: Record<WorldKey, number> = { health: 1, daily: 4, travel: 6, safe: 7, together: 8 };
const SPECIES: Species[] = ["dog", "cat", "bird", "rabbit", "other"];

/** The five-question orbit: features grouped by the question a visitor actually has, around their pet's record. */
export function WorldOrbit() {
  const { locale, name, setName, species, setSpecies } = useLanding();
  const copy = useOplCopy();
  const c = copy.world;
  const href = (path: string) => `/${locale}${path}`;
  const Arrow = locale === "fa" ? ArrowLeft : ArrowRight;
  const scenes = useMemo(() => buildReelScenes(copy, locale), [copy, locale]);
  const [active, setActive] = useState<WorldKey>("health");
  const [pulse, setPulse] = useState(0);
  const [links, setLinks] = useState<{ key: WorldKey; d: string }[]>([]);
  const [draft, setDraft] = useState(name);
  const stage = useRef<HTMLDivElement>(null);
  const tilt = useRef<HTMLDivElement>(null);
  const nodes = useRef<Partial<Record<WorldKey, HTMLButtonElement | null>>>({});
  const pinned = useRef(false);
  const intent = useRef(0);
  const tiltTarget = useRef({ x: 0, y: 0 });

  const select = useCallback((key: WorldKey) => {
    setActive((current) => { if (current !== key) setPulse((p) => p + 1); return key; });
  }, []);

  useLayoutEffect(() => {
    const draw = () => {
      const el = tilt.current;
      if (!el) return;
      const w = el.clientWidth, h = el.clientHeight;
      setLinks(worldOrder.map((key, i) => {
        const n = nodes.current[key];
        const x = n?.offsetLeft ?? w / 2, y = n?.offsetTop ?? h / 2, cx = w / 2, cy = h / 2;
        const dx = x - cx, dy = y - cy, L = Math.hypot(dx, dy) || 1, off = (i % 2 ? 1 : -1) * L * 0.14;
        return { key, d: `M${cx.toFixed(1)} ${cy.toFixed(1)} Q${((cx + x) / 2 - (dy / L) * off).toFixed(1)} ${((cy + y) / 2 + (dx / L) * off).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}` };
      }));
    };
    draw();
    return tilt.current ? observeResize(tilt.current, draw) : undefined;
  }, []);

  useEffect(() => { cursorBus.activeWorldNode = nodes.current[active] ?? null; }, [active]);

  useEffect(() => {
    const fromHash = () => {
      const match = /^#world-(health|daily|travel|safe|together)$/.exec(window.location.hash);
      if (match) select(match[1] as WorldKey);
    };
    fromHash();
    addEventListener("hashchange", fromHash);
    return () => removeEventListener("hashchange", fromHash);
  }, [select]);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    let raf = 0;
    const cur = { x: 0, y: 0 };
    const loop = () => {
      cur.x += (tiltTarget.current.x - cur.x) * 0.08;
      cur.y += (tiltTarget.current.y - cur.y) * 0.08;
      if (tilt.current) tilt.current.style.transform = `rotateX(${(-cur.y * 10).toFixed(2)}deg) rotateY(${(cur.x * 12).toFixed(2)}deg)`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    e.currentTarget.style.setProperty("--px", `${((x / r.width) * 100).toFixed(1)}%`);
    e.currentTarget.style.setProperty("--py", `${((y / r.height) * 100).toFixed(1)}%`);
    tiltTarget.current = { x: x / r.width - 0.5, y: y / r.height - 0.5 };
    if (pinned.current) return;
    const dx = x - r.width / 2, dy = y - r.height / 2, d = Math.hypot(dx, dy);
    if (d < r.width * 0.12 || d > r.width * 0.54) return;
    const a = Math.atan2(dy, dx);
    let best: WorldKey = "health", bd = Infinity;
    for (const key of worldOrder) {
      const na = (ANGLES[key] * Math.PI) / 180, df = Math.abs(Math.atan2(Math.sin(a - na), Math.cos(a - na)));
      if (df < bd) { bd = df; best = key; }
    }
    window.clearTimeout(intent.current);
    if (best !== active) intent.current = window.setTimeout(() => select(best), 120);
  };

  const world = c.worlds[active];
  const routes = worldRoutes[active];
  const scene = scenes[SCENE_FOR[active]]!;
  const shownName = name || c.defaultName;

  return <section id="park-about" className="opl-sec opl-world" aria-labelledby="opl-world-title">
    <div className="opl-decor" aria-hidden="true">{[["8%", "3%", -30], ["13%", "6%", -20], ["18%", "4%", -35]].map(([t, s, r]) => <PawPrint key={`${t}${s}`} size={22} style={{ top: t, insetInlineStart: s, transform: `rotate(${r}deg)` } as CSSProperties} />)}</div>
    <div className="opl-wrap">
      <header className="opl-head">
        <p className="opl-eyebrow"><PawPrint size={18} aria-hidden="true" />{c.eyebrow}</p>
        <h2 className="opl-h2" id="opl-world-title">{withName(c.title, name)}</h2>
        <p className="opl-lede">{c.lede}</p>
      </header>
      <div className="opl-namehook">
        <label htmlFor="opl-pet-name">{c.nameLabel}</label>
        <input id="opl-pet-name" type="text" maxLength={20} autoComplete="off" placeholder={c.namePlaceholder} value={draft} data-ck={copy.cookie.input}
          onChange={(e) => { setDraft(e.target.value); const v = e.target.value.replace(/\s+/g, " ").trim().slice(0, 20); setName(v); if (v) say(copy.cookie.hello.replace("{name}", v)); }} />
        <div className="opl-species" role="radiogroup" aria-label={c.speciesLabel}>
          {SPECIES.map((sp) => <button key={sp} type="button" role="radio" aria-checked={species === sp} onClick={() => setSpecies(sp)}>{c.species[sp]}</button>)}
        </div>
      </div>
      <div className="opl-world__grid">
        <div ref={stage} className="opl-stage" onPointerEnter={() => { cursorBus.stageHover = true; }} onPointerMove={onMove}
          onPointerLeave={() => { window.clearTimeout(intent.current); pinned.current = false; cursorBus.stageHover = false; tiltTarget.current = { x: 0, y: 0 }; }}>
          <div className="opl-stage__bg" /><div className="opl-ring" /><div className="opl-ring r2" />
          <div ref={tilt} className="opl-tilt" role="group" aria-label={c.worldsLabel}>
            <svg className="opl-links" aria-hidden="true">{links.map((l) => <path key={l.key} className={`opl-link${l.key === active ? " on" : ""}`} d={l.d} />)}</svg>
            <div key={pulse} className="opl-core">
              <span className="opl-core__ic">{species === "bird" ? <BirdIcon size={26} aria-hidden="true" /> : <PawPrint size={26} aria-hidden="true" />}</span>
              <b className="opl-core__name">{shownName}</b>
              <span className="opl-core__sub">{c.coreSub}</span>
            </div>
            {worldOrder.map((key) => {
              const w = c.worlds[key], Icon = ICONS[key];
              return <button key={key} id={`world-${key}`} ref={(el) => { nodes.current[key] = el; }} type="button" className={`opl-node${key === active ? " is-active" : ""}`}
                style={{ "--a": `${ANGLES[key]}deg` } as CSSProperties} aria-pressed={key === active} data-ck={w.ck}
                onClick={() => { select(key); pinned.current = true; }} onFocus={() => select(key)}>
                <span className="opl-node__ic"><Icon size={20} aria-hidden="true" /></span>
                <span className="opl-node__t"><span className="opl-node__q">{w.q}</span><span className="opl-node__n">{w.name}</span></span>
              </button>;
            })}
          </div>
        </div>
        <div className="opl-panel" aria-live="polite">
          <Bird kind="budgie" style={{ top: -40, insetInlineEnd: 40 }} />
          <div key={active} className="opl-panel__media opl-anim" style={{ background: scene.bg }}
            dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 70 360 400" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">${scene.svg}</svg>` }} />
          <div key={`b-${active}`} className="opl-panel__body">
            <p className="opl-panel__q">{world.q}</p>
            <h3 className="opl-panel__t">{world.name}</h3>
            <p className="opl-panel__d">{world.desc}</p>
            <ul className="opl-feats">{world.feats.map((f, i) => <li key={f.n}><Link href={href(routes.feats[i]!)} data-ck={f.n}>
              <span className="opl-feats__n">{f.n}</span><span className="opl-feats__d">{f.d}</span><Arrow size={20} aria-hidden="true" />
            </Link></li>)}</ul>
            <Link className="opl-btn primary" href={href(routes.cta)} data-ck={copy.cookie.go}>{withName(world.cta, name)}<Arrow size={20} aria-hidden="true" /></Link>
          </div>
        </div>
      </div>
    </div>
  </section>;
}
