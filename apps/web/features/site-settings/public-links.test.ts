import { describe, expect, it } from "vitest";
import type { PublicPlatformSettings } from "@/services/platform-settings.service";
import { enamadSeal, visibleSocialLinks } from "./public-links";

const base = { "platform.announcement": null } as PublicPlatformSettings;

describe("public social links and eNamad seal", () => {
  it("shows a network only when its link is set and its switch isn't off, in footer order", () => {
    expect(visibleSocialLinks(null)).toEqual([]);
    expect(visibleSocialLinks({ ...base, "social.youtube": "https://youtu.be/x", "social.bale": "https://ble.ir/opetlife", "social.instagram": "https://instagram.com/opetlife", "social.instagramEnabled": false, "social.telegram": null })).toEqual([
      { network: "bale", href: "https://ble.ir/opetlife" },
      { network: "youtube", href: "https://youtu.be/x" },
    ]);
  });

  it("builds the standard trustseal link and image from the id and code only, and nothing until switched on", () => {
    const seal = { "trust.enamadEnabled": true, "trust.enamadId": "123456", "trust.enamadCode": "AbC123xyz789" };
    expect(enamadSeal(seal)).toEqual({ href: "https://trustseal.enamad.ir/?id=123456&Code=AbC123xyz789", imageSrc: "https://trustseal.enamad.ir/logo.aspx?id=123456&Code=AbC123xyz789" });
    expect(enamadSeal({ ...seal, "trust.enamadEnabled": false })).toBeNull();
    expect(enamadSeal({ ...seal, "trust.enamadCode": null })).toBeNull();
    expect(enamadSeal({ ...seal, "trust.enamadCode": '"><script>alert(1)</script>' })).toBeNull();
    expect(enamadSeal(null)).toBeNull();
  });
});
