import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { FooterAppInstall } from "./FooterAppInstall";
import { androidDownloadLinks } from "./app-links";

const setUserAgent = (ua: string) => Object.defineProperty(window.navigator, "userAgent", { value: ua, configurable: true });
const standalone = (on: boolean) =>
  Object.defineProperty(window, "matchMedia", { configurable: true, value: (query: string) => ({ matches: on && query.includes("standalone"), media: query, addEventListener: () => undefined, removeEventListener: () => undefined }) });

afterEach(() => {
  setUserAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36");
  standalone(false);
});

describe("footer: install the app (owner, 2026-11-13)", () => {
  it("shows the iPhone steps in Safari, where there is no install prompt", () => {
    standalone(false);
    setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1");
    renderWithIntl(<FooterAppInstall />, "fa");
    fireEvent.click(screen.getByRole("button", { name: "نصب اپ روی گوشی" }));
    expect(screen.getByRole("status").textContent).toContain("Add to Home Screen");
  });

  it("explains the browser menu where no prompt was offered", () => {
    standalone(false);
    renderWithIntl(<FooterAppInstall />, "de");
    fireEvent.click(screen.getByRole("button", { name: "App installieren" }));
    expect(screen.getByRole("status").textContent).toContain("Browsermenü");
  });

  it("opens the browser's own install prompt when Chrome offered one", async () => {
    standalone(false);
    const prompt = vi.fn(async () => undefined);
    renderWithIntl(<FooterAppInstall />, "en");
    const event = Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt, userChoice: Promise.resolve({ outcome: "accepted", platform: "web" }) });
    act(() => {
      window.dispatchEvent(event);
    });
    fireEvent.click(screen.getByRole("button", { name: "Install the app" }));
    await waitFor(() => expect(prompt).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole("button", { name: "Install the app" })).toBeNull());
  });

  it("is hidden inside the installed app", () => {
    standalone(true);
    renderWithIntl(<FooterAppInstall />, "es");
    expect(screen.queryByRole("button", { name: "Instalar la app" })).toBeNull();
  });

  it("lists only real https store links", () => {
    expect(androidDownloadLinks({ bazaar: null, myket: null, googlePlay: null, apk: null })).toEqual([]);
    expect(androidDownloadLinks({ bazaar: "https://cafebazaar.ir/app/ir.opetlife.app", myket: "javascript:alert(1)", googlePlay: null, apk: "http://x" })).toEqual([
      { store: "bazaar", url: "https://cafebazaar.ir/app/ir.opetlife.app" },
    ]);
  });
});
