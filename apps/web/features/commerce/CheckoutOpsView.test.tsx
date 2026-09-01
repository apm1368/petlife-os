import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type { CheckoutOpsDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { commerceService } from "@/services/commerce.service";
import { CheckoutOpsView } from "./CheckoutOpsView";

vi.mock("@/services/commerce.service", () => ({ commerceService: { getOpsView: vi.fn() } }));

const OPS: CheckoutOpsDto = {
  checkout: { id: "checkout-1" } as never,
  paymentIntents: [{ id: "intent-1", checkoutId: "checkout-1", amount: 1_250_000, currency: "IRR", status: "CAPTURED" as never, provider: "DEV_SIMULATED" as never }],
  paymentAttempts: [],
  transactions: [],
  financingIntents: [],
  refunds: [],
  providerEvents: [],
  reconciliationLogs: [],
};

describe("CheckoutOpsView", () => {
  beforeEach(() => {
    vi.mocked(commerceService.getOpsView).mockReset();
  });

  it("shows the checkout's payment intents and an empty state for records with none", async () => {
    vi.mocked(commerceService.getOpsView).mockResolvedValue(OPS);

    renderWithIntl(<CheckoutOpsView checkoutId="checkout-1" />);

    await waitFor(() => expect(screen.getByText("CAPTURED")).toBeTruthy());
    expect(screen.getByText("DEV_SIMULATED")).toBeTruthy();
    expect(screen.getAllByText("None recorded.").length).toBeGreaterThan(0);
  });
});
