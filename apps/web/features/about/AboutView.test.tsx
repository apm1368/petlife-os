import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { publicPageMetadata } from "@/lib/seo/public-metadata";
import { aboutPageJsonLd } from "@/lib/seo/site";
import fa from "@/messages/fa.json";
import en from "@/messages/en.json";
import de from "@/messages/de.json";
import es from "@/messages/es.json";
import { AboutView } from "./AboutView";

const catalogs = { fa, en, de, es } as const;

describe("About page", () => {
  it.each(["fa", "en", "de", "es"] as const)("tells the whole story in %s, linking every claim to a real section", (locale) => {
    const copy = catalogs[locale].aboutPage;
    const { container } = renderWithIntl(<AboutView />, locale);
    expect(screen.getByRole("heading", { level: 1, name: copy.title })).toBeTruthy();
    const chapters = screen.getByRole("navigation", { name: copy.chapters.label });
    expect(within(chapters).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(["#about-why", "#about-connect", "#about-promises", "#about-values", "#about-contact"]);
    for (const key of ["record", "care", "shop", "travel", "safety", "together", "learn"] as const) {
      expect(screen.getByRole("link", { name: copy.connect.steps[key].cta }).getAttribute("href")).toMatch(new RegExp(`^/${locale}/`));
    }
    expect(screen.getByRole("link", { name: copy.promises.items.credits.title }).getAttribute("href")).toBe(`/${locale}/credits`);
    expect(screen.getByRole("link", { name: new RegExp(copy.contact.contactCta) }).getAttribute("href")).toBe(`/${locale}/contact`);
    expect(container.querySelectorAll(".about-path__step")).toHaveLength(7);
    expect(container.querySelectorAll(".about-card")).toHaveLength(6);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/aboutPage\./);
    if (locale !== "fa") expect(text).not.toMatch(/[؀-ۿ]/);
  });

  it("is an indexable page with its own canonical and every language alternate", () => {
    const meta = publicPageMetadata("de", "about");
    expect(meta.robots).toMatchObject({ index: true });
    expect(meta.alternates?.canonical).toBe("/de/about");
    expect(Object.keys(meta.alternates?.languages ?? {})).toEqual(expect.arrayContaining(["fa", "en", "de", "es", "x-default"]));
  });

  it("describes itself as an AboutPage about the site's Organization", () => {
    const ld = aboutPageJsonLd("en", en.aboutPage.title, en.aboutPage.lede);
    expect(ld).toMatchObject({ "@type": "AboutPage", url: "https://opetlife.ir/en/about", inLanguage: "en", about: { "@id": "https://opetlife.ir/#organization" } });
  });
});
