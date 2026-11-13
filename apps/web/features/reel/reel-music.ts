import { REEL_TRACK } from "./reel-track";

export type ReelMusic = { start(): void; stop(): void; setMuted(v: boolean): void; dispose(): void };

/** The code-generated instrumental loop: the fallback when the licensed track can't be played in this browser. */
export function createSynthMusic(): ReelMusic {
  let ac: AudioContext | null = null, master: GainNode | null = null, timer = 0, nextT = 0, step = 0, noise: AudioBuffer | null = null, on = false, muted = false;
  const BPM = 92, S16 = 60 / BPM / 4, PROG = [[53, 57, 60], [48, 52, 55], [50, 53, 57], [46, 50, 53]] as const, PAT = [3, 2, 4, 2, 3, 1, 2, 1];
  const mf = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
  const init = () => {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return false;
    ac = new AC();
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
    master = ac.createGain(); master.gain.value = 0; master.connect(comp); comp.connect(ac.destination);
    noise = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.2), ac.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  };
  const env = (g: GainNode, t: number, peak: number, attack: number, release: number) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + release); };
  const pluck = (m: number, t: number, v: number) => {
    const a = ac!, o = a.createOscillator(), o2 = a.createOscillator(), g = a.createGain(), f = a.createBiquadFilter();
    o.type = "triangle"; o2.type = "sine"; o.frequency.value = mf(m + 12); o2.frequency.value = mf(m + 24); f.type = "lowpass"; f.frequency.value = 2600;
    env(g, t, v, 0.008, 0.7); o.connect(f); o2.connect(f); f.connect(g); g.connect(master!); o.start(t); o2.start(t); o.stop(t + 0.75); o2.stop(t + 0.75);
  };
  const pad = (ch: readonly number[], t: number, dur: number) => {
    const a = ac!;
    for (const m of ch) for (const det of [-7, 7]) {
      const o = a.createOscillator(), g = a.createGain(), f = a.createBiquadFilter();
      o.type = "sawtooth"; o.frequency.value = mf(m); o.detune.value = det; f.type = "lowpass"; f.frequency.value = 700;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.016, t + 0.6); g.gain.setValueAtTime(0.016, t + dur - 0.3); g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.4);
      o.connect(f); f.connect(g); g.connect(master!); o.start(t); o.stop(t + dur + 0.5);
    }
    const b = a.createOscillator(), bg = a.createGain();
    b.type = "sine"; b.frequency.value = mf(ch[0]! - 12); bg.gain.setValueAtTime(0.0001, t); bg.gain.linearRampToValueAtTime(0.12, t + 0.05); bg.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    b.connect(bg); bg.connect(master!); b.start(t); b.stop(t + dur + 0.05);
  };
  const kick = (t: number) => { const a = ac!, o = a.createOscillator(), g = a.createGain(); o.type = "sine"; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12); g.gain.setValueAtTime(0.3, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28); o.connect(g); g.connect(master!); o.start(t); o.stop(t + 0.3); };
  const shaker = (t: number, v: number) => { const a = ac!, s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); s.buffer = noise; f.type = "highpass"; f.frequency.value = 6500; g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07); s.connect(f); f.connect(g); g.connect(master!); s.start(t); s.stop(t + 0.08); };
  const sched = () => {
    const a = ac!;
    while (nextT < a.currentTime + 0.15) {
      const bar = Math.floor(step / 16) % 4, s = step % 16, ch = PROG[bar]!, tones = [ch[0], ch[1], ch[2], ch[0] + 12, ch[1] + 12];
      if (s === 0) pad(ch, nextT, S16 * 16);
      if (s % 2 === 0) pluck(tones[PAT[(s / 2) % 8]!]!, nextT, s % 4 === 0 ? 0.13 : 0.08);
      if (s === 0 || s === 8) kick(nextT);
      if (s % 4 === 2) shaker(nextT, 0.05);
      if (s % 4 === 3) shaker(nextT, 0.022);
      nextT += S16; step++;
    }
  };
  return {
    start() {
      if (!ac && !init()) return;
      void ac!.resume();
      if (on) return;
      on = true; step = 0; nextT = ac!.currentTime + 0.06;
      master!.gain.cancelScheduledValues(ac!.currentTime); master!.gain.setValueAtTime(master!.gain.value, ac!.currentTime); master!.gain.linearRampToValueAtTime(muted ? 0 : 0.6, ac!.currentTime + 0.4);
      timer = window.setInterval(sched, 25); sched();
    },
    stop() {
      if (!ac || !on) return;
      on = false; window.clearInterval(timer);
      master!.gain.cancelScheduledValues(ac.currentTime); master!.gain.setValueAtTime(master!.gain.value, ac.currentTime); master!.gain.linearRampToValueAtTime(0, ac.currentTime + 0.35);
    },
    setMuted(v: boolean) { muted = v; if (ac && on) { master!.gain.cancelScheduledValues(ac.currentTime); master!.gain.setTargetAtTime(v ? 0 : 0.6, ac.currentTime, 0.05); } },
    dispose() { this.stop(); void ac?.close(); ac = null; },
  };
}

const VOLUME = 0.55;
const FADE_MS = 400;

/**
 * Reel music: the licensed instrumental track (features/reel/reel-track.ts, credited on /credits), looped and faded in
 * and out; the synth takes over when the browser can't decode WebM/Opus or playback fails. Nothing plays until the
 * visitor presses play, and mute is honoured on both paths.
 */
export function createReelMusic(opts: { src?: string; synth?: () => ReelMusic } = {}): ReelMusic {
  const src = opts.src ?? REEL_TRACK.src;
  let synth: ReelMusic | null = null, audio: HTMLAudioElement | null = null, fallback = false, on = false, muted = false, fade = 0;
  const getSynth = () => (synth ??= (opts.synth ?? createSynthMusic)());
  const canPlayFile = () => typeof Audio !== "undefined" && new Audio().canPlayType(REEL_TRACK.mime) !== "";
  const ramp = (to: number, then?: () => void) => {
    window.clearInterval(fade);
    const a = audio!, from = a.volume, t0 = Date.now();
    fade = window.setInterval(() => {
      const k = Math.min(1, (Date.now() - t0) / FADE_MS);
      a.volume = Math.max(0, Math.min(1, from + (to - from) * k));
      if (k >= 1) { window.clearInterval(fade); then?.(); }
    }, 30);
  };
  const toSynth = () => {
    fallback = true;
    if (audio) { audio.pause(); audio.removeAttribute("src"); audio.load(); audio = null; }
    if (on) { const s = getSynth(); s.setMuted(muted); s.start(); }
  };
  return {
    start() {
      on = true;
      if (fallback || !canPlayFile()) { fallback = true; const s = getSynth(); s.setMuted(muted); s.start(); return; }
      if (!audio) {
        audio = new Audio(src);
        audio.loop = true; audio.preload = "auto"; audio.volume = 0;
        audio.addEventListener("error", toSynth, { once: true });
      }
      audio.muted = muted;
      const played = audio.play();
      if (played && typeof played.catch === "function") played.catch(() => { if (on) toSynth(); });
      ramp(VOLUME);
    },
    stop() {
      on = false;
      if (fallback) { synth?.stop(); return; }
      if (audio) ramp(0, () => { if (!on) audio?.pause(); });
    },
    setMuted(v: boolean) { muted = v; if (audio) audio.muted = v; synth?.setMuted(v); },
    dispose() {
      on = false; window.clearInterval(fade);
      if (audio) { audio.pause(); audio.removeAttribute("src"); audio.load(); audio = null; }
      synth?.dispose(); synth = null;
    },
  };
}
