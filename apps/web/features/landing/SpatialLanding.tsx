"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { AppLocale } from "@/lib/i18n/config";
import { useThemeStore } from "@/stores/theme-store";
import { LandingTheme } from "./LandingTheme";
import { landingCopy } from "./copy";
import { cameraAt, cameraStops, clampProgress, nearestStop, wheelProgress } from "./camera";
import { landingDestination } from "./destination";

export function SpatialLanding({ locale }: { locale: AppLocale }) {
  const copy = landingCopy[locale],
    root = useRef<HTMLDivElement>(null),
    camera = useRef<HTMLDivElement>(null),
    parallax = useRef<HTMLDivElement>(null);
  const target = useRef(0),
    current = useRef(0),
    frame = useRef(0),
    settle = useRef<ReturnType<typeof setTimeout>>(),
    activeRef = useRef(0);
  const geometry = useRef({ width: 1440, height: 900, worldWidth: 1536, worldHeight: 900, mobile: false });
  const [active, setActive] = useState(0),
    [systemReduced, setSystemReduced] = useState(false),
    [paused, setPaused] = useState(false),
    [ready, setReady] = useState(false);
  const reduced = systemReduced || paused,
    reducedRef = useRef(reduced),
    theme = useThemeStore((s) => s.theme);
  const startTouch = useRef<{ x: number; y: number } | null>(null);
  const emit = useCallback(
    (name: string, detail: Record<string, unknown> = {}) => {
      root.current?.dispatchEvent(
        new CustomEvent(name, { bubbles: true, detail: { locale, activePetId: "cookie", ...detail } }),
      );
    },
    [locale],
  );
  const draw = useCallback(() => {
    const g = geometry.current,
      state = cameraAt(current.current, g.mobile);
    const zoom = g.mobile ? 1.8 + (state.scale - 1) * 0.55 : 1.02 + (state.scale - 1);
    const boundX = Math.max(0, (g.worldWidth * zoom - g.width) / 2 - 8),
      boundY = Math.max(0, (g.worldHeight * zoom - g.height) / 2 - 8);
    const xOffset = Math.max(-boundX, Math.min(boundX, ((50 - state.x) * g.worldWidth * zoom) / 100));
    const yOffset = Math.max(
      g.mobile ? -g.worldHeight * zoom : -boundY,
      Math.min(boundY, ((50 - state.y) * g.worldHeight * zoom) / 100 - (g.mobile ? g.height * 0.1 : 0)),
    );
    const cameraTransform = `translate3d(${xOffset}px,${yOffset}px,0) scale(${zoom})`;
    if (camera.current) camera.current.style.transform = cameraTransform;
    root.current?.style.setProperty("--camera-transform", cameraTransform);
    root.current?.style.setProperty("--world-progress", String(current.current));
    const next = nearestStop(current.current);
    if (next !== activeRef.current) {
      activeRef.current = next;
      setActive(next);
      emit("landing_camera_state_viewed", { state: cameraStops[next]!.id });
    }
  }, [emit]);
  const tick = useCallback(
    function animate() {
      const gap = target.current - current.current;
      current.current =
        reducedRef.current || Math.abs(gap) < 0.00008 ? target.current : current.current + gap * 0.09;
      draw();
      if (current.current !== target.current) frame.current = requestAnimationFrame(animate);
      else frame.current = 0;
    },
    [draw],
  );
  const move = useCallback(
    (value: number) => {
      target.current = clampProgress(value);
      if (!frame.current) frame.current = requestAnimationFrame(tick);
    },
    [tick],
  );
  const focusStop = useCallback(
    (index: number) => {
      if (settle.current) clearTimeout(settle.current);
      const stop = cameraStops[Math.max(0, Math.min(cameraStops.length - 1, index))]!;
      move(stop.progress);
      emit("landing_destination_clicked", { state: stop.id });
      if (stop.id === "cookie") emit("landing_cookie_focused");
    },
    [move, emit],
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setSystemReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    reducedRef.current = reduced;
    if (reduced) {
      current.current = target.current;
      draw();
      if (parallax.current) parallax.current.style.transform = "none";
    }
  }, [reduced, draw]);
  useEffect(() => {
    const resize = () => {
      const el = root.current;
      if (!el) return;
      const width = el.clientWidth,
        height = el.clientHeight,
        aspect = 1638 / 960;
      const worldWidth = Math.max(width, height * aspect),
        worldHeight = worldWidth / aspect;
      geometry.current = { width, height, worldWidth, worldHeight, mobile: width < 700 };
      el.style.setProperty("--world-width", worldWidth + "px");
      el.style.setProperty("--world-height", worldHeight + "px");
      draw();
    };
    resize();
    window.addEventListener("resize", resize);
    const el = root.current;
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || (event.target as HTMLElement).closest("select,input")) return;
      event.preventDefault();
      move(target.current + wheelProgress(event.deltaY || event.deltaX, event.deltaMode));
      if (settle.current) clearTimeout(settle.current);
      settle.current = setTimeout(() => move(cameraStops[nearestStop(target.current)]!.progress), 200);
    };
    el?.addEventListener("wheel", wheel, { passive: false });
    el?.focus({ preventScroll: true });
    emit("landing_viewed");
    return () => {
      window.removeEventListener("resize", resize);
      el?.removeEventListener("wheel", wheel);
      cancelAnimationFrame(frame.current);
      if (settle.current) clearTimeout(settle.current);
    };
  }, [draw, emit, move]);
  const lastTheme = useRef(theme);
  useEffect(() => {
    if (lastTheme.current !== theme) {
      emit("landing_theme_changed", { theme });
      lastTheme.current = theme;
    }
  }, [theme, emit]);
  const context = copy.contexts[active]!,
    overview = active === 0 || active === 11,
    future = active >= 8 && active <= 10;
  const cta = () => {
    emit("landing_primary_cta_clicked", { state: cameraStops[active]!.id });
  };
  return (
    <div
      ref={root}
      className="spatial-landing"
      role="main"
      tabIndex={-1}
      data-state={cameraStops[active]!.id}
      data-reduced={reduced}
      data-ready={ready}
      data-active-pet="cookie"
      onKeyDown={(event) => {
        if ((event.target as HTMLElement).closest("select,input,textarea")) return;
        const keys: Record<string, number> = {
          ArrowDown: activeRef.current + 1,
          ArrowRight: activeRef.current + 1,
          ArrowUp: activeRef.current - 1,
          ArrowLeft: activeRef.current - 1,
          Home: 0,
          End: 11,
          Escape: 0,
        };
        if (event.key in keys) {
          event.preventDefault();
          focusStop(keys[event.key]!);
        }
      }}
    >
      <div className="ambient-layer" aria-hidden="true">
        <span className="ambient-light" />
      </div>
      <div
        className="camera-viewport"
        onPointerMove={(event) => {
          if (reduced || event.pointerType !== "mouse" || !window.matchMedia("(pointer: fine)").matches)
            return;
          const g = geometry.current;
          if (parallax.current)
            parallax.current.style.transform = `translate3d(${(event.clientX / g.width - 0.5) * 12}px,${(event.clientY / g.height - 0.5) * 8}px,0)`;
        }}
        onPointerLeave={() => {
          if (parallax.current) parallax.current.style.transform = "none";
        }}
        onPointerDown={(event) => {
          if (event.pointerType === "touch" && !(event.target as HTMLElement).closest("button"))
            startTouch.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event) => {
          const start = startTouch.current;
          startTouch.current = null;
          if (!start) return;
          const dy = start.y - event.clientY,
            dx = start.x - event.clientX,
            delta = Math.abs(dy) > Math.abs(dx) ? dy : dx;
          if (Math.abs(delta) > 35) focusStop(activeRef.current + (delta > 0 ? 1 : -1));
        }}
      >
        <div ref={camera} className="camera-layer">
          <div ref={parallax} className="parallax-layer">
            <div className="persistent-world">
              <Image
                src="/images/landing/cookie-world-day-clean.webp"
                unoptimized
                alt=""
                fill
                priority
                sizes="(max-width: 700px) 1600px, 100vw"
                className="world-day"
                onLoad={() => setReady(true)}
              />
              <Image
                src="/images/landing/cookie-world-night-clean.webp"
                unoptimized
                alt=""
                fill
                sizes="(max-width: 700px) 1600px, 100vw"
                className="world-night"
                onLoad={() => setReady(true)}
              />
              <div className="world-shimmer" aria-hidden="true" />
              <div className="taxi-motion" aria-hidden="true">
                <Image
                  src="/images/landing/cookie-taxi.webp"
                  unoptimized
                  alt=""
                  width={1448}
                  height={1086}
                  sizes="350px"
                />
              </div>
              {cameraStops.slice(1, 11).map((stop, index) => (
                <button
                  key={stop.id}
                  type="button"
                  className="world-destination"
                  style={{ left: stop.x + "%", top: stop.y + "%" }}
                  aria-label={`${copy.contexts[index + 1]![0]} — ${copy.pet}`}
                  aria-pressed={active === index + 1}
                  onClick={() => focusStop(index + 1)}
                >
                  <span>{copy.contexts[index + 1]![0]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="context-effects-layer" aria-hidden="true" data-connected={active === 2 || active === 3}>
        <svg className="context-connection" viewBox="0 0 1638 960" fill="none">
          <path d="M524 854 C570 770 660 718 622 672 S472 614 446 548 S383 485 360 432" />
          <circle cx="524" cy="854" r="9" />
          <circle cx="360" cy="432" r="12" />
        </svg>
      </div>
      <div className="ui-overlay">
        <a className="spatial-skip" href="#world-controls">
          {copy.skip}
        </a>
        <header className="spatial-header">
          <button className="spatial-brand" onClick={() => focusStop(0)} aria-label={copy.overview}>
            <bdi>PET LIFE OS</bdi>
          </button>
          <div className="spatial-preferences">
            <a
              href={locale === "fa" ? "/en" : "/fa"}
              aria-label={copy.language}
              onClick={() => emit("landing_language_changed", { to: locale === "fa" ? "en" : "fa" })}
            >
              {locale === "fa" ? "EN" : "فا"}
            </a>
            <div aria-label={copy.theme}>
              <LandingTheme />
            </div>
            <Link href={`/${locale}/welcome`}>{copy.signIn}</Link>
          </div>
        </header>
        <button
          className="cookie-identity"
          onClick={() => focusStop(1)}
          aria-label={`${copy.pet} — ${copy.breed}`}
        >
          <span className="cookie-photo">
            <Image src="/images/landing/cookie-reference.jpg" alt="" width={120} height={120} priority />
          </span>
          <span>
            <strong>{copy.pet}</strong>
            <bdi>{copy.breed}</bdi>
          </span>
        </button>
        <div className="context-copy" key={cameraStops[active]!.id}>
          <p className="context-eyebrow">{overview ? "PET LIFE OS" : context[0]}</p>
          <h1>{context[1]}</h1>
          <p className="context-description">{context[2]}</p>
          {!overview && <p className="context-disclosure">{future ? copy.future : copy.demo}</p>}
          <div className="context-actions">
            {future ? (
              <button className="spatial-primary" onClick={() => focusStop(0)}>
                {copy.back}
              </button>
            ) : (
              <Link
                className="spatial-primary"
                href={landingDestination(locale, overview ? "overview" : cameraStops[active]!.id)}
                onClick={cta}
              >
                {context[3]}
              </Link>
            )}
            {overview ? (
              <button
                className="spatial-secondary"
                onClick={() => {
                  emit("landing_secondary_cta_clicked");
                  focusStop(1);
                }}
              >
                {copy.explore}
              </button>
            ) : (
              <button className="spatial-secondary" onClick={() => focusStop(0)}>
                {copy.overview}
              </button>
            )}
          </div>
        </div>
        <nav className="world-controls" id="world-controls" aria-label={copy.destinations}>
          <button onClick={() => focusStop(active - 1)} disabled={active === 0}>
            {copy.previous}
          </button>
          <label>
            <span className="sr-only">{copy.destinations}</span>
            <select
              aria-label={copy.destinations}
              value={active}
              onChange={(event) => focusStop(Number(event.target.value))}
            >
              {copy.contexts.map((entry, index) => (
                <option key={index} value={index}>
                  {entry[0]}
                </option>
              ))}
            </select>
          </label>
          <button onClick={() => focusStop(active + 1)} disabled={active === 11}>
            {copy.next}
          </button>
          <label className="motion-control">
            <input type="checkbox" checked={paused} onChange={(event) => setPaused(event.target.checked)} />
            {copy.pause}
          </label>
        </nav>
        <p className="spatial-hint">{copy.hint}</p>
        <p role="status" className="sr-only" aria-live="polite">
          {context[0]}
        </p>
      </div>
    </div>
  );
}
