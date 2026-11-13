import { afterEach, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { AppInstallView } from "./AppInstallView";

const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPHONE_INSTAGRAM = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

const device = (ua: string, touch = 0) => {
  Object.defineProperty(window.navigator, "userAgent", { value: ua, configurable: true });
  Object.defineProperty(window.navigator, "maxTouchPoints", { value: touch, configurable: true });
};
const standalone = (on: boolean) =>
  Object.defineProperty(window, "matchMedia", { configurable: true, value: (query: string) => ({ matches: on && query.includes("standalone"), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }) });

afterEach(() => {
  device(DESKTOP);
  standalone(false);
});

const card = (name: string) => screen.getByRole("region", { name });

describe("/app: every way to install opetlife (owner, 2026-11-13)", () => {
  it("always shows Android, iPhone/iPad and computer, and highlights this device", () => {
    device(ANDROID, 5);
    renderWithIntl(<AppInstallView locale="fa" />, "fa");
    expect(card("اندروید").getAttribute("data-current")).toBe("true");
    expect(card("آیفون و آیپد").getAttribute("data-current")).toBe("false");
    expect(card("رایانه")).toBeTruthy();
    expect(within(card("اندروید")).getByText("دستگاه شما")).toBeTruthy();
    const download = within(card("اندروید")).getByRole("link", { name: "دانلود اپ اندروید (APK)" });
    expect(download.getAttribute("href")).toBe("https://opetlife.ir/app/opetlife.apk");
    expect(download.hasAttribute("download")).toBe(true);
    // Version, size and SHA-256 sit in a collapsed "file details", not in the open card.
    const details = within(card("اندروید")).getByText("جزئیات فایل").closest("details");
    expect(details?.hasAttribute("open")).toBe(false);
    expect(within(details as HTMLElement).getByText("32806b76452526c2d4f74383b09b6c922eb3f2ffdc4bcce20cf1ec6e4d5ee700")).toBeTruthy();
  });

  it("gives iPhone Safari the Add to Home Screen steps", () => {
    device(IPHONE_SAFARI, 5);
    renderWithIntl(<AppInstallView locale="en" />, "en");
    const ios = card("iPhone and iPad");
    expect(ios.getAttribute("data-current")).toBe("true");
    expect(within(ios).getByText("In Safari, tap the Share button.")).toBeTruthy();
    expect(within(ios).getByText("Choose “Add to Home Screen”.")).toBeTruthy();
    expect(within(ios).queryByText("Open this page in Safari")).toBeNull();
  });

  it("asks iPhone users in an in-app browser to open the page in Safari, with a copy button", () => {
    device(IPHONE_INSTAGRAM, 5);
    renderWithIntl(<AppInstallView locale="de" />, "de");
    const ios = card("iPhone und iPad");
    expect(within(ios).getByText("Öffne diese Seite in Safari")).toBeTruthy();
    expect(within(ios).getByRole("button", { name: "Link kopieren" })).toBeTruthy();
  });

  it("says when opetlife is already installed and drops the iPhone steps there", () => {
    device(IPHONE_SAFARI, 5);
    standalone(true);
    renderWithIntl(<AppInstallView locale="es" />, "es");
    expect(screen.getByRole("status").textContent).toBe("opetlife ya está instalada en este dispositivo.");
    expect(within(card("iPhone y iPad")).queryByText("En Safari, toca el botón Compartir.")).toBeNull();
  });

  it.each(["ar", "nl"] as const)("is translated in %s", (locale) => {
    device(DESKTOP);
    renderWithIntl(<AppInstallView locale={locale} />, locale);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(locale === "ar" ? "opetlife على هاتفك وجهازك اللوحي" : "opetlife op je telefoon en tablet");
  });
});
