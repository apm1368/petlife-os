"use client";

import { type ReactNode, useEffect, useState } from "react";
import { randomId } from "@/lib/id/random-id";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, Input, Skeleton, StatusLabel } from "@petlife/ui";
import {
  DeliveryMethod,
  type CartDto,
  type CheckoutDto,
  type CustomerAddressDto,
  type FinancingIntentDto,
  type FinancingPlanOptionDto,
  type PaymentMethodOptionDto,
  type PaymentProvider,
  type SellerShippingOptionsDto,
  type ShippingQuoteDto,
} from "@petlife/types";
import { useActivePet } from "@/hooks/use-active-pet";
import { commerceService } from "@/services/commerce.service";
import { addressesService } from "@/services/addresses.service";
import { formatCurrency } from "@/lib/currency/format-currency";
import { ApiError } from "@/lib/api/client";
import { apiErrorText } from "@/lib/errors/api-error-text";
import { Stepper } from "@/features/shared/Stepper";
import { formatCount } from "@/lib/number/format-number";
import { localizeDigits } from "@/lib/date/jalali";
import { isolate } from "@/lib/text/bidi";

type Step =
  | "address"
  | "safety-ack"
  | "review"
  | "shipping"
  | "method"
  | "payment"
  | "financing-eligibility"
  | "financing-plans"
  | "financing-authorize"
  | "submitting"
  | "pending"
  | "financing-declined"
  | "failed";

const IS_DEV = process.env.NODE_ENV !== "production";

function toLatinDigits(value: string): string {
  return value.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/\s/g, "");
}

/**
 * Checkout (spec sections 56-59, Handoff 07 sections 11-16, 36-43) — one
 * route, internal steps. Address/Delivery -> Review -> Method (Online
 * Payment vs Installments, capability-driven, never a provider that isn't
 * enabled) -> Payment or the Financing sub-flow (eligibility if the
 * provider supports it -> plans -> authorize) -> Pending or
 * Declined/Failed (always recoverable, never a dead end) -> Confirmation
 * (separate route, reached only after a CONFIRMED checkout — never from a
 * browser-side redirect parameter alone).
 */
