import { describe, expect, it } from "vitest";
import { renderWithIntl } from "@/test/render-with-intl";
import { oplCopyFor } from "@/test/pattern-copy";
import { AuthLogoScene } from "./AuthLogoScene";

describe("auth logo scene (pattern-2026-11 pages.md row 9)", () => {
  it.each(["fa", "en", "de", "es"] as const)("draws a light and a dark logo scene with the %s wordmark", (locale) => {
    const { container } = renderWithIntl(<AuthLogoScene locale={locale} />, locale);
    const arts = container.querySelectorAll(".opl-auth-scene__art");
    expect(arts).toHaveLength(2);
    expect(container.querySelector(".is-light svg")).not.toBeNull();
    expect(container.querySelector(".is-dark svg")).not.toBeNull();
    expect(container.textContent).toContain(oplCopyFor(locale).brand);
    expect(container.firstElementChild?.getAttribute("aria-hidden")).toBe("true");
    if (locale !== "fa") expect(container.textContent).not.toMatch(/[؀-ۿ]/);
  });
});
