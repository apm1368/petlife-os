"use client";

/**
 * Browser-side state of the installable app: whether it runs installed (standalone), whether the browser offered an
 * install prompt, and whether the member has navigated inside the app yet (for the mobile back button). Kept in
 * module state and read with useSyncExternalStore, because `beforeinstallprompt` can fire before any component that
 * shows the install card has mounted.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface PwaState {
  installPrompt: BeforeInstallPromptEvent | null;
  installed: boolean;
}

let state: PwaState = { installPrompt: null, installed: false };
const listeners = new Set<() => void>();

function set(next: Partial<PwaState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

export function subscribePwa(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getPwaState = (): PwaState => state;
const SERVER_STATE: PwaState = { installPrompt: null, installed: false };
export const getServerPwaState = (): PwaState => SERVER_STATE;

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // Our own card offers the install inside the member area instead of the browser's mini bar.
    event.preventDefault();
    set({ installPrompt: event as BeforeInstallPromptEvent });
  });
  window.addEventListener("appinstalled", () => set({ installPrompt: null, installed: true }));
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    window.matchMedia?.("(display-mode: fullscreen)").matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    // The Android app (Trusted Web Activity) opens the site with this referrer.
    document.referrer.startsWith("android-app://")
  );
}

/** iPhone/iPad Safari: no install prompt event, the member adds the site from the Share menu. */
export function isIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  return ios && /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const prompt = state.installPrompt;
  if (!prompt) return "unavailable";
  await prompt.prompt();
  const choice = await prompt.userChoice.catch(() => ({ outcome: "dismissed" as const }));
  set({ installPrompt: null, installed: choice.outcome === "accepted" });
  return choice.outcome;
}

let firstPath: string | null = null;
let navigatedInApp = false;

/** Called on every route change by PwaRuntime; true once the member moved to another page inside the app. */
export function notePathname(pathname: string): void {
  if (firstPath === null) firstPath = pathname;
  else if (pathname !== firstPath) navigatedInApp = true;
}

export const hasInAppHistory = (): boolean => navigatedInApp;

export function registerServiceWorker(): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (process.env.NODE_ENV !== "production" || window.location.protocol !== "https:") return;
  const register = () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => undefined);
  };
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register, { once: true });
}
