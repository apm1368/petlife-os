import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import manifest from "./manifest";

describe("web app manifest (#290 Q7)", () => {
  it("is installable: standalone, Persian-first start, any + maskable icons that exist on disk", () => {
    const m = manifest();
    expect(m).toMatchObject({ display: "standalone", start_url: "/", lang: "fa", dir: "rtl", short_name: "opetlife" });
    expect(m.name).toContain("اپت لایف");
    const icons = m.icons ?? [];
    expect(icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable")).toBe(true);
    expect(icons.some((i) => i.sizes === "192x192")).toBe(true);
    for (const icon of icons) expect(existsSync(join(__dirname, "..", "public", icon.src))).toBe(true);
  });
});
