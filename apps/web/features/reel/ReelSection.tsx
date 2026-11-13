"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createReelMusic } from "./reel-music";

export type ReelScene = { bg: string; svg: string; dark?: boolean };
export type ReelLabels = { label: string; play: string; replay: string; pause: string; resume: string; mute: string; unmute: string; music: string; chapters: string; end: string };

const DUR = 3000;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const ICON = {
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor"/>',
  vol: '<path d="M11 5 6 9H3v6h3l5 4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  mute: '<path d="M11 5 6 9H3v6h3l5 4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m22 9-6 6M16 9l6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  music: '<path d="M9 18V5l11-2v13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="6" cy="18" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="17" cy="16" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/>',
};
const Svg = ({ d, size = 18 }: { d: string; size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: d }} />;

function moveCar(slide: HTMLElement | null, p: number) {
  const car = slide?.querySelector<SVGGElement>("[data-car]");
  const road = slide?.querySelector<SVGPathElement>("[data-road]");
  if (!car || !road || typeof road.getTotalLength !== "function") return;
  const L = road.getTotalLength(), e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2, t = 0.04 + e * 0.9;
  const a = road.getPointAtLength(L * t), b = road.getPointAtLength(Math.min(L, L * t + 2));
  const dx = b.x - a.x, dy = b.y - a.y, flip = dx < 0 ? -1 : 1, ang = clamp((Math.atan2(dy, Math.abs(dx) || 0.001) * 180) / Math.PI, -28, 28);
  car.setAttribute("transform", `translate(${a.x.toFixed(1)} ${(a.y - 6).toFixed(1)}) scale(${flip} 1) rotate(${ang.toFixed(1)})`);
}

/**
 * A wordless 9:16 reel (docs/design/pattern-2026-11/reel.md): illustrated SVG scenes, word-by-word subtitles,
 * progress bars, chapter list and an instrumental loop that starts only after the visitor presses play.
 */
export function ReelSection({ id, eyebrow, title, lede, scenes, kicks, subs, labels, decoration, formatNumber }: {
  id: string; eyebrow: ReactNode; title: string; lede: string; scenes: ReelScene[]; kicks: string[]; subs: string[]; labels: ReelLabels; decoration?: ReactNode; formatNumber: (n: number) => string;
}) {
  const [idx, setIdx] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [ended, setEnded] = useState(false);
  const [muted, setMuted] = useState(false);
  const bars = useRef<(HTMLElement | null)[]>([]);
  const slides = useRef<(HTMLDivElement | null)[]>([]);
  const clock = useRef({ start: 0, elapsed: 0 });
  const music = useRef<ReturnType<typeof createReelMusic> | null>(null);
  const idxRef = useRef(0);
  idxRef.current = idx;

  useEffect(() => () => music.current?.dispose(), []);
  useEffect(() => { moveCar(slides.current[idx] ?? null, started ? 0 : 0.6); }, [idx, cycle, started]);
  useEffect(() => {
    bars.current.forEach((b, j) => { if (b) b.style.width = j < idx ? "100%" : "0%"; });
  }, [idx, cycle]);
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = (now: number) => {
      const c = clock.current;
      c.elapsed = now - c.start;
      const i = idxRef.current, p = clamp(c.elapsed / DUR, 0, 1);
      const bar = bars.current[i];
      if (bar) bar.style.width = `${(p * 100).toFixed(1)}%`;
      moveCar(slides.current[i] ?? null, p);
      if (c.elapsed >= DUR) {
        if (i < scenes.length - 1) { c.start = now; c.elapsed = 0; setIdx(i + 1); setCycle((n) => n + 1); }
        else { setPlaying(false); setEnded(true); music.current?.stop(); return; }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, scenes.length]);

  const play = (from?: number) => {
    if (!music.current) music.current = createReelMusic();
    music.current.setMuted(muted);
    if (from != null || ended) {
      const i = from ?? 0;
      setEnded(false); setIdx(i); setCycle((n) => n + 1); clock.current = { start: performance.now(), elapsed: 0 };
    } else clock.current.start = performance.now() - clock.current.elapsed;
    setStarted(true); setPlaying(true); music.current.start();
  };
  const pause = () => { clock.current.elapsed = performance.now() - clock.current.start; setPlaying(false); music.current?.stop(); };
  const words = subs[idx]!.split(" ");

  return <section id={id} className="opl-sec opl-reel-sec" aria-labelledby={`${id}-title`}>
    <div className="opl-wrap opl-reel-grid">
      <div className="opl-reel-copy">
        <p className="opl-eyebrow"><Svg d={ICON.music} />{eyebrow}</p>
        <h2 className="opl-h2" id={`${id}-title`}>{title}</h2>
        <p className="opl-lede">{lede}</p>
        <ol className="opl-chapters" aria-label={labels.chapters}>{kicks.map((k, i) => <li key={i}>
          <button type="button" className={i === idx ? "on" : undefined} aria-current={i === idx ? "step" : undefined} data-ck={k || labels.end} onClick={() => play(i)}>
            <b>{formatNumber(i + 1)}</b>{k || labels.end}
          </button>
        </li>)}</ol>
      </div>
      <div className="opl-reel-wrap">
        {decoration}
        <div className={`opl-reel${playing ? " playing" : ""}${started ? " started" : ""}${scenes[idx]?.dark ? " is-dark" : ""}`} role="region" aria-label={labels.label}
          onClick={(e) => { if ((e.target as Element).closest("button")) return; if (started && !ended) { if (playing) pause(); else play(); } }}>
          <div className="opl-reel__slides">{scenes.map((s, i) => <div key={i === idx ? `${i}-${cycle}` : i} ref={(el) => { slides.current[i] = el; }}
            className={`opl-reel__slide${i === idx ? " on" : ""}${i === idx && started ? " opl-anim" : ""}${!playing ? " opl-paused" : ""}`} style={{ background: s.bg }}
            dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 360 640" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">${s.svg}</svg>` }} />)}</div>
          <div className="opl-reel__bars" aria-hidden="true">{scenes.map((_, i) => <span key={i}><i ref={(el) => { bars.current[i] = el; }} /></span>)}</div>
          {kicks[idx] ? <span className="opl-reel__kick">{kicks[idx]}</span> : null}
          <p key={`${idx}-${cycle}`} className="opl-reel__sub" aria-live="off">{words.map((w, i) => <span key={i} style={{ "--i": i } as React.CSSProperties}>{w}{i < words.length - 1 ? " " : ""}</span>)}</p>
          <div className="opl-reel__ctl">
            <span className="opl-reel__music"><Svg d={ICON.music} size={15} />{labels.music}</span>
            <button type="button" className="opl-rbtn" aria-label={playing ? labels.pause : labels.resume} onClick={() => (playing ? pause() : play())}><Svg d={playing ? ICON.pause : ICON.play} /></button>
            <button type="button" className="opl-rbtn" aria-label={muted ? labels.unmute : labels.mute} onClick={() => { const v = !muted; setMuted(v); music.current?.setMuted(v); }}><Svg d={muted ? ICON.mute : ICON.vol} /></button>
          </div>
          {!started || ended ? <button type="button" className={`opl-reel__play${ended ? " is-replay" : ""}`} onClick={() => play(ended ? 0 : undefined)} data-ck={labels.play}>
            <span className="opl-reel__playbtn"><Svg d={ICON.play} size={28} /></span><span className="opl-reel__playlabel">{ended ? labels.replay : labels.play}</span>
          </button> : null}
        </div>
      </div>
    </div>
  </section>;
}
