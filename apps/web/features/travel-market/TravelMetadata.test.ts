import { describe, expect, it, vi } from "vitest";
vi.mock("./TravelHomeView", () => ({ TravelHomeView: () => null }));
import { generateMetadata } from "@/app/[locale]/(public)/travel/page";

describe("travel discovery metadata", () => {
  it.each(["fa", "en", "de", "es"])("uses %s metadata and four locale alternatives without promising live inventory", async (locale) => {
    const metadata = await generateMetadata({ params: Promise.resolve({ locale }) });
    expect(metadata.alternates?.canonical).toBe(`/${locale}/travel`);
    expect(Object.keys(metadata.alternates?.languages ?? {})).toEqual(["fa", "en", "de", "es"]);
    expect(metadata.description).not.toMatch(/real availability|موجودی واقعی/);
    expect(metadata.description).toMatch(/تأیید|Confirm|Bestätigen|Confirma/);
    if (locale === "de") expect(metadata.title).toContain("Haustier");
    if (locale === "es") expect(metadata.title).toContain("mascotas");
  });
});
