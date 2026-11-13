import { afterEach, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import type { PublicPlatformSettings } from "@/services/platform-settings.service";
import { SocialLinks, socialLinks } from "./SiteContact";
import { __setSiteSettingsForTest } from "./site-settings";

const base = { "platform.announcement": null } as PublicPlatformSettings;
const set = (extra: Record<string, unknown>) => __setSiteSettingsForTest({ ...base, ...extra } as PublicPlatformSettings);
afterEach(() => __setSiteSettingsForTest(null));

describe("social icons from the admin settings (owner, 2026-11-13)", () => {
  it("shows a network only when its link is set and its switch is not off, in a fixed order", () => {
    const links = socialLinks({ ...base, "social.youtube": "https://youtube.com/@opetlife", "social.instagram": "https://instagram.com/opetlife", "social.bale": "https://ble.ir/opetlife", "social.baleEnabled": false, "social.telegram": null } as never);
    expect(links.map((l) => l.network)).toEqual(["instagram", "youtube"]);
    expect(socialLinks(null)).toEqual([]);
  });

  it("never links anything but https", () => {
    expect(socialLinks({ ...base, "social.instagram": "javascript:alert(1)", "social.telegram": "http://t.me/x", "social.whatsapp": "https://wa.me/98912" } as never).map((l) => l.network)).toEqual(["whatsapp"]);
  });

  it("renders plain links with our own icons, named per language, opening in a new tab without the referrer", () => {
    set({ "social.instagram": "https://instagram.com/opetlife", "social.bale": "https://ble.ir/opetlife", "social.telegram": "https://t.me/opetlife", "social.whatsapp": "https://wa.me/989120000000", "social.youtube": "https://youtube.com/@opetlife" });
    renderWithIntl(<SocialLinks />, "fa");
    const list = screen.getByRole("list");
    const names = within(list).getAllByRole("link").map((a) => a.getAttribute("aria-label"));
    expect(names).toEqual(["اینستاگرام", "تلگرام", "واتس\u200cاپ", "بله", "یوتیوب"]);
    for (const a of within(list).getAllByRole("link")) {
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toBe("noopener noreferrer me");
      expect(a.querySelector("svg")).toBeTruthy();
      expect(a.querySelector("img, iframe, script")).toBeNull();
    }
  });

  it("titles the member dashboard block and hides it until a link exists", () => {
    set({});
    const { container, unmount } = renderWithIntl(<SocialLinks title="opetlife on social media" />, "en");
    expect(container.textContent).toBe("");
    unmount();
    set({ "social.telegram": "https://t.me/opetlife" });
    renderWithIntl(<SocialLinks title="opetlife on social media" />, "en");
    expect(screen.getByRole("heading", { name: "opetlife on social media" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Telegram" }).getAttribute("href")).toBe("https://t.me/opetlife");
  });
});
