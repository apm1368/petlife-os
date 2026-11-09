import { describe, expect, it } from "vitest";
import robots from "./robots";

describe("private route crawl policy", () => {
  it.each(["fa", "en", "de", "es"])("excludes private and financial routes for %s", (locale) => {
    const rules = robots().rules;
    const rule = Array.isArray(rules) ? rules[0] : rules;
    for (const path of ["admin", "pets", "profile", "checkout", "orders", "provider", "travel/bookings"]) {
      expect(rule.disallow).toContain(`/${locale}/${path}`);
    }
    expect(rule.disallow).not.toContain(`/${locale}/travel`);
    expect(rule.disallow).not.toContain(`/${locale}/shop`);
  });
});
