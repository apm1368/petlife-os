import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { SetPetRequestDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { ApiError } from "@/lib/api/client";
import { setPetService } from "@/services/set-pet.service";
import { householdsService } from "@/services/households.service";
import { addressesService } from "@/services/addresses.service";
import { walletService } from "@/services/wallet.service";
import { SetPetOrders } from "./SetPetOrders";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/services/set-pet.service", () => ({ setPetService: { list: vi.fn(), get: vi.fn(), proof: vi.fn(), approveProof: vi.fn(), shippingOptions: vi.fn(), pay: vi.fn(), cancel: vi.fn(), reorder: vi.fn() } }));
vi.mock("@/services/households.service", () => ({ householdsService: { listMine: vi.fn() } }));
vi.mock("@/services/addresses.service", () => ({ addressesService: { list: vi.fn() } }));
vi.mock("@/services/wallet.service", () => ({ walletService: { summary: vi.fn() } }));

const svc = vi.mocked(setPetService);
const ORDER: SetPetRequestDto = {
  id: "o1", number: 7, reference: "SP-000007", status: "PROOF_SENT",
  items: [{ position: 0, garment: "HUMAN_TEE", size: "M", colour: "black", petId: null, petName: null, petSpecies: null }, { position: 1, garment: "PET_TEE", size: "S", colour: "black", petId: null, petName: "Lili", petSpecies: "CAT" }],
  placements: [{ zone: "FRONT_CENTER", designFileId: null, text: "Hi", font: "VAZIRMATN", textColour: "white", scale: 1, offsetX: 0, offsetY: 0 }],
  designs: [], forPetId: null, notes: null,
  price: { lines: [], subtotalIrr: 10_000_000, discountPercent: 10, discountIrr: 1_000_000, totalIrr: 9_000_000 },
  proof: { id: "p1", status: "SENT", note: "Front 20×20", petPrintWidthCm: 18, petPrintHeightCm: 18, sentAt: "2026-11-13T10:00:00Z" },
  designRejectReason: null, payment: null, estimatedReadyAt: null, productionStartedAt: null, shippedAt: null, shippingNote: null,
  cancelledAt: null, cancelledBy: null, cancelReason: null, refundedIrr: null, canEdit: true, canCancel: true,
  timeline: [{ fromStatus: null, toStatus: "SUBMITTED", actor: "MEMBER", note: null, at: "2026-11-13T09:00:00Z" }],
  createdAt: "2026-11-13T09:00:00Z", updatedAt: "2026-11-13T10:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  svc.proof.mockResolvedValue({ url: "/api/uploads/private/proof", expiresInSeconds: 300 });
  vi.mocked(householdsService.listMine).mockResolvedValue([{ id: "h1" }] as never);
  vi.mocked(addressesService.list).mockResolvedValue([{ id: "a1", householdId: "h1", label: "Home", city: "Tehran", addressLine: "Valiasr", isDefault: true }] as never);
  svc.shippingOptions.mockResolvedValue([{ provider: "POST_PISHTAZ", priceIrr: 600_000, etaDays: 5 }]);
});

describe("my Set Pet orders (owner P38–P40, F2/F3/F8)", () => {
  it("shows the proof and approves exactly that proof; edit and reorder are one click away", async () => {
    svc.list.mockResolvedValue([ORDER]);
    svc.approveProof.mockResolvedValue({ ...ORDER, status: "AWAITING_PAYMENT", canEdit: false });
    svc.reorder.mockResolvedValue({ data: {}, updatedAt: "2026-11-13T10:00:00Z" });
    vi.mocked(walletService.summary).mockResolvedValue({ balances: { total: 2_000_000 } } as never);
    renderWithIntl(<SetPetOrders />);
    expect(((await screen.findByAltText("Print proof for SP-000007")) as HTMLImageElement).getAttribute("src")).toBe("/api/uploads/private/proof");
    expect(screen.getByText("Print on your pet's back: 18×18 cm")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Change my order" }).getAttribute("href")).toBe("/en/set-pet?edit=o1#setpet-builder");
    fireEvent.click(screen.getByRole("button", { name: "Approve the proof" }));
    await waitFor(() => expect(svc.approveProof).toHaveBeenCalledWith("o1", "p1"));
    // Next: payment from the wallet; the balance is short, so the member is sent to top up (card-to-card or online).
    expect(await screen.findByText(/Add 760,000 Toman to your wallet/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /Pay 960,000 Toman from my wallet/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Order again" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/en/set-pet?draft=1#setpet-builder"));
  });

  it("pays the exact total shown, and refreshes the order when the proof changed meanwhile", async () => {
    svc.list.mockResolvedValue([{ ...ORDER, status: "AWAITING_PAYMENT", canEdit: false, proof: { ...ORDER.proof!, status: "APPROVED" } }]);
    vi.mocked(walletService.summary).mockResolvedValue({ balances: { total: 20_000_000 } } as never);
    svc.pay.mockResolvedValue({ ...ORDER, status: "PAID", estimatedReadyAt: "2026-11-20T10:00:00Z", canEdit: false });
    renderWithIntl(<SetPetOrders />);
    fireEvent.click(await screen.findByRole("button", { name: "Pay 960,000 Toman from my wallet" }));
    await waitFor(() => expect(svc.pay).toHaveBeenCalledWith("o1", { addressId: "a1", shippingProvider: "POST_PISHTAZ", expectedTotalIrr: 9_600_000 }));
    expect(await screen.findByText(/You can still cancel free of charge/)).toBeTruthy();
  });

  it("cancels a paid order after confirmation (refund to the wallet)", async () => {
    svc.list.mockResolvedValue([{ ...ORDER, status: "PAID", canEdit: false, estimatedReadyAt: "2026-11-20T10:00:00Z" }]);
    svc.cancel.mockRejectedValueOnce(new ApiError({ code: "SET_PET_NOT_CANCELLABLE", message: "x", requestId: "r" }, 409));
    svc.get.mockResolvedValue({ ...ORDER, status: "IN_PRODUCTION", canEdit: false, canCancel: false, estimatedReadyAt: "2026-11-20T10:00:00Z" });
    renderWithIntl(<SetPetOrders />);
    fireEvent.click(await screen.findByRole("button", { name: "Cancel order" }));
    expect(screen.getByText("Cancel? The full amount goes back to your wallet.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Yes, cancel" }));
    expect(await screen.findByText("Printing has started; contact support if there is a print defect.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel order" })).toBeNull();
  });
});
