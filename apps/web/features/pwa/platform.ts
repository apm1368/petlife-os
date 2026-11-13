/**
 * Which install path fits this device (the /app page highlights it; every path is always shown).
 * - android: the signed APK, or the browser's own install.
 * - ios: Safari's "Add to Home Screen". It only works in Safari, so Chrome/Firefox/Edge on iOS and in-app browsers
 *   (Instagram, Telegram, Facebook, Google app…) are told to open the page in Safari first.
 * - desktop: the browser's install prompt (Chrome, Edge).
 */
export type InstallPlatform = "android" | "ios" | "desktop";

export interface PlatformInfo {
  platform: InstallPlatform;
  /** iOS only: the page is open in Safari itself, where Add to Home Screen exists. */
  iosSafari: boolean;
}

export function detectPlatform(userAgent: string, maxTouchPoints = 0): PlatformInfo {
  const ua = userAgent || "";
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  if (ios) {
    const otherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|DuckDuckGo|GSA\//.test(ua);
    const inApp = /FBAN|FBAV|FB_IAB|Instagram|Line\/|Telegram|Twitter|LinkedInApp|Snapchat|WhatsApp|MicroMessenger/i.test(ua);
    const safari = /Safari\//.test(ua) && /Version\//.test(ua) && !otherBrowser && !inApp;
    return { platform: "ios", iosSafari: safari };
  }
  if (/Android/i.test(ua)) return { platform: "android", iosSafari: false };
  return { platform: "desktop", iosSafari: false };
}
