import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { PublicFooter } from "./PublicFooter";
import { LandingShell } from "@/features/landing/opl/LandingShell";
import { storyCopy } from "@/features/landing/story-copy";

describe("public footer destinations", () => {
  it.each(["fa", "en", "de", "es"] as const)("preserves locale and readable navigation groups in %s", (locale) => {
    const copy = storyCopy[locale];
    renderWithIntl(<LandingShell locale={locale} variant="page"><PublicFooter locale={locale} /></LandingShell>, locale);
    const footer = screen.getByRole("contentinfo", { name: copy.footerLabel });
    for (const group of copy.footerGroups) {
      const nav = within(footer).getByRole("navigation", { name: group.title });
      for (const link of group.links) {
        expect(within(nav).getByRole("link", { name: link.label }).getAttribute("href")).toBe(`/${locale}${link.href}`);
      }
    }
    expect(within(footer).getByRole("link", { name: copy.footerPrivacy }).getAttribute("href")).toBe(`/${locale}/profile/privacy`);
    expect(within(footer).getByRole("link", { name: copy.partnerLogin }).getAttribute("href")).toBe(`/${locale}/auth?returnTo=${encodeURIComponent(`/${locale}/provider`)}`);
    // The Persian brand link goes to the bare domain, the canonical Persian home.
    for (const link of within(footer).getAllByRole("link")) expect(link.getAttribute("href")).toMatch(new RegExp(locale === "fa" ? "^(?:/fa(?:/|#|$)|/$)" : `^/${locale}(?:/|#|$)`));
    expect(footer.textContent).not.toContain(copy.footerNotice);
  });
});
