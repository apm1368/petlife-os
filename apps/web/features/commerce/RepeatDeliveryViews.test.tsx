import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { commerceService } from "@/services/commerce.service";
import { renderWithIntl } from "@/test/render-with-intl";
import { RepeatDeliveryListView } from "./RepeatDeliveryViews";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/hooks/use-active-pet", () => ({ useActivePet: () => ({ householdId: null }) }));
vi.mock("@/services/commerce.service", () => ({ commerceService: { listRepeatDeliveries: vi.fn() } }));

describe("RepeatDeliveryListView localization", () => {
  beforeEach(() => vi.mocked(commerceService.listRepeatDeliveries).mockReset());

  it.each([
    ["de", "Wiederkehrende Lieferungen", "Noch keine wiederkehrenden Lieferungen", /niemals automatisch/i],
    ["es", "Entregas periódicas", "Todavía no tienes entregas periódicas", /nunca realiza cargos automáticos/i],
  ] as const)("renders localized, non-autopay empty state in %s", async (locale, title, empty, noAutopay) => {
    vi.mocked(commerceService.listRepeatDeliveries).mockResolvedValue([]);

    renderWithIntl(<RepeatDeliveryListView />, locale);

    expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
    await waitFor(() => expect(screen.getByText(empty)).toBeTruthy());
    expect(screen.getByText(noAutopay)).toBeTruthy();
  });
});
