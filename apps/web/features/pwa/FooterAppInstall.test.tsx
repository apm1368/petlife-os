import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { FooterAppInstall } from "./FooterAppInstall";
import { androidDownloadLinks } from "./app-links";

const standalone = (on: boolean) =>
  Object.defineProperty(window, "matchMedia", { configurable: true, value: (query: string) => ({ matches: on && query.includes("standalone"), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }) });

afterEach(() => standalone(false));

describe("footer: the app on Android and iPhone/iPad (owner, 2026-11-13)", () => {
  it("shows Android (APK download) and iPhone/iPad (web app steps) side by side, plus all ways to install", () => {
    standalone(false);
    renderWithIntl(<FooterAppInstall />, "fa");
    const android = screen.getByRole("link", { name: /اندروید: دانلود اپ \(APK\)/ });
    expect(android.getAttribute("href")).toBe("https://opetlife.ir/app/opetlife.apk");
    expect(android.hasAttribute("download")).toBe(true);
    expect(android.textContent).toContain("نسخهٔ ۱.۰.۱۴ · ۱۷۸ کیلوبایت");
    expect(screen.getByRole("link", { name: /آیفون و آیپد: نصب وب‌اپ/ }).getAttribute("href")).toBe("/fa/app#ios");
    expect(screen.getByRole("link", { name: "همهٔ راه‌های نصب" }).getAttribute("href")).toBe("/fa/app");
    // No browser prompt offered: no install button.
    expect(screen.queryByRole("button")).toBeNull();
  });

  it.each([["en", "Android: download the app (APK)", "iPhone & iPad: install the web app"], ["ar", "أندرويد: تنزيل التطبيق (APK)", "آيفون وآيباد: تثبيت تطبيق الويب"], ["nl", "Android: app downloaden (APK)", "iPhone & iPad: web-app installeren"]] as const)("is translated in %s", (locale, android, ios) => {
    standalone(false);
    renderWithIntl(<FooterAppInstall />, locale);
    expect(screen.getByRole("link", { name: new RegExp(android.replace(/[()]/g, "\\$&")) })).toBeTruthy();
    expect(screen.getByRole("link", { name: new RegExp(ios) }).getAttribute("href")).toBe(`/${locale}/app#ios`);
  });

  it("adds the browser's own install button when Chrome offers it", async () => {
    standalone(false);
    const prompt = vi.fn(async () => undefined);
    renderWithIntl(<FooterAppInstall />, "en");
    act(() => {
      window.dispatchEvent(Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt, userChoice: Promise.resolve({ outcome: "accepted", platform: "web" }) }));
    });
    fireEvent.click(screen.getByRole("button", { name: "Install the app" }));
    await waitFor(() => expect(prompt).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole("link", { name: /Android: download the app/ })).toBeNull());
  });

  it("is hidden inside the installed app", () => {
    standalone(true);
    renderWithIntl(<FooterAppInstall />, "es");
    expect(screen.queryByRole("link", { name: /Android/ })).toBeNull();
  });

  it("lists only real https store links", () => {
    expect(androidDownloadLinks({ bazaar: null, myket: null, googlePlay: null, apk: null })).toEqual([]);
    expect(androidDownloadLinks({ bazaar: "https://cafebazaar.ir/app/ir.opetlife.app", myket: "javascript:alert(1)", googlePlay: null, apk: "http://x" })).toEqual([
      { store: "bazaar", url: "https://cafebazaar.ir/app/ir.opetlife.app" },
    ]);
  });
});
