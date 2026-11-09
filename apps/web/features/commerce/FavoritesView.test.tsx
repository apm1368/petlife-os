import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { commerceService } from "@/services/commerce.service";
import { ApiError } from "@/lib/api/client";
import { productSummary } from "@/test/commerce-fixtures";
import { FavoritesView } from "./FavoritesView";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/services/commerce.service", () => ({ commerceService: { listFavorites: vi.fn() } }));

describe("FavoritesView localization", () => {
  const onlineStatus = navigator.onLine;

  beforeEach(() => {
    vi.mocked(commerceService.listFavorites).mockReset();
    push.mockReset();
  });
  afterEach(() => Object.defineProperty(navigator, "onLine", { configurable: true, value: onlineStatus }));

  it.each([
    ["de", "Favoriten", "Noch keine Favoriten", "Produkte ansehen"],
    ["es", "Favoritos", "Todavía no tienes favoritos", "Ver productos"],
  ] as const)("renders the localized empty state in %s", async (locale, title, empty, browse) => {
    vi.mocked(commerceService.listFavorites).mockResolvedValue([]);
    renderWithIntl(<FavoritesView />, locale);
    expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
    expect(screen.getByText(empty)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: browse }));
    expect(push).toHaveBeenCalledWith(`/${locale}/shop/products`);
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });

  it.each([["de", "Favoriten"], ["es", "Favoritos"]] as const)("shows product data without translating source-owned titles in %s", async (locale, title) => {
    vi.mocked(commerceService.listFavorites).mockResolvedValue([productSummary({ title: "Source-authored product title" })]);
    renderWithIntl(<FavoritesView />, locale);
    expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
    expect(screen.getByText("Source-authored product title")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });

  it.each([
    ["de", "Kein Zugriff auf deine gespeicherten Produkte"],
    ["es", "No tienes acceso a tus productos guardados"],
  ] as const)("renders an explicit translated forbidden state in %s", async (locale, title) => {
    vi.mocked(commerceService.listFavorites).mockRejectedValue(new ApiError({ code: "FORBIDDEN", message: "backend text" , requestId: "r1" }, 403));
    renderWithIntl(<FavoritesView />, locale);
    expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
    expect(document.body.textContent).not.toContain("backend text");
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });

  it.each([["de", "Du bist offline"], ["es", "No tienes conexión"]] as const)("does not conflate an offline failure with an empty list in %s", async (locale, title) => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    vi.mocked(commerceService.listFavorites).mockRejectedValue(new Error("offline"));
    renderWithIntl(<FavoritesView />, locale);
    expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
    expect(screen.queryByText(locale === "de" ? "Noch keine Favoriten" : "Todavía no tienes favoritos")).toBeNull();
    expect(document.body.textContent).not.toMatch(/[\u0600-\u06FF]/);
  });
});
