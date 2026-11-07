import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { commerceService } from "@/services/commerce.service";
import { renderWithIntl } from "@/test/render-with-intl";
import { FavoritesView } from "./FavoritesView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/services/commerce.service", () => ({ commerceService: { listFavorites: vi.fn() } }));

describe("FavoritesView localization", () => {
  beforeEach(() => vi.mocked(commerceService.listFavorites).mockReset());

  it.each([
    ["de", "Merkliste", "Noch keine gespeicherten Produkte", "Tippe bei einem Produkt auf das Herz, um es hier zu speichern."],
    ["es", "Favoritos", "Todavía no tienes favoritos", "Pulsa el corazón de un producto para guardarlo aquí."],
  ] as const)("renders localized empty state in %s", async (locale, title, empty, hint) => {
    vi.mocked(commerceService.listFavorites).mockResolvedValue([]);

    renderWithIntl(<FavoritesView />, locale);

    expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
    expect(screen.getByText(empty)).toBeTruthy();
    expect(screen.getByText(hint)).toBeTruthy();
  });
});
