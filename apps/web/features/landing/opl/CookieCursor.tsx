"use client";

import { useEffect, useRef } from "react";
import { DOG_SVG } from "./dog-svg";
import { cursorBus, mediaMatches, prefersReducedMotion } from "./cursor-bus";
import { useOplCopy } from "./opl-copy";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/**
 * Cookie, the animated dog that follows the pointer (motion.md): walks behind it, stands beside a hovered control,
 * sits and looks at the visitor after 1.4 s, plays ball after 6.5 s (never in the memorial). Purely decorative.
 */
export function CookieCursor() {
  const copy = useOplCopy().cookie;
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = host.current;
    // Touch-only screens: no cursor to follow, so no Cookie (hidden by opl-touch.css) and no animation loop.
    if (!root || prefersReducedMotion() || mediaMatches("(hover: none) and (pointer: coarse)")) return;
    const ck = root.querySelector<HTMLDivElement>(".opl-ck")!;
    const body = root.querySelector<HTMLDivElement>(".opl-ck__body")!;
    const bubble = root.querySelector<HTMLDivElement>(".opl-ck__bubble")!;
    const dot = root.querySelector<HTMLDivElement>(".opl-ck-dot")!;
    const ball = root.querySelector<HTMLDivElement>(".opl-ck-ball")!;
    const prints = root.querySelector<HTMLDivElement>(".opl-ck-prints")!;
    const dog = body.querySelector<SVGSVGElement>("svg")!;
    const fine = mediaMatches("(hover: hover) and (pointer: fine)");
    const P = { x: fine ? innerWidth / 2 : innerWidth - 110, y: fine ? innerHeight / 2 : innerHeight - 130, last: performance.now(), seen: false, vx: 0, dir: 1, zone: "" };
    const C = { x: fine ? innerWidth / 2 : innerWidth - 90, y: fine ? innerHeight / 2 : innerHeight - 100, lx: 0, ly: 0, side: 1, scale: 1, mode: "" };
    const B = { x: 0, y: 0, fx: 0, fy: 0, tx: 0, ty: 0, t0: 0, dur: 900, on: false };
    let hoverEl: HTMLElement | null = null, face = 1, bowUntil = 0, dogCls = "", raf = 0, shy = false;
    cursorBus.cookieOn = true;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      if (P.seen) { P.vx = P.vx * 0.7 + (e.clientX - P.x) * 0.3; if (P.vx > 1.2) P.dir = 1; else if (P.vx < -1.2) P.dir = -1; }
      P.x = e.clientX; P.y = e.clientY; P.last = performance.now(); P.seen = true;
      cursorBus.pointerX = P.x; cursorBus.pointerY = P.y; cursorBus.pointerSeen = true;
      const t = e.target as Element | null;
      hoverEl = t?.closest<HTMLElement>("a,button,input,select,[role='radio']") ?? null;
      P.zone = t?.closest<HTMLElement>("[data-zone]")?.dataset.zone ?? "";
      // Over a form the member is typing or choosing: Cookie stays out of the way (QA L11: it sat on fields and buttons).
      shy = !!t?.closest("form,fieldset,input,select,textarea,label,[data-ck-shy]");
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      P.dir = e.clientX > C.x ? 1 : -1; P.x = e.clientX; P.y = e.clientY; P.last = performance.now(); P.seen = true;
      P.zone = (e.target as Element | null)?.closest<HTMLElement>("[data-zone]")?.dataset.zone ?? "";
    };
    const onOut = (e: MouseEvent) => { if (!e.relatedTarget) hoverEl = null; };
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerdown", onDown, { passive: true });
    document.addEventListener("mouseout", onOut);
    const kick = (now: number) => {
      if (B.on) bowUntil = now + 520;
      B.fx = B.x; B.fy = B.y;
      const ang = Math.random() * Math.PI * 2, dist = 90 + Math.random() * 140;
      B.tx = clamp(P.x + Math.cos(ang) * dist, 40, innerWidth - 40); B.ty = clamp(P.y + Math.sin(ang) * dist * 0.6, 60, innerHeight - 40);
      B.t0 = now; B.dur = 700 + dist * 2.2;
    };
    const updateBall = (now: number) => {
      if (!B.on) { B.x = C.x - 30; B.y = C.y + 20; kick(now); B.on = true; ball.classList.add("on"); }
      const t = clamp((now - B.t0) / B.dur, 0, 1), e = 1 - Math.pow(1 - t, 2), hop = Math.abs(Math.sin(t * Math.PI * 2)) * (1 - t) * 46;
      B.x = B.fx + (B.tx - B.fx) * e; B.y = B.fy + (B.ty - B.fy) * e - hop;
      ball.style.transform = `translate3d(${B.x.toFixed(1)}px,${B.y.toFixed(1)}px,0) rotate(${(t * 720).toFixed(0)}deg)`;
      if (t >= 1 && Math.hypot(C.x - B.x, C.y - B.y) < 52) kick(now);
    };
    const hideBall = () => { if (B.on) { B.on = false; ball.classList.remove("on"); } };
    const printPaw = (ang: number) => {
      C.side *= -1;
      const fx = clamp(C.x - Math.sin(ang) * 8 * C.side, 10, innerWidth - 24), fy = C.y + 30 + Math.cos(ang) * 8 * C.side;
      const top = prints.getBoundingClientRect().top;
      const el = document.createElement("span");
      el.className = "opl-pp";
      el.style.left = `${fx.toFixed(1)}px`; el.style.top = `${(fy - top).toFixed(1)}px`;
      el.style.setProperty("--r", `${((ang * 180) / Math.PI + 90).toFixed(1)}deg`);
      prints.appendChild(el);
      window.setTimeout(() => el.remove(), 1800);
      while (prints.childElementCount > 44) prints.firstElementChild?.remove();
      C.lx = C.x; C.ly = C.y;
    };
    const frame = (now: number) => {
      const idle = now - P.last, calm = P.zone === "calm";
      let tx = P.x - 50 * P.dir, ty = P.y + 14, mode = "follow", lockCx = 0;
      const lock = fine && !shy ? (hoverEl && root.parentElement?.contains(hoverEl) ? hoverEl : cursorBus.stageHover ? cursorBus.activeWorldNode : null) : null;
      if (lock) {
        const r = lock.getBoundingClientRect();
        if (r.width < 360 && r.height < 180) {
          const fromRight = P.x > r.left + r.width / 2;
          tx = fromRight ? Math.min(r.right + 54, innerWidth - 50) : Math.max(r.left - 54, 50);
          ty = r.top + r.height / 2; mode = "point"; lockCx = r.left + r.width / 2;
        }
      }
      if (mode !== "point" && P.seen && idle > 1400) mode = idle > 6500 && !calm && !shy ? "play" : "look";
      if (!P.seen && !fine) mode = "look";
      if (mode === "look") { tx = P.x + (fine ? 46 : 0); ty = P.y + (fine ? 34 : 0); }
      if (shy && mode !== "play") { tx = P.x + 96 * (P.dir || 1); ty = P.y + 72; }
      if (mode === "play") { updateBall(now); const bd = B.tx - B.fx >= 0 ? 1 : -1; tx = B.x - 42 * bd; ty = B.y + 6; } else hideBall();
      const k = mode === "play" ? 0.085 : calm ? 0.06 : 0.14;
      const ax = (tx - C.x) * k, ay = (ty - C.y) * k;
      C.x += ax; C.y += ay;
      const speed = Math.hypot(ax, ay);
      if (mode === "point") face = lockCx > C.x ? 1 : -1; else if (Math.abs(ax) > 0.9) face = ax > 0 ? 1 : -1;
      C.scale += ((calm ? 0.9 : 1) - C.scale) * 0.12;
      cursorBus.cookieX = C.x; cursorBus.cookieY = C.y;
      ck.style.transform = `translate3d(${C.x.toFixed(1)}px,${C.y.toFixed(1)}px,0) translate(-50%,-50%)`;
      body.style.transform = `scale(${C.scale.toFixed(3)})`;
      let cls = mode === "play" ? (now < bowUntil ? "bow play" : speed > 0.6 ? "run play" : "play")
        : speed > 3.2 && !calm ? "run" : speed > 0.45 ? "walk" : mode === "point" ? "point" : mode === "look" ? "sit look" : "stand";
      if (face < 0) cls += " left";
      if (cls !== dogCls) { dogCls = cls; dog.setAttribute("class", `dog ${cls}`); }
      if (C.mode !== mode) { C.mode = mode; ck.dataset.mode = mode; }
      ck.classList.toggle("shy", shy && mode !== "play");
      if (speed > 0.8 && Math.hypot(C.x - C.lx, C.y - C.ly) > 30) printPaw(Math.atan2(ay, ax));
      let txt = "";
      if (now < cursorBus.sayUntil) txt = cursorBus.sayText;
      else if (mode === "point" && lock?.dataset.ck) txt = lock.dataset.ck;
      else if (mode === "play") txt = copy.play;
      if (txt && bubble.textContent !== txt) bubble.textContent = txt;
      ck.classList.toggle("talk", !!txt);
      dot.style.transform = `translate3d(${P.x.toFixed(1)}px,${P.y.toFixed(1)}px,0)`;
      dot.classList.toggle("hide", !!hoverEl || !P.seen || !fine);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf); cursorBus.cookieOn = false;
      document.removeEventListener("pointermove", onMove); document.removeEventListener("pointerdown", onDown); document.removeEventListener("mouseout", onOut);
    };
  }, [copy.play]);
  return <div ref={host} className="opl-ck-host" aria-hidden="true">
    <div className="opl-ck-prints" />
    <div className="opl-ck"><div className="opl-ck__body" dangerouslySetInnerHTML={{ __html: DOG_SVG }} /><div className="opl-ck__bubble" /></div>
    <div className="opl-ck-dot hide" />
    <div className="opl-ck-ball" />
  </div>;
}
