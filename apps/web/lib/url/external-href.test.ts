import { describe, expect, it } from "vitest";
import { externalHref } from "./external-href";

describe("externalHref", () => {
  it("keeps plain http(s) links", () => {
    expect(externalHref("https://www.ive.ir/rules")).toBe("https://www.ive.ir/rules");
    expect(externalHref(" http://example.org/a?b=1 ")).toBe("http://example.org/a?b=1");
  });

  it("drops script, data and relative or malformed values", () => {
    for (const bad of ["javascript:alert(1)", " JavaScript:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:x", "//evil.example", "/fa/account", "not a url", "", null, undefined]) {
      expect(externalHref(bad)).toBeNull();
    }
  });
});
