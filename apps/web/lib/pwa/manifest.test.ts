import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { locales } from "@/lib/i18n/config";
import { buildManifest, manifestPath } from "./manifest";
import { GET } from "@/app/[locale]/manifest.webmanifest/route";

const publicDir = join(__dirname, "../../public");

describe("installable app manifest", () => {
  it.each(locales)("opens the %s member home, standalone, with the brand icons", (locale) => {
    const manifest = buildManifest(locale);
    expect(manifest.id).toBe("/");
    expect(manifest.start_url).toBe(`/${locale}/home`);
    expect(manifest.scope).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.lang).toBe(locale);
    expect(manifest.dir).toBe(locale === "fa" || locale === "ar" ? "rtl" : "ltr");
    expect(manifest.name).toBe(locale === "fa" ? "اپت لایف" : "opetlife");
    expect(manifest.theme_color).toBe("#1F5A3D");
    expect(manifest.background_color).toBe("#FFFBF5");
    const icons = manifest.icons ?? [];
    expect(icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable")).toBe(true);
    expect(icons.some((i) => i.sizes === "192x192" && i.purpose === "any")).toBe(true);
    for (const icon of [...icons, ...(manifest.shortcuts ?? []).flatMap((s) => s.icons ?? [])]) expect(existsSync(join(publicDir, icon.src)), icon.src).toBe(true);
    for (const shortcut of manifest.shortcuts ?? []) expect(shortcut.url.startsWith(`/${locale}/`)).toBe(true);
    expect(manifestPath(locale)).toBe(`/${locale}/manifest.webmanifest`);
  });

  it("is served as a web app manifest per locale and 404s for unknown ones", async () => {
    const ok = await GET(new Request("https://opetlife.ir/de/manifest.webmanifest"), { params: Promise.resolve({ locale: "de" }) });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toContain("application/manifest+json");
    expect((await ok.json()).start_url).toBe("/de/home");
    const missing = await GET(new Request("https://opetlife.ir/xx/manifest.webmanifest"), { params: Promise.resolve({ locale: "xx" }) });
    expect(missing.status).toBe(404);
  });

  it("ships the offline page and the worker's shell files", () => {
    for (const file of ["sw.js", "offline.html", "brand/opl/app-icon-192.png", "brand/opl/mark-color.svg", "brand/opl/badge-96.png"]) {
      expect(existsSync(join(publicDir, file)), file).toBe(true);
    }
  });
});
