import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { PublicPetMemorialSection } from "./PublicPetMemorialSection";

const listPublicMemorials = vi.hoisted(() => vi.fn());

vi.mock("@/services/memories.service", () => ({
  memoriesService: { listPublicMemorials },
}));

afterEach(() => {
  cleanup();
  listPublicMemorials.mockReset();
});

describe("public memorial landing copy", () => {
  it.each([
    ["de", "Wir erinnern uns an unsere Wegbegleiter", "Bisher wurde noch kein öffentliches Gedenken freigegeben."],
    ["es", "Recordamos a quienes nos acompañaron", "Todavía no hay ningún homenaje público aprobado."],
  ] as const)("renders fully localized %s heading, disclosure and empty state", async (locale, title, empty) => {
    listPublicMemorials.mockResolvedValueOnce([]);
    renderWithIntl(<PublicPetMemorialSection />, locale);

    const region = await screen.findByRole("region", { name: title });
    expect(within(region).getByText(title)).toBeTruthy();
    expect(within(region).getByText(/Namen und Fotos|Los nombres y las fotos/)).toBeTruthy();
    // The page fetch is intentionally async; waiting on the empty state avoids
    // racing the loading skeleton during the full suite.
    expect(await within(region).findByText(empty)).toBeTruthy();
    expect(region.textContent).not.toMatch(/[\u0600-\u06ff]/);
    expect(region.textContent).not.toMatch(/In loving memory|Remembering our companions|No public memorials/);
  });
});
