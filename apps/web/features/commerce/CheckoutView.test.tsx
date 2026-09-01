import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import type { CartDto, CheckoutDto, CustomerAddressDto } from "@petlife/types";
import { renderWithIntl } from "@/test/render-with-intl";
import { commerceService } from "@/services/commerce.service";
import { addressesService } from "@/services/addresses.service";
import { ApiError } from "@/lib/api/client";
import { CheckoutView } from "./CheckoutView";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/hooks/use-active-pet", () => ({ useActivePet: () => ({ householdId: "household-1" }) }));
vi.mock("@/services/commerce.service", () => ({
  commerceService: { getCart: vi.fn(), createCheckout: vi.fn(), createPaymentIntent: vi.fn(), pay: vi.fn(), getCheckout: vi.fn() },
}));
vi.mock("@/services/addresses.service", () => ({ addressesService: { list: vi.fn() } }));

const ADDRESS: CustomerAddressDto = {
  id: "address-1",
  householdId: "household-1",
  label: null,
  recipient: null,
  phone: null,
  addressLine: "12 Valiasr St.",
  city: "Tehran",
  region: null,
  countryCode: "IR",
  latitude: null,
  longitude: null,
  instructions: null,
};

const EMPTY_CART: CartDto = { id: "cart-1", status: "ACTIVE" as never, totalItems: 1, subtotalAmount: 100, currency: "IRR", hasSafetyConflict: false, sellerGroups: [] };

