import { afterEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import type { PublicPlatformSettings } from "@/services/platform-settings.service";
import { EnamadSeal } from "./EnamadSeal";
import { enamadSeal } from "./public-links";
import { __setSiteSettingsForTest } from "./site-settings";

const set = (extra: Record<string, unknown>) => __setSiteSettingsForTest({ "platform.announcement": null, ...extra } as PublicPlatformSettings);
afterEach(() => __setSiteSettingsForTest(null));

describe("eNamad trust seal (owner, 2026-11-13)", () => {
  it("builds eNamad's URLs only from a numeric id and an alphanumeric code (X3's builder)", () => {
    const on = (id: string | null, code: string | null) => enamadSeal({ "trust.enamadEnabled": true, "trust.enamadId": id, "trust.enamadCode": code });
    expect(on("123456", "AbC123xyz")).toEqual({ href: "https://trustseal.enamad.ir/?id=123456&Code=AbC123xyz", imageSrc: "https://trustseal.enamad.ir/logo.aspx?id=123456&Code=AbC123xyz" });
    expect(on("123\"><script>", "AbC123xyz")).toBeNull();
    expect(on("123456", "a&b=c")).toBeNull();
    expect(on(null, "AbC123xyz")).toBeNull();
  });

  it("renders the standard seal from the settings, keeping the referrer origin eNamad checks", () => {
    set({ "trust.enamadEnabled": true, "trust.enamadId": "123456", "trust.enamadCode": "AbC123xyz" });
    renderWithIntl(<EnamadSeal />, "fa");
    const link = screen.getByRole("link", { name: "نماد اعتماد الکترونیکی (اینماد)" });
    expect(link.getAttribute("href")).toBe("https://trustseal.enamad.ir/?id=123456&Code=AbC123xyz");
    expect(link.getAttribute("referrerpolicy")).toBe("origin");
    expect(link.getAttribute("rel")).toBe("noopener");
    const img = link.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("https://trustseal.enamad.ir/logo.aspx?id=123456&Code=AbC123xyz");
    expect(img.getAttribute("referrerpolicy")).toBe("origin");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("code")).toBe("AbC123xyz");
  });

  it.each([
    [{ "trust.enamadEnabled": false, "trust.enamadId": "123456", "trust.enamadCode": "AbC123xyz" }],
    [{ "trust.enamadEnabled": true, "trust.enamadId": null, "trust.enamadCode": "AbC123xyz" }],
    [{ "trust.enamadEnabled": true, "trust.enamadId": "123456", "trust.enamadCode": "<b>x</b>" }],
    [{}],
  ])("stays hidden while disabled, incomplete or invalid (%o)", (settings) => {
    set(settings);
    const { container } = renderWithIntl(<EnamadSeal />, "en");
    expect(container.innerHTML).toBe("");
  });
});
