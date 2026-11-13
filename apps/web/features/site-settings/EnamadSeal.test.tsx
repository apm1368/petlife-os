import { afterEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import type { PublicPlatformSettings } from "@/services/platform-settings.service";
import { EnamadSeal, enamadUrls } from "./EnamadSeal";
import { __setSiteSettingsForTest } from "./site-settings";

const set = (extra: Record<string, unknown>) => __setSiteSettingsForTest({ "platform.announcement": null, ...extra } as PublicPlatformSettings);
afterEach(() => __setSiteSettingsForTest(null));

describe("eNamad trust seal (owner, 2026-11-13)", () => {
  it("builds eNamad's URLs only from a numeric id and an alphanumeric code", () => {
    expect(enamadUrls("123456", "AbC123xyz")).toEqual({ href: "https://trustseal.enamad.ir/?id=123456&Code=AbC123xyz", img: "https://trustseal.enamad.ir/logo.aspx?id=123456&Code=AbC123xyz" });
    expect(enamadUrls("123\"><script>", "AbC123xyz")).toBeNull();
    expect(enamadUrls("123456", "a&b=c")).toBeNull();
    expect(enamadUrls(null, "AbC123xyz")).toBeNull();
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