const CHECKOUT: CheckoutDto = {
  id: "checkout-1",
  status: "READY_FOR_PAYMENT" as never,
  addressId: "address-1",
  deliveryMethod: "STANDARD" as never,
  subtotalAmount: 1_250_000,
  deliveryAmount: 0,
  discountAmount: 0,
  totalAmount: 1_250_000,
  currency: "IRR",
  sellerGroups: [
    {
      sellerOrganization: { id: "seller-a", name: "Pet Bazaar Tehran", verificationStatus: "VERIFIED" as never, status: "ACTIVE" as never, city: "Tehran" },
      subtotalAmount: 1_250_000,
      lines: [
        {
          id: "line-a",
          sellerOffer: {} as never,
          productId: "prod-1",
          productTitle: "Royal Canin Adult Dog Food",
          variantTitle: "2kg",
          variantSku: "RC-DOG-2KG",
          targetPetId: "pet-1",
          targetPetName: "Luna",
          quantity: 1,
          unitPriceSnapshot: 1_250_000,
          currentPriceAmount: 1_250_000,
          priceChanged: false,
          currency: "IRR",
          lineTotal: 1_250_000,
          compatibility: null,
        },
      ],
    },
  ],
  expiresAt: "2026-01-01T00:15:00.000Z",
  validationIssues: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

async function advanceToPayment() {
  vi.mocked(commerceService.getCart).mockResolvedValue(EMPTY_CART);
  vi.mocked(addressesService.list).mockResolvedValue([ADDRESS]);
  vi.mocked(commerceService.createCheckout).mockResolvedValue(CHECKOUT);
  vi.mocked(commerceService.createPaymentIntent).mockResolvedValue({
    id: "intent-1",
    checkoutId: CHECKOUT.id,
    amount: CHECKOUT.totalAmount,
    currency: CHECKOUT.currency,
    status: "REQUIRES_PAYMENT_METHOD" as never,
    provider: "DEV_SIMULATED" as never,
  });

  renderWithIntl(<CheckoutView />);

  await waitFor(() => expect(screen.getByText("12 Valiasr St.")).toBeTruthy());
  fireEvent.click(screen.getByText("12 Valiasr St."));
  fireEvent.click(screen.getByText("Continue"));

  await waitFor(() => expect(screen.getByText("Review your order")).toBeTruthy());
  fireEvent.click(screen.getByText("Continue"));

  await waitFor(() => expect(screen.getByText("Payment")).toBeTruthy());
}

describe("CheckoutView", () => {
  beforeEach(() => {
    vi.mocked(commerceService.getCart).mockReset();
    vi.mocked(commerceService.createCheckout).mockReset();
    vi.mocked(commerceService.createPaymentIntent).mockReset();
    vi.mocked(commerceService.pay).mockReset();
    vi.mocked(commerceService.getCheckout).mockReset();
    vi.mocked(addressesService.list).mockReset();
    push.mockReset();
  });

  it("routes to the confirmation page on a successful simulated payment", async () => {
    await advanceToPayment();
    vi.mocked(commerceService.pay).mockResolvedValue({ checkout: { ...CHECKOUT, status: "CONFIRMED" as never }, paymentStatus: "SUCCEEDED", orderIds: ["order-1", "order-2"] });

    fireEvent.click(screen.getByText("Simulate successful payment"));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/en/checkout/checkout-1/confirmation?orders=order-1,order-2"));
  });

  it("shows a pending state without confirming any order", async () => {
    await advanceToPayment();
    vi.mocked(commerceService.pay).mockResolvedValue({ checkout: { ...CHECKOUT, status: "PAYMENT_PENDING" as never }, paymentStatus: "PENDING", orderIds: [] });

    fireEvent.click(screen.getByText("Simulate pending payment"));

    await waitFor(() => expect(screen.getByText("Payment pending")).toBeTruthy());
    expect(push).not.toHaveBeenCalled();
  });

  it("shows a non-alarming failure state that preserves the cart and offers a retry", async () => {
    await advanceToPayment();
    vi.mocked(commerceService.pay).mockResolvedValue({ checkout: CHECKOUT, paymentStatus: "FAILED", failureMessage: "The card was declined.", orderIds: [] });

    fireEvent.click(screen.getByText("Simulate failed payment"));

    await waitFor(() => expect(screen.getByText("Payment failed")).toBeTruthy());
    expect(screen.getByText("The card was declined.")).toBeTruthy();
    expect(screen.getByText("Nothing was charged, and your cart has been preserved.")).toBeTruthy();
    expect(screen.getByText("Try again")).toBeTruthy();
    expect(screen.getByText("Return to cart")).toBeTruthy();
  });

  it("returns to the payment step for a retry after a failure", async () => {
    await advanceToPayment();
    vi.mocked(commerceService.pay).mockResolvedValue({ checkout: CHECKOUT, paymentStatus: "FAILED", failureMessage: "The card was declined.", orderIds: [] });
    fireEvent.click(screen.getByText("Simulate failed payment"));
    await waitFor(() => expect(screen.getByText("Try again")).toBeTruthy());

    fireEvent.click(screen.getByText("Try again"));

    await waitFor(() => expect(screen.getByText("Payment")).toBeTruthy());
  });

  it("prompts for explicit acknowledgement on a potential safety conflict, then retries with it set", async () => {
    vi.mocked(commerceService.getCart).mockResolvedValue(EMPTY_CART);
    vi.mocked(addressesService.list).mockResolvedValue([ADDRESS]);
    vi.mocked(commerceService.createCheckout)
      .mockRejectedValueOnce(new ApiError({ code: "SAFETY_CONFLICT", message: "conflict", requestId: "r1" }, 400))
      .mockResolvedValueOnce(CHECKOUT);

    renderWithIntl(<CheckoutView />);
    await waitFor(() => expect(screen.getByText("12 Valiasr St.")).toBeTruthy());
    fireEvent.click(screen.getByText("12 Valiasr St."));
    fireEvent.click(screen.getByText("Continue"));

    await waitFor(() => expect(screen.getByText("Potential safety conflict")).toBeTruthy());
    fireEvent.click(screen.getByText("I understand, continue"));

    await waitFor(() => expect(screen.getByText("Review your order")).toBeTruthy());
    expect(commerceService.createCheckout).toHaveBeenLastCalledWith(
      expect.objectContaining({ acknowledgeSafetyConflict: true }),
      expect.any(String),
    );
  });
});
