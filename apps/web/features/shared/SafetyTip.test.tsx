import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { SafetyTip } from "./SafetyTip";

describe("SafetyTip (#290 Q59)", () => {
  it.each([
    ["fa", "contact", "مراقب کلاهبرداری باشید", "کارت‌به‌کارت"],
    ["en", "payment", "Stay safe from scams", "personal account"],
    ["de", "lostPet", "Schützen Sie sich vor Betrug", "Finderlohn"],
    ["es", "donation", "Protégete de las estafas", "cuenta personal"],
  ] as const)("warns in %s (%s)", (locale, kind, title, phrase) => {
    renderWithIntl(<SafetyTip kind={kind} />, locale);
    const tip = screen.getByRole("complementary", { name: title });
    expect(tip.textContent).toContain(phrase);
    expect(tip.getAttribute("data-kind")).toBe(kind);
  });
});
