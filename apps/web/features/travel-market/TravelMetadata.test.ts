import { describe, expect, it, vi } from "vitest";
vi.mock("./TravelHomeView", () => ({ TravelHomeView: () => null }));
import { generateMetadata } from "@/app/[locale]/(public)/travel/page";

describe("travel discovery metadata", () => {
  it.each(["fa", "en", "de", "es"])("uses %s metadata and locale alternatives without promising live inventory", async (locale) => {
    const metadata = await generateMetadata({ params: Promise.resolve({ locale }) });
    expect(metadata.alternates?.canonical).toBe(`/${locale}/travel`);
    const base = metadata.metadataBase;
    const canonical = metadata.alternates?.canonical;
    if (!base || typeof canonical !== "string") throw new Error("Missing canonical origin/path");
    expect(new URL(canonical, base).href).toBe(`https://opetlife.ir/${locale}/travel`);
    expect(Object.keys(metadata.alternates?.languages ?? {}).sort()).toEqual(["fa", "en", "de", "es", "x-default"].sort());
    for (const [language, path] of Object.entries(metadata.alternates?.languages ?? {})) {
      if (typeof path !== "string") throw new Error("Expected a single localized path");
      const routeLocale = language === "x-default" ? "fa" : language;
      expect(new URL(path, base).href).toBe(`https://opetlife.ir/${routeLocale}/travel`);
    }
    expect(metadata.description).not.toMatch(/real availability|موجودی واقعی/);
    expect(metadata.description).toMatch(/تأیید|Confirm|Bestätigen|Confirma/);
    if (locale === "de") expect(metadata.title).toContain("Haustier");
    if (locale === "es") expect(metadata.title).toContain("mascotas");
  });
});
