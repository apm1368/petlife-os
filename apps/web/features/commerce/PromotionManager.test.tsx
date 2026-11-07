import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { PromotionManager } from "./PromotionManager";

const api = {
  list: vi.fn().mockResolvedValue([]),
  create: vi.fn(),
  update: vi.fn(),
  transition: vi.fn(),
};

describe("PromotionManager locale coverage", () => {
  it.each([
    ["fa", "تخفیف‌ها", "تخفیف جدید"],
    ["en", "Promotions", "New promotion"],
    ["de", "Rabatte und Aktionen", "Neue Aktion"],
    ["es", "Descuentos y promociones", "Nueva promoción"],
  ] as const)("renders the real promotion UI in %s", async (locale, title, createAction) => {
    api.list.mockClear();
    renderWithIntl(<PromotionManager api={api} mode="SELLER" productOptions={[]} />, locale);

    expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
    expect(screen.getByRole("button", { name: createAction })).toBeTruthy();
    expect(api.list).toHaveBeenCalledTimes(1);
  });
});
