import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { FooterAppInstall } from "./FooterAppInstall";
import { androidDownloadLinks } from "./app-links";

const standalone = (on: boolean) =>
  Object.defineProperty(window, "matchMedia", { configurable: true, value: (query: string) => ({ matches: on && query.includes("standalone"), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }) });

afterEach(() => standalone(false));

describe("footer: two clean app buttons, Android and iPhone (owner, 2026-11-13)", () => {
  it("shows only the Android download and the iPhone install, with icons and no version, size or SHA", () => {
    standalone(false);
    const { container } = renderWithIntl(<FooterAppInstall />, "fa");
    const android = screen.getByRole("link", { name: "دانلود برای اندروید" });
    expect(android.getAttribute("href")).toBe("https://opetlife.ir/app/opetlife.apk");
    expect(android.hasAttribute("download")).toBe(true);
    expect(android.querySelector("svg")).toBeTruthy();
    const iphone = screen.getByRole("link", { name: "نصب روی آیفون" });
    expect(iphone.getAttribute("href")).toBe("/fa/app#ios");
    expect(iphone.querySelector("svg")).toBeTruthy();
    expect(screen.getByRole("link", { name: "همهٔ راه‌های نصب" }).getAttribute("href")).toBe("/fa/app");
    expect(screen.getAllByRole("link")).toHaveLength(3);
    expect(screen.queryByRole("button")).toBeNull();
    const text = container.textContent ?? "";
    for (const detail of ["SHA", "32806b76", "نسخه", "کیلوبایت", "۱.۰.۱۴"]) expect(text).not.toContain(detail);
  });

  it.each([
    ["en", "Download for Android", "Install on iPhone"],
    ["de", "Für Android herunterladen", "Auf dem iPhone installieren"],
    ["es", "Descargar para Android", "Instalar en iPhone"],
    ["ar", "تنزيل لأندرويد", "التثبيت على آيفون"],
    ["nl", "Downloaden voor Android", "Installeren op iPhone"],
  ] as const)("is translated in %s", (locale, android, ios) => {
    standalone(false);
    renderWithIntl(<FooterAppInstall />, locale);
    expect(screen.getByRole("link", { name: android }).getAttribute("href")).toBe("https://opetlife.ir/app/opetlife.apk");
    expect(screen.getByRole("link", { name: ios }).getAttribute("href")).toBe(`/${locale}/app#ios`);
  });

  it("opens the browser's own install prompt from the iPhone button where one exists (Chrome/Edge)", async () => {
    standalone(false);
    const prompt = vi.fn(async () => undefined);
    renderWithIntl(<FooterAppInstall />, "en");
    act(() => {
      window.dispatchEvent(Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt, userChoice: Promise.resolve({ outcome: "accepted", platform: "web" }) }));
    });
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    fireEvent(screen.getByRole("link", { name: "Install on iPhone" }), click);
    expect(click.defaultPrevented).toBe(true);
    await waitFor(() => expect(prompt).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole("link", { name: "Download for Android" })).toBeNull());
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
