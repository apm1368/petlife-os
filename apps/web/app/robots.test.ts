import { describe, expect, it } from "vitest";
import robots from "./robots";

describe("private route crawl policy", () => {
  it.each(["fa", "en", "de", "es"])("excludes private and financial routes for %s", (locale) => {
    const rules = robots().rules;
    const rule = Array.isArray(rules) ? rules[0] : rules;
    if (!rule) throw new Error("Missing crawler policy");
    for (const path of ["admin", "pets", "profile", "checkout", "orders", "provider", "travel/bookings", "auth", "register", "health-share", "pet-card", "community/messages"]) {
      expect(rule.disallow).toContain(`/${locale}/${path}`);
    }
    expect(rule.disallow).not.toContain(`/${locale}/travel`);
    expect(rule.disallow).not.toContain(`/${locale}/shop`);
  });

  it("publishes the sitemap location without exposing private routes there", () => {
    expect(robots().sitemap).toBe("https://opetlife.ir/sitemap.xml");
  });
});
