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
  commerceService: {
    getCart: vi.fn(),
    createCheckout: vi.fn(),
    createPaymentIntent: vi.fn(),
    pay: vi.fn(),
    getCheckout: vi.fn(),
    getShippingOptions: vi.fn(),
    refreshShippingOptions: vi.fn(),
    selectShippingQuote: vi.fn(),
    getPaymentOptions: vi.fn(),
    createFinancingIntent: vi.fn(),
    checkFinancingEligibility: vi.fn(),
    getFinancingPlans: vi.fn(),
    selectFinancingPlan: vi.fn(),
    authorizeFinancing: vi.fn(),
  },
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

const SHIPPING_OPTIONS = [
  {
    sellerOrganization: { id: "seller-a", name: "Pet Bazaar Tehran", verificationStatus: "VERIFIED" as never, status: "ACTIVE" as never, city: "Tehran" },
    quotes: [
      { id: "quote-standard", checkoutId: "checkout-1", sellerOrganizationId: "seller-a", provider: "DEV" as never, serviceLevel: "STANDARD", priceIrr: 350_000, estimatedPickupMinutes: 120, estimatedDeliveryMinutes: 1440, status: "AVAILABLE" as never, expiresAt: "2026-01-01T01:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z" },
    ],
  },
];

const CHECKOUT: CheckoutDto = {
  id: "checkout-1",
  status: "READY_FOR_PAYMENT" as never,
  paymentMethodType: null,
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
  vi.mocked(commerceService.getShippingOptions).mockResolvedValue(SHIPPING_OPTIONS);
  vi.mocked(commerceService.getPaymentOptions).mockResolvedValue([
    {
      provider: "DEV_SIMULATED" as never,
      methodType: "ONLINE_PAYMENT" as never,
      capabilities: { supportsDirectPayment: true, supportsInstallments: false, supportsRefund: true, supportsPartialRefund: true, supportsAsyncWebhook: true, supportsEligibilityCheck: false },
    },
  ]);
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

  await waitFor(() => expect(screen.getByText("Choose delivery for each seller")).toBeTruthy());
  fireEvent.click(screen.getByText("Continue"));

  await waitFor(() => expect(screen.getByText("How would you like to pay?")).toBeTruthy());
  fireEvent.click(screen.getByText("Pay online"));

  await waitFor(() => expect(screen.getByText("Payment")).toBeTruthy());
}

