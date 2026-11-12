"use client";

import { pushService, type PushSubscriptionBody } from "@/services/push.service";
import { isIosSafari, isStandalone } from "./pwa-runtime";

/**
 * Web Push on this browser. The browser subscription belongs to the member who turned it on here (kept in
 * localStorage as OWNER_KEY); signing out removes it, and a different member signing in on the same browser never
 * inherits it.
 */
const OWNER_KEY = "opl.push.owner";
const SYNCED_KEY = "opl.push.synced";
const RESYNC_MS = 7 * 24 * 60 * 60 * 1000;

export type PushAvailability = "unsupported" | "ios-install" | "denied" | "off" | "on";

const read = (key: string) => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};
const write = (key: string, value: string | null) => {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Private mode: opt-in still works for this visit.
  }
};

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  } catch {
    return null;
  }
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await registration();
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function pushAvailability(userId: string): Promise<PushAvailability> {
  if (!pushSupported()) return isIosSafari() && !isStandalone() ? "ios-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  const subscription = await currentSubscription();
  return subscription && read(OWNER_KEY) === userId && Notification.permission === "granted" ? "on" : "off";
}

function toBody(subscription: PushSubscription): PushSubscriptionBody {
  const json = subscription.toJSON();
  return { endpoint: json.endpoint ?? subscription.endpoint, keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" }, expirationTime: json.expirationTime ?? null };
}

function applicationServerKey(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = `${base64url}${"=".repeat((4 - (base64url.length % 4)) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** Asks for permission (from a tap, as browsers require), subscribes this browser and registers it for `userId`. */
export async function enablePush(userId: string, publicKey: string): Promise<PushAvailability> {
  const reg = await registration();
  if (!reg) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  let subscription = await reg.pushManager.getSubscription();
  if (subscription && read(OWNER_KEY) !== userId) {
    // Left over from another member on this browser: start clean so their old subscription dies with it.
    await subscription.unsubscribe().catch(() => undefined);
    subscription = null;
  }
  subscription ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(publicKey) });
  await pushService.subscribe(toBody(subscription));
  write(OWNER_KEY, userId);
  write(SYNCED_KEY, `${Date.now()}|${subscription.endpoint}`);
  return "on";
}

/** Turns push off on this browser only: removes it from the member's devices and drops the browser subscription. */
export async function disablePush(): Promise<void> {
  const subscription = await currentSubscription();
  if (subscription) {
    await pushService.unsubscribe(subscription.endpoint).catch(() => undefined);
    await subscription.unsubscribe().catch(() => undefined);
  }
  write(OWNER_KEY, null);
  write(SYNCED_KEY, null);
}

/**
 * On every signed-in app start: keep the API's copy of this browser's subscription current (the push service may
 * have rotated it), and drop a subscription another member left here.
 */
export async function syncPushSubscription(userId: string): Promise<void> {
  if (!pushSupported() || Notification.permission !== "granted") return;
  const owner = read(OWNER_KEY);
  if (!owner) return;
  const subscription = await currentSubscription();
  if (owner !== userId) {
    await subscription?.unsubscribe().catch(() => undefined);
    write(OWNER_KEY, null);
    write(SYNCED_KEY, null);
    return;
  }
  if (!subscription) return;
  const [at, endpoint] = (read(SYNCED_KEY) ?? "").split("|");
  if (endpoint === subscription.endpoint && Date.now() - Number(at) < RESYNC_MS) return;
  await pushService.subscribe(toBody(subscription));
  write(SYNCED_KEY, `${Date.now()}|${subscription.endpoint}`);
}

/** Sign-out: the next person on this device must never get this member's notifications. Never blocks sign-out. */
export async function detachPushOnSignOut(): Promise<void> {
  if (!pushSupported() || !read(OWNER_KEY)) return;
  const work = (async () => {
    const subscription = await currentSubscription();
    if (subscription) {
      await pushService.unsubscribe(subscription.endpoint).catch(() => undefined);
      await subscription.unsubscribe().catch(() => undefined);
    }
    write(OWNER_KEY, null);
    write(SYNCED_KEY, null);
  })();
  await Promise.race([work.catch(() => undefined), new Promise((resolve) => setTimeout(resolve, 3000))]);
}
