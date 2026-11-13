import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { SetPetRequestDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { ApiError } from "@/lib/api/client";
import { setPetService } from "@/services/set-pet.service";
import { SetPetRequests } from "./SetPetRequests";

vi.mock("@/services/set-pet.service", () => ({ setPetService: { list: vi.fn(), get: vi.fn(), acceptQuote: vi.fn(), cancel: vi.fn() } }));
const svc = vi.mocked(setPetService);

const request = (patch: Partial<SetPetRequestDto> = {}): SetPetRequestDto => ({
  id: "r1", number: 1, reference: "SP-000001", status: "QUOTED", petId: null, humanColour: "white", humanSizes: ["M", "XXL"], petSize: "S", petColour: "white",
  petMeasurements: { neckCm: 25, chestCm: 35, backLengthCm: 28, weightKg: 4 }, notes: null, placements: [], designs: [],
  quote: { amountIrr: 12_500_000, note: null, estimatedReadyAt: "2026-11-20T00:00:00Z", quotedAt: "2026-11-13T10:00:00Z" },
  confirmedAt: null, productionStartedAt: null, shippedAt: null, shippingNote: null, cancelledAt: null, cancelledBy: null, cancelReason: null, timeline: [],
  createdAt: "2026-11-13T09:00:00Z", updatedAt: "2026-11-13T10:00:00Z", ...patch,
});

beforeEach(() => vi.clearAllMocks());

describe("Set Pet requests", () => {
  it("shows the quote and accepts exactly the price shown", async () => {
    svc.list.mockResolvedValue([request()]);
    svc.acceptQuote.mockResolvedValue(request({ status: "CONFIRMED" }));
    renderWithIntl(<SetPetRequests refreshKey={0} />, "en");
    expect(await screen.findByText("2 T-shirts (M, 2XL) and a pet shirt (S), White")).toBeTruthy();
    expect(screen.getByText("Price ready")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Accept the price and start" }));
    await waitFor(() => expect(svc.acceptQuote).toHaveBeenCalledWith("r1", 12_500_000));
    expect(await screen.findByText("Accepted")).toBeTruthy();
  });

  it("reloads a re-quoted request instead of accepting a price the member did not see", async () => {
    svc.list.mockResolvedValue([request()]);
    svc.acceptQuote.mockRejectedValue(new ApiError({ code: "SET_PET_QUOTE_CHANGED", message: "x", requestId: "r", details: { amountIrr: 15_000_000 } }, 409));
    svc.get.mockResolvedValue(request({ quote: { amountIrr: 15_000_000, note: null, estimatedReadyAt: null, quotedAt: "2026-11-13T11:00:00Z" } }));
    renderWithIntl(<SetPetRequests refreshKey={0} />, "fa");
    fireEvent.click(await screen.findByRole("button", { name: "تأیید قیمت و شروع تولید" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("کارشناس قیمت را به‌روز کرده است. پیش از تأیید، قیمت جدید را ببین.");
    expect(screen.getByText(/۱٬۵۰۰٬۰۰۰ تومان/)).toBeTruthy();
  });

  it("asks before cancelling", async () => {
    svc.list.mockResolvedValue([request({ status: "SUBMITTED", quote: null })]);
    svc.cancel.mockResolvedValue(request({ status: "CANCELLED", quote: null }));
    renderWithIntl(<SetPetRequests refreshKey={0} />, "en");
    fireEvent.click(await screen.findByRole("button", { name: "Cancel request" }));
    expect(svc.cancel).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel" }));
    await waitFor(() => expect(svc.cancel).toHaveBeenCalledWith("r1"));
    expect(await screen.findByText("Cancelled")).toBeTruthy();
  });
});