async function advanceToInstallmentPlans() {
  vi.mocked(commerceService.getCart).mockResolvedValue(EMPTY_CART);
  vi.mocked(addressesService.list).mockResolvedValue([ADDRESS]);
  vi.mocked(commerceService.createCheckout).mockResolvedValue(CHECKOUT);
  vi.mocked(commerceService.getShippingOptions).mockResolvedValue(SHIPPING_OPTIONS);
  vi.mocked(commerceService.getPaymentOptions).mockResolvedValue([
    {
      provider: "SNAPP_PAY" as never,
      methodType: "INSTALLMENTS" as never,
      capabilities: { supportsDirectPayment: false, supportsInstallments: true, supportsRefund: true, supportsPartialRefund: false, supportsAsyncWebhook: true, supportsEligibilityCheck: true },
    },
  ]);
  vi.mocked(commerceService.createFinancingIntent).mockResolvedValue({
    id: "financing-1",
    checkoutId: CHECKOUT.id,
    provider: "SNAPP_PAY" as never,
    amount: CHECKOUT.totalAmount,
    currency: CHECKOUT.currency,
    status: "CREATED" as never,
    eligibility: null,
    availablePlans: [],
    selectedPlan: null,
    expiresAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  vi.mocked(commerceService.checkFinancingEligibility).mockResolvedValue({ status: "ELIGIBLE" as never });
  vi.mocked(commerceService.getFinancingPlans).mockResolvedValue([
    { providerPlanId: "plan-3", installmentCount: 3, downPaymentAmount: 0, installmentAmount: 425_000, feeAmount: 25_000, totalPayableAmount: 1_275_000, currency: "IRR", firstDueAt: null },
  ]);
  vi.mocked(commerceService.selectFinancingPlan).mockResolvedValue({
    id: "financing-1",
    checkoutId: CHECKOUT.id,
    provider: "SNAPP_PAY" as never,
    amount: CHECKOUT.totalAmount,
    currency: CHECKOUT.currency,
    status: "PLAN_SELECTED" as never,
    eligibility: "ELIGIBLE" as never,
    availablePlans: [],
    selectedPlan: { id: "snapshot-1", providerPlanId: "plan-3", installmentCount: 3, downPaymentAmount: 0, installmentAmount: 425_000, feeAmount: 25_000, totalPayableAmount: 1_275_000, currency: "IRR", firstDueAt: null },
    expiresAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });

  renderWithIntl(<CheckoutView />);

  await waitFor(() => expect(screen.getByText("12 Valiasr St.")).toBeTruthy());
  fireEvent.click(screen.getByText("12 Valiasr St."));
  fireEvent.click(screen.getByText("Continue"));

  await waitFor(() => expect(screen.getByText("Review your order")).toBeTruthy());
  fireEvent.click(screen.getByText("Continue"));

  await waitFor(() => expect(screen.getByText("Choose delivery for each seller")).toBeTruthy());
  fireEvent.click(screen.getByText("Continue"));

  await waitFor(() => expect(screen.getByText("SnappPay")).toBeTruthy());
  fireEvent.click(screen.getByText("SnappPay"));

  await waitFor(() => expect(screen.getByText("You're eligible for installments")).toBeTruthy());
  fireEvent.click(screen.getByText("Continue"));

  await waitFor(() => expect(screen.getByText("Choose a plan")).toBeTruthy());
  fireEvent.click(screen.getByText("3 installments"));

  await waitFor(() => expect(screen.getByText("Confirm installment plan")).toBeTruthy());
}

describe("CheckoutView", () => {
  beforeEach(() => {
    vi.mocked(commerceService.getCart).mockReset();
    vi.mocked(commerceService.createCheckout).mockReset();
    vi.mocked(commerceService.createPaymentIntent).mockReset();
    vi.mocked(commerceService.getShippingOptions).mockReset();
    vi.mocked(commerceService.refreshShippingOptions).mockReset();
    vi.mocked(commerceService.selectShippingQuote).mockReset();
    vi.mocked(commerceService.getPaymentOptions).mockReset();
    vi.mocked(commerceService.createFinancingIntent).mockReset();
    vi.mocked(commerceService.checkFinancingEligibility).mockReset();
    vi.mocked(commerceService.getFinancingPlans).mockReset();
    vi.mocked(commerceService.selectFinancingPlan).mockReset();
    vi.mocked(commerceService.authorizeFinancing).mockReset();
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

  it("walks the BNPL flow to APPROVED and routes to the confirmation page", async () => {
    await advanceToInstallmentPlans();
    vi.mocked(commerceService.authorizeFinancing).mockResolvedValue({
      checkout: { ...CHECKOUT, status: "CONFIRMED" as never },
      paymentStatus: "SUCCEEDED",
      orderIds: ["order-1"],
    });

    fireEvent.click(screen.getByText("Simulate approval"));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/en/checkout/checkout-1/confirmation?orders=order-1"));
  });

  it("shows a non-shaming declined screen with a path back to another payment method", async () => {
    await advanceToInstallmentPlans();
    vi.mocked(commerceService.authorizeFinancing).mockResolvedValue({
      checkout: CHECKOUT,
      paymentStatus: "FAILED",
      failureMessage: "The installment provider did not approve this request.",
      orderIds: [],
    });

    fireEvent.click(screen.getByText("Simulate decline"));

    await waitFor(() => expect(screen.getByText("Installment request was not approved")).toBeTruthy());
    expect(screen.getByText("The installment provider did not approve this request.")).toBeTruthy();
    expect(screen.getByText("Try another provider")).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  it("lets the customer select a shipping option per seller, recalculating the total before choosing a payment method", async () => {
    vi.mocked(commerceService.getCart).mockResolvedValue(EMPTY_CART);
    vi.mocked(addressesService.list).mockResolvedValue([ADDRESS]);
    vi.mocked(commerceService.createCheckout).mockResolvedValue(CHECKOUT);
    vi.mocked(commerceService.getShippingOptions).mockResolvedValue(SHIPPING_OPTIONS);
    vi.mocked(commerceService.selectShippingQuote).mockResolvedValue([{ ...SHIPPING_OPTIONS[0]!, quotes: [{ ...SHIPPING_OPTIONS[0]!.quotes[0]!, status: "SELECTED" as never }] }]);
    vi.mocked(commerceService.getCheckout).mockResolvedValue({ ...CHECKOUT, deliveryAmount: 350_000, totalAmount: 1_600_000 });

    renderWithIntl(<CheckoutView />);
    await waitFor(() => expect(screen.getByText("12 Valiasr St.")).toBeTruthy());
    fireEvent.click(screen.getByText("12 Valiasr St."));
    fireEvent.click(screen.getByText("Continue"));

    await waitFor(() => expect(screen.getByText("Review your order")).toBeTruthy());
    fireEvent.click(screen.getByText("Continue"));

    await waitFor(() => expect(screen.getByText("Standard delivery")).toBeTruthy());
    fireEvent.click(screen.getByText("Standard delivery"));

    await waitFor(() => expect(commerceService.selectShippingQuote).toHaveBeenCalledWith("checkout-1", "quote-standard"));
    await waitFor(() => expect(screen.getByText("Selected")).toBeTruthy());
  });

  it("refreshes shipping options on demand rather than relying on a frontend-only timer", async () => {
    vi.mocked(commerceService.getCart).mockResolvedValue(EMPTY_CART);
    vi.mocked(addressesService.list).mockResolvedValue([ADDRESS]);
    vi.mocked(commerceService.createCheckout).mockResolvedValue(CHECKOUT);
    vi.mocked(commerceService.getShippingOptions).mockResolvedValue(SHIPPING_OPTIONS);
    vi.mocked(commerceService.refreshShippingOptions).mockResolvedValue(SHIPPING_OPTIONS);

    renderWithIntl(<CheckoutView />);
    await waitFor(() => expect(screen.getByText("12 Valiasr St.")).toBeTruthy());
    fireEvent.click(screen.getByText("12 Valiasr St."));
    fireEvent.click(screen.getByText("Continue"));

    await waitFor(() => expect(screen.getByText("Review your order")).toBeTruthy());
    fireEvent.click(screen.getByText("Continue"));

    await waitFor(() => expect(screen.getByText("Refresh delivery options")).toBeTruthy());
    fireEvent.click(screen.getByText("Refresh delivery options"));

    await waitFor(() => expect(commerceService.refreshShippingOptions).toHaveBeenCalledWith("checkout-1"));
  });

  it("shows an unavailable state instead of a broken list when a seller has no shipping options", async () => {
    vi.mocked(commerceService.getCart).mockResolvedValue(EMPTY_CART);
    vi.mocked(addressesService.list).mockResolvedValue([ADDRESS]);
    vi.mocked(commerceService.createCheckout).mockResolvedValue(CHECKOUT);
    vi.mocked(commerceService.getShippingOptions).mockResolvedValue([{ sellerOrganization: SHIPPING_OPTIONS[0]!.sellerOrganization, quotes: [] }]);

    renderWithIntl(<CheckoutView />);
    await waitFor(() => expect(screen.getByText("12 Valiasr St.")).toBeTruthy());
    fireEvent.click(screen.getByText("12 Valiasr St."));
    fireEvent.click(screen.getByText("Continue"));

    await waitFor(() => expect(screen.getByText("Review your order")).toBeTruthy());
    fireEvent.click(screen.getByText("Continue"));

    await waitFor(() => expect(screen.getByText("No delivery options available right now")).toBeTruthy());
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
