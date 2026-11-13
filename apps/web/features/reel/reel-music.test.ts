import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createReelMusic, type ReelMusic } from "./reel-music";
import { REEL_TRACK } from "./reel-track";

class FakeAudio {
  static instances: FakeAudio[] = [];
  static support = "probably";
  static playResult: () => Promise<void> = () => Promise.resolve();
  src: string; loop = false; preload = ""; volume = 1; muted = false; paused = true;
  private listeners: Record<string, (() => void)[]> = {};
  constructor(src?: string) { this.src = src ?? ""; FakeAudio.instances.push(this); }
  canPlayType() { return FakeAudio.support; }
  play() { this.paused = false; return FakeAudio.playResult(); }
  pause() { this.paused = true; }
  load() {}
  removeAttribute(name: string) { if (name === "src") this.src = ""; }
  addEventListener(type: string, fn: () => void) { (this.listeners[type] ??= []).push(fn); }
  emit(type: string) { for (const fn of this.listeners[type] ?? []) fn(); }
}
const synthStub = () => ({ start: vi.fn(), stop: vi.fn(), setMuted: vi.fn(), dispose: vi.fn() }) satisfies ReelMusic;
const player = () => FakeAudio.instances.find((a) => a.src === REEL_TRACK.src);

describe("reel music", () => {
  beforeEach(() => { vi.useFakeTimers(); FakeAudio.instances = []; FakeAudio.support = "probably"; FakeAudio.playResult = () => Promise.resolve(); vi.stubGlobal("Audio", FakeAudio); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("plays nothing until started, then loops the licensed track with a fade-in", () => {
    const synth = synthStub();
    const music = createReelMusic({ synth: () => synth });
    expect(player()).toBeUndefined();
    music.start();
    const a = player()!;
    expect(a).toMatchObject({ loop: true, paused: false, muted: false });
    vi.advanceTimersByTime(500);
    expect(a.volume).toBeGreaterThan(0.5);
    expect(synth.start).not.toHaveBeenCalled();
  });

  it("honours mute and fades out to a pause on stop", () => {
    const music = createReelMusic({ synth: synthStub });
    music.setMuted(true);
    music.start();
    expect(player()!.muted).toBe(true);
    music.setMuted(false);
    expect(player()!.muted).toBe(false);
    vi.advanceTimersByTime(500);
    music.stop();
    vi.advanceTimersByTime(500);
    expect(player()!).toMatchObject({ paused: true, volume: 0 });
  });

  it("falls back to the synth when the browser can't play WebM/Opus", () => {
    FakeAudio.support = "";
    const synth = synthStub();
    const music = createReelMusic({ synth: () => synth });
    music.setMuted(true);
    music.start();
    expect(player()).toBeUndefined();
    expect(synth.setMuted).toHaveBeenCalledWith(true);
    expect(synth.start).toHaveBeenCalledTimes(1);
    music.stop();
    expect(synth.stop).toHaveBeenCalledTimes(1);
  });

  it("falls back to the synth when playback is refused or the file fails to load", async () => {
    FakeAudio.playResult = () => Promise.reject(new Error("NotAllowedError"));
    const synth = synthStub();
    createReelMusic({ synth: () => synth }).start();
    await vi.runAllTimersAsync();
    expect(synth.start).toHaveBeenCalledTimes(1);

    FakeAudio.playResult = () => Promise.resolve();
    const other = synthStub();
    createReelMusic({ synth: () => other }).start();
    FakeAudio.instances.at(-1)!.emit("error");
    expect(other.start).toHaveBeenCalledTimes(1);
  });

  it("credits a CC0 track that stays under 1 MB", async () => {
    const { statSync } = await import("node:fs");
    const { join } = await import("node:path");
    expect(REEL_TRACK.license).toBe("CC0 1.0 Universal");
    expect(statSync(join(process.cwd(), "public", REEL_TRACK.src)).size).toBeLessThan(1_000_000);
  });
});
