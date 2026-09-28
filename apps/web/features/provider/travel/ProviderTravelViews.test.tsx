import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { TravelBookingDto, TravelProviderFinanceDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { travelProviderService } from "@/services/travel-marketplace.service";
import { ProviderTravelBookingDetailView, ProviderTravelFinanceView } from "./ProviderTravelViews";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), usePathname: () => "/en/provider/travel/bookings/b1" }));
vi.mock("@/services/travel-marketplace.service", () => ({ travelProviderService: { booking: vi.fn(), accept: vi.fn(), reject: vi.fn(), documentUrl: vi.fn(), finance: vi.fn() } }));

const BOOKING = {
  id: "b1", reference: "TRV-9", listingId: "l1", listingTitle: "Garden Villa", listingType: "VILLA", bookingMode: "REQUEST_TO_BOOK", listingCity: "Karaj", unitId: "u1", unitName: "Whole villa", householdId: "h", bookedByUserId: "u", tripId: null, status: "AWAITING_PROVIDER", checkIn: "2026-11-01", checkOut: "2026-11-03", nights: 2, guests: 2,
  pets: [{ petId: "p1", petName: "Milo", petSpecies: "DOG" }], baseAmountIrr: 10_000_000, petFeeAmountIrr: 0, depositAmountIrr: 0, totalAmountIrr: 10_000_000, cancellationPolicySnapshot: null, providerNote: null, travelerNote: "Arriving late", requestedAt: "", respondedAt: null, confirmedAt: null, cancelledAt: null, completedAt: null, createdAt: "", updatedAt: "",
  ratePlanId: null, ratePlan: null, petPolicySnapshot: null, priceBreakdown: null, discountAmountIrr: 0, payNowAmountIrr: 10_000_000, paymentStatus: "NOT_REQUIRED", holdExpiresAt: null, requestExpiresAt: "2026-10-01T00:00:00.000Z", refundAmountIrr: 0, cancelReason: null, cancelledBy: null, listingCoverUrl: null,
  timeline: [], canCancel: false, canModify: false, canReview: false, reviewId: null, refundPreviewIrr: null, documentShares: [],
} as unknown as TravelBookingDto;

describe("provider travel", () => {
  it("shows only pet names and species, and requires a reason to decline", async () => {
    vi.mocked(travelProviderService.booking).mockResolvedValue(BOOKING);
    vi.mocked(travelProviderService.reject).mockResolvedValue({ ...BOOKING, status: "REJECTED" } as TravelBookingDto);
    renderWithIntl(<ProviderTravelBookingDetailView bookingId="b1" />, "en");
    expect(await screen.findByText(/Milo \(dog\)/)).toBeTruthy();
    expect(screen.getByText(/No documents shared/)).toBeTruthy();
    const decline = screen.getByRole("button", { name: "Decline" }) as HTMLButtonElement;
    expect(decline.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Reason for declining/), { target: { value: "Fully booked for renovation" } });
    fireEvent.click(decline);
    await waitFor(() => expect(travelProviderService.reject).toHaveBeenCalledWith("b1", "Fully booked for renovation"));
  });

  it("finance never invents a payout figure", async () => {
    vi.mocked(travelProviderService.finance).mockResolvedValue({ from: "", to: "", bookingCount: 0, bookedValueIrr: 0, paidOnlineIrr: 0, refundedIrr: 0, netCollectedIrr: 0, payAtPropertyIrr: 0, rows: [], settlementNote: "PAYOUTS_NOT_AUTOMATED" } as TravelProviderFinanceDto);
    renderWithIntl(<ProviderTravelFinanceView />, "en");
    expect(await screen.findByText(/Payouts to properties are not automated yet/)).toBeTruthy();
    expect(screen.queryByText(/payout amount/i)).toBeNull();
  });
});