export function CheckoutView() {
  const t = useTranslations("commerce.checkout");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const locale = useLocale() as "fa" | "en";
  const progress = (current: number) => (
    <Stepper steps={locale === "fa" ? ["نشانی", "بازبینی", "ارسال", "پرداخت"] : ["Address", "Review", "Delivery", "Payment"]} current={current} label={locale === "fa" ? "مراحل تسویه" : "Checkout steps"} />
  );
  const { householdId } = useActivePet();

  const [step, setStep] = useState<Step>("address");
  const [cart, setCart] = useState<CartDto | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddressDto[] | null>(null);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<CheckoutDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failureMessage, setFailureMessage] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => randomId());
  const [paymentIntentIdempotencyKey, setPaymentIntentIdempotencyKey] = useState(() => randomId());
  const [payIdempotencyKey, setPayIdempotencyKey] = useState(() => randomId());
  const [newAddress, setNewAddress] = useState({ recipient: "", phone: "", addressLine: "", city: "", postalCode: "", countryCode: "IR" });
  const [addressFormOpen, setAddressFormOpen] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [isCreatingAddress, setIsCreatingAddress] = useState(false);

  const [shippingOptions, setShippingOptions] = useState<SellerShippingOptionsDto[] | null>(null);
  const [shippingQuoteSelectingId, setShippingQuoteSelectingId] = useState<string | null>(null);
  const [paymentOptions, setPaymentOptions] = useState<PaymentMethodOptionDto[] | null>(null);
  const [financingIntent, setFinancingIntent] = useState<FinancingIntentDto | null>(null);
  const [financingIdempotencyKey, setFinancingIdempotencyKey] = useState(() => randomId());
  const [authorizeIdempotencyKey, setAuthorizeIdempotencyKey] = useState(() => randomId());
  const [plans, setPlans] = useState<FinancingPlanOptionDto[] | null>(null);

  useEffect(() => {
    void commerceService.getCart().then(setCart);
    if (householdId)
      void addressesService.list(householdId).then((list) => {
        setAddresses(list);
        // The household default is preselected; the customer can still pick another.
        setAddressId((current) => current ?? list.find((a) => a.isDefault)?.id ?? list[0]?.id ?? null);
        setAddressFormOpen(list.length === 0);
      });
  }, [householdId]);

  async function createAddress() {
    if (!householdId) return;
    setIsCreatingAddress(true);
    setAddressError(null);
    try {
      const address = await addressesService.create({
        householdId,
        addressLine: newAddress.addressLine.trim(),
        city: newAddress.city.trim(),
        countryCode: newAddress.countryCode,
        recipient: newAddress.recipient.trim() || undefined,
        phone: newAddress.phone.trim() || undefined,
        postalCode: toLatinDigits(newAddress.postalCode) || undefined,
      });
      setAddresses((prev) => [address, ...(prev ?? []).map((a) => (address.isDefault ? { ...a, isDefault: false } : a))]);
      setAddressId(address.id);
      setAddressFormOpen(false);
      setNewAddress({ recipient: "", phone: "", addressLine: "", city: "", postalCode: "", countryCode: "IR" });
    } catch (err) {
      setAddressError(err instanceof ApiError && err.status < 500 ? err.message : t("address.saveFailed"));
    } finally {
      setIsCreatingAddress(false);
    }
  }

  async function createCheckout(acknowledgeSafetyConflict = false) {
    setError(null);
    setStep("submitting");
    try {
      const result = await commerceService.createCheckout({ addressId: addressId ?? undefined, deliveryMethod: DeliveryMethod.STANDARD, acknowledgeSafetyConflict }, idempotencyKey);
      setCheckout(result);
      setStep("review");
    } catch (err) {
      if (err instanceof ApiError && err.code === "SAFETY_CONFLICT") {
        setStep("safety-ack");
        return;
      }
      if (err instanceof ApiError && err.code === "CART_EMPTY") {
        router.push(`/${locale}/cart`);
        return;
      }
      setError(apiErrorText(err, locale, t("createFailed")));
      setStep("address");
    }
  }

  async function enterShippingStep() {
    if (!checkout) return;
    setStep("submitting");
    try {
      const options = await commerceService.getShippingOptions(checkout.id);
      setShippingOptions(options);
      setStep("shipping");
    } catch (err) {
      setError(apiErrorText(err, locale, t("createFailed")));
      setStep("review");
    }
  }

  async function selectShippingQuote(quoteId: string) {
    if (!checkout) return;
    setShippingQuoteSelectingId(quoteId);
    setError(null);
    try {
      const [options, updatedCheckout] = await Promise.all([commerceService.selectShippingQuote(checkout.id, quoteId), commerceService.getCheckout(checkout.id)]);
      setShippingOptions(options);
      setCheckout(updatedCheckout);
    } catch (err) {
      setError(apiErrorText(err, locale, t("createFailed")));
    } finally {
      setShippingQuoteSelectingId(null);
    }
  }

  async function refreshShippingOptions() {
    if (!checkout) return;
    setError(null);
    try {
      const options = await commerceService.refreshShippingOptions(checkout.id);
      setShippingOptions(options);
    } catch (err) {
      setError(apiErrorText(err, locale, t("createFailed")));
    }
  }

  async function enterMethodStep() {
    if (!checkout) return;
    setStep("submitting");
    try {
      const options = await commerceService.getPaymentOptions(checkout.id);
      setPaymentOptions(options);
      setStep("method");
    } catch (err) {
      setError(apiErrorText(err, locale, t("createFailed")));
      setStep("review");
    }
  }

  async function chooseOnlinePayment(provider: PaymentProvider) {
    if (!checkout) return;
    setStep("submitting");
    try {
      await commerceService.createPaymentIntent(checkout.id, provider, paymentIntentIdempotencyKey);
      setStep("payment");
    } catch (err) {
      setError(apiErrorText(err, locale, t("createFailed")));
      setStep("method");
    }
  }

  async function chooseInstallments(option: PaymentMethodOptionDto) {
    if (!checkout) return;
    setStep("submitting");
    try {
      const intent = await commerceService.createFinancingIntent(checkout.id, option.provider, financingIdempotencyKey);
      setFinancingIntent(intent);
      if (option.capabilities.supportsEligibilityCheck) {
        setStep("financing-eligibility");
        const { status } = await commerceService.checkFinancingEligibility(checkout.id, intent.id);
        setFinancingIntent((prev) => (prev ? { ...prev, eligibility: status } : prev));
      } else {
        await loadPlans(intent.id);
      }
    } catch (err) {
      setError(apiErrorText(err, locale, t("createFailed")));
      setStep("method");
    }
  }

  async function loadPlans(financingId: string) {
    if (!checkout) return;
    const list = await commerceService.getFinancingPlans(checkout.id, financingId);
    setPlans(list);
    setStep("financing-plans");
  }

  async function selectPlan(plan: FinancingPlanOptionDto) {
    if (!checkout || !financingIntent) return;
    setStep("submitting");
    try {
      const updated = await commerceService.selectFinancingPlan(checkout.id, financingIntent.id, plan.providerPlanId);
      setFinancingIntent(updated);
      setStep("financing-authorize");
    } catch (err) {
      setError(apiErrorText(err, locale, t("createFailed")));
      setStep("financing-plans");
    }
  }

  async function authorizeFinancing(mode?: "APPROVE" | "DECLINE" | "PENDING") {
    if (!checkout || !financingIntent) return;
    setStep("submitting");
    setFailureMessage(null);
    try {
      const result = await commerceService.authorizeFinancing(checkout.id, financingIntent.id, mode, authorizeIdempotencyKey);
      setCheckout(result.checkout);
      if (result.paymentStatus === "SUCCEEDED") {
        router.push(`/${locale}/checkout/${checkout.id}/confirmation?orders=${result.orderIds.join(",")}`);
      } else if (result.paymentStatus === "PENDING") {
        setStep("pending");
      } else {
        setFailureMessage(result.failureMessage ?? t("financingDeclined.generic"));
        setStep("financing-declined");
      }
    } catch (err) {
      setFailureMessage(apiErrorText(err, locale, t("financingDeclined.generic")));
      setStep("financing-declined");
    }
  }

  function retryFinancingAuthorization() {
    setAuthorizeIdempotencyKey(randomId());
    setStep("financing-authorize");
  }

  function backToMethodChoice() {
    setFinancingIntent(null);
    setPlans(null);
    setFinancingIdempotencyKey(randomId());
    void enterMethodStep();
  }

  async function pay(mode?: "SUCCESS" | "FAILURE" | "PENDING") {
    if (!checkout) return;
    setStep("submitting");
    setFailureMessage(null);
    try {
      const result = await commerceService.pay(checkout.id, mode, payIdempotencyKey);
      setCheckout(result.checkout);
      if (result.paymentStatus === "SUCCEEDED") {
        router.push(`/${locale}/checkout/${checkout.id}/confirmation?orders=${result.orderIds.join(",")}`);
      } else if (result.paymentStatus === "PENDING") {
        setStep("pending");
      } else {
        setFailureMessage(result.failureMessage ?? t("paymentFailed.generic"));
        setStep("failed");
      }
    } catch (err) {
      setFailureMessage(apiErrorText(err, locale, t("paymentFailed.generic")));
      setStep("failed");
    }
  }

  async function checkPendingStatus() {
    if (!checkout) return;
    const latest = await commerceService.getCheckout(checkout.id);
    setCheckout(latest);
    if (latest.status === "CONFIRMED") {
      router.push(`/${locale}/checkout/${checkout.id}/confirmation`);
    }
  }

  function retryPayment() {
    setPayIdempotencyKey(randomId());
    setStep("payment");
  }

  function switchToInstallments() {
    setPaymentIntentIdempotencyKey(randomId());
    void enterMethodStep();
  }

  if (!cart || (householdId && !addresses)) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  // Once delivery is chosen the checkout carries the real totals; before that the cart is the summary.
  const priced = checkout && (step === "method" || step === "payment" || step.startsWith("financing-"));
  const frame = (body: ReactNode) => (
    <div className="flow-layout">
      <div className="flow-main">{body}</div>
      <CheckoutSummary cart={cart} checkout={priced ? checkout : null} />
    </div>
  );

  if (step === "address") {
    return frame(
      <div className="flex flex-col gap-5">
        {progress(0)}
        <h1 className="text-page-title text-text-primary">{t("address.title")}</h1>
        {error ? (
          <p role="alert" className="text-metadata text-state-urgent">
            {error}
          </p>
        ) : null}

        {!householdId ? <p className="text-body text-text-secondary">{t("address.noHousehold")}</p> : null}

        <div className="flex flex-col gap-2" role="radiogroup" aria-label={t("address.title")}>
          {(addresses ?? []).map((address) => (
            <button key={address.id} type="button" role="radio" aria-checked={addressId === address.id} className="w-full text-start" onClick={() => setAddressId(address.id)}>
              <ContextSurface className={`flex flex-col gap-0.5 ${addressId === address.id ? "border-brand-natural" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-body font-medium text-text-primary">{address.label ?? address.recipient ?? address.city}</p>
                  {address.isDefault ? <StatusLabel tone="neutral">{t("address.default")}</StatusLabel> : null}
                </div>
                <p className="text-metadata text-text-secondary">{[address.city, address.addressLine].filter(Boolean).join(locale === "fa" ? "، " : ", ")}</p>
                {address.postalCode || address.recipient ? (
                  <p className="text-metadata text-text-secondary">{[address.recipient, address.postalCode ? t("address.postalCodeValue", { code: localizeDigits(address.postalCode, locale) }) : null].filter(Boolean).join(" · ")}</p>
                ) : null}
              </ContextSurface>
            </button>
          ))}
        </div>

        {householdId && !addressFormOpen ? (
          <Button variant="ghost" onClick={() => setAddressFormOpen(true)}>
            {t("address.addNew")}
          </Button>
        ) : null}

        {householdId && addressFormOpen ? (
          <ContextSurface className="flex flex-col gap-3">
            <p className="text-section-title text-text-primary">{t("address.addNew")}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label={t("address.recipient")} value={newAddress.recipient} autoComplete="name" onChange={(e) => setNewAddress({ ...newAddress, recipient: e.target.value })} />
              <Input label={t("address.phone")} value={newAddress.phone} inputMode="tel" autoComplete="tel" onChange={(e) => setNewAddress({ ...newAddress, phone: e.target.value })} />
              <Input label={t("address.city")} value={newAddress.city} autoComplete="address-level2" onChange={(e) => setNewAddress({ ...newAddress, city: e.target.value })} />
              <Input
                label={t("address.postalCode")}
                value={newAddress.postalCode}
                inputMode="numeric"
                autoComplete="postal-code"
                hint={t("address.postalCodeHint")}
                errorMessage={newAddress.postalCode && !/^\d{10}$/.test(toLatinDigits(newAddress.postalCode)) ? t("address.postalCodeInvalid") : undefined}
                onChange={(e) => setNewAddress({ ...newAddress, postalCode: e.target.value })}
              />
            </div>
            <Input label={t("address.addressLine")} value={newAddress.addressLine} autoComplete="street-address" onChange={(e) => setNewAddress({ ...newAddress, addressLine: e.target.value })} />
            {addressError ? (
              <p role="alert" className="text-metadata text-state-urgent">
                {addressError}
              </p>
            ) : null}
            <div className="flex gap-2">
              {(addresses ?? []).length ? (
                <Button variant="ghost" onClick={() => setAddressFormOpen(false)}>
                  {tCommon("back")}
                </Button>
              ) : null}
              <Button
                variant="secondary"
                className="flex-1"
                isLoading={isCreatingAddress}
                onClick={createAddress}
                disabled={!newAddress.addressLine.trim() || !newAddress.city.trim() || (Boolean(newAddress.postalCode) && !/^\d{10}$/.test(toLatinDigits(newAddress.postalCode)))}
              >
                {t("address.save")}
              </Button>
            </div>
          </ContextSurface>
        ) : null}

        <p className="text-metadata text-text-secondary">{t("delivery.quotesNext")}</p>

        <Button variant="primary" disabled={!addressId} onClick={() => createCheckout(false)}>
          {tCommon("continue")}
        </Button>
      </div>
    );
  }

  if (step === "safety-ack") {
    return frame(
      <div className="flex flex-col gap-5">
        {progress(1)}
        <h1 className="text-page-title text-text-primary">{t("safetyAck.title")}</h1>
        <ContextSurface className="flex flex-col gap-2">
          <StatusLabel tone="urgent">{t("safetyAck.warning")}</StatusLabel>
          <p className="text-body text-text-secondary">{t("safetyAck.description")}</p>
        </ContextSurface>
        <div className="flex gap-3">
          <Button variant="ghost" onClick={() => setStep("address")}>
            {tCommon("back")}
          </Button>
          <Button variant="primary" className="flex-1" onClick={() => createCheckout(true)}>
            {t("safetyAck.acknowledge")}
          </Button>
        </div>
      </div>
    );
  }

  if (step === "submitting" || !checkout) {
    return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;
  }

  if (step === "review") {
    return frame(
      <div className="flex flex-col gap-5">
        {progress(1)}
        <h1 className="text-page-title text-text-primary">{t("review.title")}</h1>

        {checkout.validationIssues.map((issue) => (
          <StatusLabel key={issue.code} tone="attention">
            {issue.message}
          </StatusLabel>
        ))}

        {checkout.sellerGroups.map((group) => (
          <ContextSurface key={group.sellerOrganization.id} className="flex flex-col gap-2">
            <p className="text-body font-medium text-text-primary">{group.sellerOrganization.name}</p>
            {group.lines.map((line) => (
              <div key={line.id} className="flex items-center justify-between gap-3">
                <span className="text-metadata text-text-secondary">
                  {line.productTitle} × {line.quantity}
                </span>
                <span className="text-metadata text-text-primary">{formatCurrency(line.lineTotal, locale)}</span>
              </div>
            ))}
          </ContextSurface>
        ))}

        <ContextSurface className="flex flex-col gap-2">
          <Row label={t("review.subtotal")} value={formatCurrency(checkout.subtotalAmount, locale)} />
          {checkout.discountAmount > 0 ? <Row label={t("review.discount")} value={`− ${formatCurrency(checkout.discountAmount, locale)}`} /> : null}
          <Row label={t("review.delivery")} value={formatCurrency(checkout.deliveryAmount, locale)} />
          <Row label={t("review.total")} value={formatCurrency(checkout.totalAmount, locale)} />
        </ContextSurface>

        <div className="flex gap-3">
          <Button variant="ghost" onClick={() => setStep("address")}>
            {tCommon("back")}
          </Button>
          <Button variant="primary" className="flex-1" onClick={enterShippingStep}>
            {tCommon("continue")}
          </Button>
        </div>
      </div>
    );
  }

  if (step === "shipping") {
    return frame(
      <div className="flex flex-col gap-5">
        {progress(2)}
        <h1 className="text-page-title text-text-primary">{t("shipping.title")}</h1>
        {error ? (
          <p role="alert" className="text-metadata text-state-urgent">
            {error}
          </p>
        ) : null}

        {(shippingOptions ?? []).map((group) => {
          const bestByServiceLevel = new Map<string, ShippingQuoteDto>();
          for (const quote of group.quotes) if (!bestByServiceLevel.has(quote.serviceLevel)) bestByServiceLevel.set(quote.serviceLevel, quote);
          const selected = group.quotes.find((q) => q.status === "SELECTED");

          return (
            <div key={group.sellerOrganization.id} className="flex flex-col gap-2">
              <p className="text-section-title text-text-primary">{group.sellerOrganization.name}</p>
              {[...bestByServiceLevel.values()].length === 0 ? <StatusLabel tone="attention">{t("shipping.unavailable")}</StatusLabel> : null}
              {[...bestByServiceLevel.values()].map((quote) => {
                const isSelected = quote.id === selected?.id || quote.serviceLevel === selected?.serviceLevel;
                const isLoading = shippingQuoteSelectingId === quote.id;
                return (
                  <button key={quote.id} type="button" className="w-full text-start" disabled={isLoading} onClick={() => selectShippingQuote(quote.id)}>
                    <ContextSurface className={`flex items-center justify-between gap-3 ${isSelected ? "border-brand-mint" : ""}`}>
                      <div className="flex flex-col">
                        <span className="text-body text-text-primary">{t(`shipping.serviceLevel.${quote.serviceLevel}` as "shipping.serviceLevel.STANDARD" | "shipping.serviceLevel.EXPRESS")}</span>
                        {quote.estimatedDeliveryMinutes != null ? (
                          <span className="text-metadata text-text-secondary">{t("shipping.eta", { hours: Math.max(1, Math.round(quote.estimatedDeliveryMinutes / 60)) })}</span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-metadata text-text-primary">{formatCurrency(quote.priceIrr, locale)}</span>
                        {isSelected ? <StatusLabel tone="success">{t("shipping.selected")}</StatusLabel> : null}
                      </div>
                    </ContextSurface>
                  </button>
                );
              })}
            </div>
          );
        })}

        <Button variant="ghost" onClick={refreshShippingOptions}>
          {t("shipping.refresh")}
        </Button>

        <div className="flex gap-3">
          <Button variant="ghost" onClick={() => setStep("review")}>
            {tCommon("back")}
          </Button>
          <Button variant="primary" className="flex-1" onClick={enterMethodStep}>
            {tCommon("continue")}
          </Button>
        </div>
      </div>
    );
  }

  if (step === "method") {
    const onlineOptions = (paymentOptions ?? []).filter((o) => o.methodType === "ONLINE_PAYMENT");
    const installmentOptions = (paymentOptions ?? []).filter((o) => o.methodType === "INSTALLMENTS");
    return frame(
      <div className="flex flex-col gap-5">
        {progress(3)}
        <h1 className="text-page-title text-text-primary">{t("method.title")}</h1>
        {error ? (
          <p role="alert" className="text-metadata text-state-urgent">
            {error}
          </p>
        ) : null}

        {onlineOptions.length > 0 && onlineOptions[0] ? (
          <button type="button" className="w-full text-start" onClick={() => chooseOnlinePayment(onlineOptions[0]!.provider)}>
            <ContextSurface className="flex items-center justify-between gap-3">
              <span className="text-body text-text-primary">{t("method.onlinePayment")}</span>
              <span className="text-metadata text-text-secondary">{formatCurrency(checkout.totalAmount, locale)}</span>
            </ContextSurface>
          </button>
        ) : null}

        {installmentOptions.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-section-title text-text-primary">{t("method.installments")}</p>
            {installmentOptions.map((option) => (
              <button key={option.provider} type="button" className="w-full text-start" onClick={() => chooseInstallments(option)}>
                <ContextSurface className="flex items-center justify-between gap-3">
                  <span className="text-body text-text-primary">{t(`method.provider.${option.provider}`)}</span>
                  <span className="text-metadata text-text-secondary">{t("method.chooseProvider")}</span>
                </ContextSurface>
              </button>
            ))}
          </div>
        ) : null}

        {onlineOptions.length === 0 && installmentOptions.length === 0 ? (
          <StatusLabel tone="attention">{t("method.noneAvailable")}</StatusLabel>
        ) : null}

        <Button variant="ghost" onClick={() => setStep("review")}>
          {tCommon("back")}
        </Button>
      </div>
    );
  }

  if (step === "payment") {
    return frame(
      <div className="flex flex-col gap-5">
        {progress(3)}
        <h1 className="text-page-title text-text-primary">{t("payment.title")}</h1>
        <ContextSurface className="flex items-center justify-between">
          <span className="text-body text-text-primary">{t("payment.amountDue")}</span>
          <span className="text-body font-medium text-text-primary">{formatCurrency(checkout.totalAmount, locale)}</span>
        </ContextSurface>

        {IS_DEV ? (
          <ContextSurface className="flex flex-col gap-2">
            <p className="text-metadata text-text-secondary">{t("payment.devLabel")}</p>
            <div className="flex flex-col gap-2">
              <Button variant="primary" onClick={() => pay("SUCCESS")}>
                {t("payment.simulateSuccess")}
              </Button>
              <Button variant="secondary" onClick={() => pay("FAILURE")}>
                {t("payment.simulateFailure")}
              </Button>
              <Button variant="ghost" onClick={() => pay("PENDING")}>
                {t("payment.simulatePending")}
              </Button>
            </div>
          </ContextSurface>
        ) : (
          <Button variant="primary" onClick={() => pay(undefined)}>
            {t("payment.onlinePayment")}
          </Button>
        )}

        <Button variant="ghost" onClick={() => setStep("method")}>
          {tCommon("back")}
        </Button>
      </div>
    );
  }

  if (step === "financing-eligibility") {
    const eligibility = financingIntent?.eligibility;
    return frame(
      <div className="flex flex-col gap-5">
        {progress(3)}
        <h1 className="text-page-title text-text-primary">{t("financingEligibility.title")}</h1>
        <ContextSurface className="flex flex-col gap-2">
          <StatusLabel tone={eligibility === "ELIGIBLE" ? "success" : eligibility === "NOT_ELIGIBLE" ? "urgent" : "neutral"}>
            {t(`financingEligibility.status.${eligibility ?? "CHECKING"}`)}
          </StatusLabel>
        </ContextSurface>

        {eligibility === "ELIGIBLE" ? (
          <Button variant="primary" onClick={() => financingIntent && loadPlans(financingIntent.id)}>
            {tCommon("continue")}
          </Button>
        ) : null}
        {eligibility === "NOT_ELIGIBLE" ? <p className="text-body text-text-secondary">{t("financingEligibility.notEligibleHint")}</p> : null}

        <Button variant="ghost" onClick={backToMethodChoice}>
          {t("method.chooseAnother")}
        </Button>
      </div>
    );
  }

  if (step === "financing-plans") {
    return frame(
      <div className="flex flex-col gap-5">
        {progress(3)}
        <h1 className="text-page-title text-text-primary">{t("financingPlans.title")}</h1>
        <div className="flex flex-col gap-2">
          {(plans ?? []).map((plan) => (
            <button key={plan.providerPlanId} type="button" className="w-full text-start" onClick={() => selectPlan(plan)}>
              <ContextSurface className="flex flex-col gap-1">
                <p className="text-body font-medium text-text-primary">{t("financingPlans.installmentCount", { count: plan.installmentCount })}</p>
                {plan.downPaymentAmount != null ? (
                  <Row label={t("financingPlans.downPayment")} value={formatCurrency(plan.downPaymentAmount, locale)} />
                ) : null}
                {plan.installmentAmount != null ? (
                  <Row label={t("financingPlans.installmentAmount")} value={formatCurrency(plan.installmentAmount, locale)} />
                ) : null}
                {plan.feeAmount != null ? <Row label={t("financingPlans.fee")} value={formatCurrency(plan.feeAmount, locale)} /> : null}
                <Row label={t("financingPlans.totalPayable")} value={formatCurrency(plan.totalPayableAmount, locale)} />
              </ContextSurface>
            </button>
          ))}
          {(plans ?? []).length === 0 ? <StatusLabel tone="attention">{t("financingPlans.none")}</StatusLabel> : null}
        </div>

        <Button variant="ghost" onClick={backToMethodChoice}>
          {t("method.chooseAnother")}
        </Button>
      </div>
    );
  }

  if (step === "financing-authorize") {
    const plan = financingIntent?.selectedPlan;
    return frame(
      <div className="flex flex-col gap-5">
        {progress(3)}
        <h1 className="text-page-title text-text-primary">{t("financingAuthorize.title")}</h1>
        <ContextSurface className="flex flex-col gap-2">
          <p className="text-metadata text-text-secondary">{t("financingAuthorize.redirectNotice", { provider: financingIntent ? t(`method.provider.${financingIntent.provider}`) : "" })}</p>
          {plan ? (
            <>
              <Row label={t("financingPlans.installmentCount", { count: plan.installmentCount })} value="" />
              {plan.downPaymentAmount != null ? <Row label={t("financingPlans.downPayment")} value={formatCurrency(plan.downPaymentAmount, locale)} /> : null}
              {plan.installmentAmount != null ? <Row label={t("financingPlans.installmentAmount")} value={formatCurrency(plan.installmentAmount, locale)} /> : null}
              {plan.feeAmount != null ? <Row label={t("financingPlans.fee")} value={formatCurrency(plan.feeAmount, locale)} /> : null}
              <Row label={t("financingPlans.totalPayable")} value={formatCurrency(plan.totalPayableAmount, locale)} />
            </>
          ) : null}
        </ContextSurface>

        {IS_DEV ? (
          <ContextSurface className="flex flex-col gap-2">
            <p className="text-metadata text-text-secondary">{t("payment.devLabel")}</p>
            <div className="flex flex-col gap-2">
              <Button variant="primary" onClick={() => authorizeFinancing("APPROVE")}>
                {t("financingAuthorize.simulateApprove")}
              </Button>
              <Button variant="secondary" onClick={() => authorizeFinancing("DECLINE")}>
                {t("financingAuthorize.simulateDecline")}
              </Button>
              <Button variant="ghost" onClick={() => authorizeFinancing("PENDING")}>
                {t("financingAuthorize.simulatePending")}
              </Button>
            </div>
          </ContextSurface>
        ) : (
          <Button variant="primary" onClick={() => authorizeFinancing(undefined)}>
            {t("financingAuthorize.authorize")}
          </Button>
        )}

        <Button variant="ghost" onClick={backToMethodChoice}>
          {t("method.chooseAnother")}
        </Button>
      </div>
    );
  }

  if (step === "pending") {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="text-page-title text-text-primary">{t("pending.title")}</h1>
        <ContextSurface className="flex flex-col gap-2">
          <StatusLabel tone="neutral">{t("pending.status")}</StatusLabel>
          <p className="text-body text-text-secondary">{t("pending.description")}</p>
        </ContextSurface>
        <Button variant="primary" onClick={checkPendingStatus}>
          {t("pending.refresh")}
        </Button>
      </div>
    );
  }

  if (step === "financing-declined") {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="text-page-title text-text-primary">{t("financingDeclined.title")}</h1>
        <ContextSurface className="flex flex-col gap-2">
          <p className="text-body text-text-secondary">{failureMessage ?? t("financingDeclined.generic")}</p>
          <p className="text-metadata text-text-secondary">{t("paymentFailed.preserved")}</p>
        </ContextSurface>
        <div className="flex flex-col gap-3">
          <Button variant="primary" onClick={backToMethodChoice}>
            {t("financingDeclined.tryAnother")}
          </Button>
          <Button variant="secondary" onClick={retryFinancingAuthorization}>
            {t("financingDeclined.retry")}
          </Button>
          <Button variant="ghost" onClick={() => router.push(`/${locale}/cart`)}>
            {t("paymentFailed.returnToCart")}
          </Button>
        </div>
      </div>
    );
  }

  // failed (standard payment)
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("paymentFailed.title")}</h1>
      <ContextSurface className="flex flex-col gap-2">
        <p className="text-body text-text-secondary">{failureMessage ?? t("paymentFailed.generic")}</p>
        <p className="text-metadata text-text-secondary">{t("paymentFailed.preserved")}</p>
      </ContextSurface>
      <div className="flex flex-col gap-3">
        <Button variant="primary" onClick={retryPayment}>
          {t("paymentFailed.tryAgain")}
        </Button>
        <Button variant="secondary" onClick={switchToInstallments}>
          {t("paymentFailed.chooseInstallments")}
        </Button>
        <Button variant="ghost" onClick={() => router.push(`/${locale}/cart`)}>
          {t("paymentFailed.returnToCart")}
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-metadata text-text-secondary">{label}</span>
      <span className="text-body text-text-primary">{value}</span>
    </div>
  );
}

function CheckoutSummary({ cart, checkout }: { cart: CartDto; checkout: CheckoutDto | null }) {
  const t = useTranslations("commerce.checkout.summary");
  const tCart = useTranslations("commerce.cart");
  const tOrder = useTranslations("commerce.orderDetail");
  const locale = useLocale() as "fa" | "en";
  const lines = cart.sellerGroups.flatMap((g) => g.lines);
  return (
    <aside className="flow-summary" aria-label={t("title")}>
      <h2>{t("title")}</h2>
      <ul className="checkout-summary__lines">
        {lines.map((line) => (
          <li key={line.id}>
            <span>
              {isolate(line.productTitle)}
              {line.quantity > 1 ? ` × ${formatCount(line.quantity, locale)}` : ""}
            </span>
            <span>{formatCurrency(line.lineTotal, locale)}</span>
          </li>
        ))}
      </ul>
      {checkout ? (
        <dl>
          <div><dt>{tOrder("subtotal")}</dt><dd>{formatCurrency(checkout.subtotalAmount, locale)}</dd></div>
          {checkout.discountAmount > 0 ? <div><dt>{tOrder("discount")}</dt><dd>− {formatCurrency(checkout.discountAmount, locale)}</dd></div> : null}
          <div><dt>{tOrder("delivery")}</dt><dd>{formatCurrency(checkout.deliveryAmount, locale)}</dd></div>
          <div className="flow-summary__total"><dt>{tOrder("total")}</dt><dd>{formatCurrency(checkout.totalAmount, locale)}</dd></div>
        </dl>
      ) : (
        <dl>
          <div><dt>{tCart("itemsTotal", { count: cart.totalItems })}</dt><dd>{formatCurrency(cart.subtotalAmount + cart.discountAmount, locale)}</dd></div>
          {cart.discountAmount > 0 ? <div><dt>{tCart("promotions")}</dt><dd>− {formatCurrency(cart.discountAmount, locale)}</dd></div> : null}
          <div><dt>{tCart("delivery")}</dt><dd className="is-note">{t("deliveryNext")}</dd></div>
          <div className="flow-summary__total"><dt>{tCart("subtotal")}</dt><dd>{formatCurrency(cart.subtotalAmount, locale)}</dd></div>
        </dl>
      )}
    </aside>
  );
}
