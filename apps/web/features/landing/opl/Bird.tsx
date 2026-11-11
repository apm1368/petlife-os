"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { birdInner, type BirdKind } from "./reel-scenes";
import { cursorBus, observeVisible, prefersReducedMotion } from "./cursor-bus";

/** A small domestic bird perched on a section edge. It pecks and hops, flies off when Cookie comes close and returns. */
export function Bird({ kind, style, flip = false }: { kind: BirdKind; style?: CSSProperties; flip?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    let raf = 0;
    let visible = false;
    let away = false;
    let back = 0;
    let next = performance.now() + 1500 + Math.random() * 3000;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => { timers.push(window.setTimeout(fn, ms)); };
    const tick = (now: number) => {
      if (!away) {
        if (now > next) {
          const act = ["peck", "hop", "flick", "peck"][Math.floor(Math.random() * 4)]!;
          el.classList.add(act);
          later(() => el.classList.remove(act), 750);
          next = now + 1800 + Math.random() * 3800;
        }
        const x = cursorBus.cookieOn ? cursorBus.cookieX : cursorBus.pointerX;
        const y = cursorBus.cookieOn ? cursorBus.cookieY : cursorBus.pointerY;
        const r = el.getBoundingClientRect();
        if (Math.hypot(r.left + r.width / 2 - x, r.top + r.height / 2 - y) < 95) {
          away = true;
          back = now + 4200 + Math.random() * 3000;
          el.style.setProperty("--fx", `${(Math.random() < 0.5 ? -1 : 1) * (80 + Math.random() * 90)}px`);
          el.classList.add("flap", "away");
        }
      } else if (now > back) {
        away = false;
        el.classList.remove("away");
        later(() => el.classList.remove("flap"), 1150);
        next = now + 2000;
      }
      if (visible) raf = requestAnimationFrame(tick);
    };
    const stopVisible = observeVisible(el, (v) => { visible = v; cancelAnimationFrame(raf); if (visible) raf = requestAnimationFrame(tick); });
    return () => { stopVisible(); cancelAnimationFrame(raf); timers.forEach(clearTimeout); };
  }, []);
  return <span ref={ref} className={`opl-bird${flip ? " flip" : ""}`} style={style} aria-hidden="true"
    dangerouslySetInnerHTML={{ __html: `<span class="b-in"><svg viewBox="0 0 64 64" focusable="false">${birdInner(kind)}</svg></span>` }} />;
}
