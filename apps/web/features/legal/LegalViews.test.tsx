import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { locales, type RouteLocale } from "@/lib/i18n/config";
import { BUILTIN_LEGAL_SLUGS, builtinFaq, builtinLegalDocument, faqPageJsonLd, type BuiltinFaq, type BuiltinLegalDocument } from "@/lib/legal/builtin";
import { publicPageMetadata, sitemapPages } from "@/lib/seo/public-metadata";
import { BuiltinFaqView, BuiltinLegalView } from "./LegalViews";

const shape = (doc: BuiltinLegalDocument) => doc.sections.map((s) => [s.id, s.paragraphs?.length ?? 0, s.items?.length ?? 0, (s.links ?? []).map((l) => l.href)]);
const faqShape = (faq: BuiltinFaq) => faq.groups.map((g) => [g.id, g.items.length]);
const strings = (value: unknown): string[] => typeof value === "string" ? [value] : Array.isArray(value) ? value.flatMap(strings) : value && typeof value === "object" ? Object.entries(value).filter(([k]) => k !== "id" && k !== "href" && k !== "updated").flatMap(([, v]) => strings(v)) : [];

describe("built-in legal texts", () => {
  it.each(BUILTIN_LEGAL_SLUGS)("%s has the same sections, lists and links in all six languages", (slug) => {
    const en = builtinLegalDocument(slug, "en");
    for (const locale of locales) {
      const doc = builtinLegalDocument(slug, locale);
      expect(shape(doc), locale).toEqual(shape(en));
      expect(doc.updated).toBe(en.updated);
      expect(strings(doc).every((s) => s.trim().length > 0), locale).toBe(true);
    }
  });

  it("the FAQ has the same groups and questions in all six languages", () => {
    for (const locale of locales) expect(faqShape(builtinFaq(locale)), locale).toEqual(faqShape(builtinFaq("en")));
  });

  it("keeps each language in its own script: no Latin brand on fa, no Persian-only letters in ar, no Arabic script in nl", () => {
    const all = (locale: RouteLocale) => [...BUILTIN_LEGAL_SLUGS.flatMap((slug) => strings(builtinLegalDocument(slug, locale))), ...strings(builtinFaq(locale))].join("\n");
    expect(all("fa")).not.toMatch(/opetlife/i);
    expect(all("ar")).not.toMatch(/[پچژگکی]/);
    expect(all("nl")).not.toMatch(/[؀-ۿ]/);
    expect(all("de")).not.toMatch(/[؀-ۿ]/);
    expect(all("es")).not.toMatch(/[؀-ۿ]/);
  });

  it("states the facts the code enforces: 48-hour returns, 30-minute card-to-card receipts, 7-day exports", () => {
    const terms = strings(builtinLegalDocument("terms", "en")).join(" ");
    const privacy = strings(builtinLegalDocument("privacy", "en")).join(" ");
    expect(terms).toMatch(/48 hours of delivery/);
    expect(terms).toMatch(/within 30 minutes/);
    expect(privacy).toMatch(/7 days/);
    expect(privacy).toMatch(/do not use advertising, analytics or social-media tracking cookies/);
  });
});

describe("legal pages", () => {
  it.each(["fa", "en", "ar"] as const)("renders the Terms with a table of contents in %s", (locale) => {
    const doc = builtinLegalDocument("terms", locale);
    renderWithIntl(<BuiltinLegalView slug="terms" doc={doc} locale={locale} />, locale);
    expect(screen.getByRole("heading", { level: 1, name: doc.title })).toBeTruthy();
    const toc = screen.getAllByRole("navigation")[0]!;
    expect(within(toc).getAllByRole("link").map((a) => a.getAttribute("href"))).toEqual(doc.sections.map((s) => `#${s.id}`));
    expect(screen.getByRole("link", { name: doc.sections.at(-1)!.links![0]!.label }).getAttribute("href")).toBe(`/${locale}/support`);
  });

  it("renders every FAQ answer as a native disclosure and builds FAQPage structured data", () => {
    const faq = builtinFaq("fa");
    const { container } = renderWithIntl(<BuiltinFaqView faq={faq} locale="fa" more={[{ slug: "wallet-help", title: "راهنمای کیف پول" }]} />, "fa");
    const total = faq.groups.reduce((n, g) => n + g.items.length, 0);
    expect(container.querySelectorAll("details").length).toBe(total);
    expect(screen.getByRole("link", { name: "راهنمای کیف پول" }).getAttribute("href")).toBe("/fa/help/articles/wallet-help");
    const ld = faqPageJsonLd(faq, "https://opetlife.ir/fa/help/faq");
    expect(ld["@type"]).toBe("FAQPage");
    expect(ld.mainEntity).toHaveLength(total);
    expect(ld.mainEntity[0]).toEqual({ "@type": "Question", name: faq.groups[0]!.items[0]!.q, acceptedAnswer: { "@type": "Answer", text: faq.groups[0]!.items[0]!.a } });
  });

  it("is indexable with hreflang for all six languages and listed in the sitemap", () => {
    for (const page of ["legalTerms", "legalPrivacy", "faq"] as const) {
      const meta = publicPageMetadata("de", page);
      expect(meta.robots).toMatchObject({ index: true });
      expect(Object.keys(meta.alternates?.languages ?? {}).sort()).toEqual([...locales, "x-default"].sort());
      expect(sitemapPages).toContain(page);
    }
    expect(publicPageMetadata("fa", "legalTerms").alternates?.canonical).toBe("/fa/legal/terms");
    expect(publicPageMetadata("en", "faq").alternates?.canonical).toBe("/en/help/faq");
  });
});
