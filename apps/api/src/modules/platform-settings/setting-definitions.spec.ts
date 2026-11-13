import { SETTING_DEFINITIONS, SOCIAL_NETWORKS, hostAllowed, settingDefinition, validateSettingValue } from "./setting-definitions";

const check = (key: string, value: unknown) => validateSettingValue(settingDefinition(key)!, value);

describe("social links and the eNamad seal (owner, 2026-11-13)", () => {
  it("gives every network a public link with a host allowlist and its own switch, on by default", () => {
    for (const { network } of SOCIAL_NETWORKS) {
      const link = settingDefinition(`social.${network}`)!;
      const toggle = settingDefinition(`social.${network}Enabled`)!;
      expect(link).toMatchObject({ type: "url", scope: "PUBLIC", highImpact: false });
      expect(link.allowedHosts?.length).toBeGreaterThan(0);
      expect(toggle).toMatchObject({ type: "boolean", scope: "PUBLIC" });
      expect(toggle.fallback(() => undefined)).toBe(true);
    }
    expect(SETTING_DEFINITIONS.filter((d) => d.key.startsWith("social.")).length).toBe(SOCIAL_NETWORKS.length * 2);
  });

  it("accepts each network's own https hosts (and www.) and nothing else", () => {
    expect(check("social.instagram", "https://www.instagram.com/opetlife")).toEqual({ ok: true, value: "https://www.instagram.com/opetlife" });
    expect(check("social.youtube", "https://youtu.be/abc")).toMatchObject({ ok: true });
    expect(check("social.youtube", "https://m.youtube.com/@opetlife")).toMatchObject({ ok: true });
    expect(check("social.bale", "https://ble.ir/opetlife")).toMatchObject({ ok: true });
    expect(check("social.telegram", "https://t.me/opetlife")).toMatchObject({ ok: true });
    expect(check("social.whatsapp", "https://wa.me/989121234567")).toMatchObject({ ok: true });
    expect(check("social.bale", null)).toEqual({ ok: true, value: null });

    for (const [key, value] of [
      ["social.instagram", "https://instagram.com.evil.example/opetlife"],
      ["social.instagram", "https://evilinstagram.com/x"],
      ["social.telegram", "https://telegram.me/opetlife"],
      ["social.bale", "https://ble.ir:8443/opetlife"],
      ["social.whatsapp", "https://user:pw@wa.me/1"],
      ["social.youtube", "https://www.youtube.com.evil.example/"],
    ] as const) {
      expect(check(key, value)).toEqual({ ok: false, reason: "URL_HOST_NOT_ALLOWED" });
    }
    expect(check("social.instagram", "/instagram")).toEqual({ ok: false, reason: "URL_HOST_NOT_ALLOWED" });
    // Plain http never gets as far as the host check.
    expect(check("social.bale", "http://ble.ir/opetlife")).toEqual({ ok: false, reason: "URL_INVALID" });
    expect(check("social.instagram", "javascript:alert(1)")).toEqual({ ok: false, reason: "URL_INVALID" });
    expect(hostAllowed("not a url", ["t.me"])).toBe(false);
  });

  it("stores only the eNamad id and code, never HTML, and keeps the seal off by default", () => {
    expect(settingDefinition("trust.enamadEnabled")!.fallback(() => undefined)).toBe(false);
    expect(check("trust.enamadId", "123456")).toEqual({ ok: true, value: "123456" });
    expect(check("trust.enamadCode", "AbC123xyz789")).toEqual({ ok: true, value: "AbC123xyz789" });
    expect(check("trust.enamadId", "12ab")).toEqual({ ok: false, reason: "FORMAT_INVALID" });
    expect(check("trust.enamadCode", '<a href="https://trustseal.enamad.ir/?id=1&Code=x"><img src=x onerror=alert(1)></a>')).toMatchObject({ ok: false });
    expect(check("trust.enamadCode", "abc def")).toEqual({ ok: false, reason: "FORMAT_INVALID" });
  });
});
