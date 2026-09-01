"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, Skeleton, StatusLabel } from "@petlife/ui";
import { DeliveryMethod, type CartDto, type CheckoutDto, type CustomerAddressDto } from "@petlife/types";
import { useActivePet } from "@/hooks/use-active-pet";
import { commerceService } from "@/services/commerce.service";
import { addressesService } from "@/services/addresses.service";
import { formatCurrency } from "@/lib/currency/format-currency";
import { ApiError } from "@/lib/api/client";

type Step = "address" | "safety-ack" | "review" | "payment" | "submitting" | "pending" | "failed";

const IS_DEV = process.env.NODE_ENV !== "production";

/**
 * Checkout (spec sections 56-59) — one route, internal steps, mirroring
 * ServiceBookingWizard. Address/Delivery -> Review -> Payment -> Pending or
 * Failed (recoverable, never a dead end) -> Confirmation (separate route,
 * reached only after a CONFIRMED checkout).
 */
export function CheckoutView() {
  const t = useTranslations("commerce.checkout");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const locale = useLocale() as "fa" | "en";
  const { householdId } = useActivePet();

  const [step, setStep] = useState<Step>("address");
  const [cart, setCart] = useState<CartDto | null>(null);
  const [addresses, setAddresses] = useState<CustomerAddressDto[] | null>(null);
  const [addressId, setAddressId] = useState<string | null>(null);
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>(DeliveryMethod.STANDARD);
  const [checkout, setCheckout] = useState<CheckoutDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failureMessage, setFailureMessage] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [paymentIntentIdempotencyKey] = useState(() => crypto.randomUUID());
  const [payIdempotencyKey, setPayIdempotencyKey] = useState(() => crypto.randomUUID());
  const [newAddress, setNewAddress] = useState({ addressLine: "", city: "", countryCode: "" });
  const [isCreatingAddress, setIsCreatingAddress] = useState(false);

  useEffect(() => {
    void commerceService.getCart().then(setCart);
    if (householdId) void addressesService.list(householdId).then(setAddresses);
  }, [householdId]);

  async function createAddress() {
    if (!householdId) return;
    setIsCreatingAddress(true);
    try {
      const address = await addressesService.create({ householdId, ...newAddress });
      setAddresses((prev) => [address, ...(prev ?? [])]);
      setAddressId(address.id);
      setNewAddress({ addressLine: "", city: "", countryCode: "" });
    } finally {
      setIsCreatingAddress(false);
    }
  }

  async function createCheckout(acknowledgeSafetyConflict = false) {
    setError(null);
    setStep("submitting");
    try {
      const result = await commerceService.createCheckout({ addressId: addressId ?? undefined, deliveryMethod, acknowledgeSafetyConflict }, idempotencyKey);
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
      setError(err instanceof ApiError ? err.message : t("createFailed"));
      setStep("address");
    }
  }

  async function enterPaymentStep() {
    if (!checkout) return;
    setStep("submitting");
    try {
      await commerceService.createPaymentIntent(checkout.id, paymentIntentIdempotencyKey);
      setStep("payment");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("createFailed"));
      setStep("review");
    }
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
      setFailureMessage(err instanceof ApiError ? err.message : t("paymentFailed.generic"));
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
    setPayIdempotencyKey(crypto.randomUUID());
    setStep("payment");
  }

  if (!cart || (householdId && !addresses)) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  if (step === "address") {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="text-page-title text-text-primary">{t("address.title")}</h1>
        {error ? (
          <p role="alert" className="text-metadata text-state-urgent">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          {(addresses ?? []).map((address) => (
            <button key={address.id} type="button" className="w-full text-start" onClick={() => setAddressId(address.id)}>
              <ContextSurface className={addressId === address.id ? "border-brand-mint" : ""}>
                <p className="text-body text-text-primary">{address.addressLine}</p>
                <p className="text-metadata text-text-secondary">{address.city}</p>
              </ContextSurface>
            </button>
          ))}
        </div>

        <ContextSurface className="flex flex-col gap-2">
          <p className="text-metadata text-text-secondary">{t("address.addNew")}</p>
          <input
            aria-label={t("address.addressLine")}
            placeholder={t("address.addressLine")}
            value={newAddress.addressLine}
            onChange={(e) => setNewAddress({ ...newAddress, addressLine: e.target.value })}
            className="rounded-md border border-border-strong bg-surface-elevated p-2 text-body text-text-primary"
          />
          <input
            aria-label={t("address.city")}
            placeholder={t("address.city")}
            value={newAddress.city}
            onChange={(e) => setNewAddress({ ...newAddress, city: e.target.value })}
            className="rounded-md border border-border-strong bg-surface-elevated p-2 text-body text-text-primary"
          />
          <input
            aria-label={t("address.countryCode")}
            placeholder={t("address.countryCode")}
            value={newAddress.countryCode}
            onChange={(e) => setNewAddress({ ...newAddress, countryCode: e.target.value })}
            className="rounded-md border border-border-strong bg-surface-elevated p-2 text-body text-text-primary"
          />
          <Button
            variant="secondary"
            isLoading={isCreatingAddress}
            onClick={createAddress}
            disabled={!newAddress.addressLine || !newAddress.city || !newAddress.countryCode}
          >
            {t("address.save")}
          </Button>
        </ContextSurface>

        <div>
          <p className="mb-2 text-section-title text-text-primary">{t("delivery.title")}</p>
          <div className="flex gap-2">
            {Object.values(DeliveryMethod).map((method) => (
              <button
                key={method}
                type="button"
                onClick={() => setDeliveryMethod(method)}
                className={`rounded-md border px-3 py-2 text-metadata ${
                  method === deliveryMethod ? "border-brand-mint bg-brand-mint/10 text-text-primary" : "border-border-subtle text-text-secondary"
                }`}
              >
                {t(`delivery.method.${method}`)}
              </button>
            ))}
          </div>
        </div>

        <Button variant="primary" disabled={!addressId} onClick={() => createCheckout(false)}>
          {tCommon("continue")}
        </Button>
      </div>
    );
  }

  if (step === "safety-ack") {
    return (
      <div className="flex flex-col gap-5">
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
    return (
      <div className="flex flex-col gap-5">
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
          <Row label={t("review.delivery")} value={formatCurrency(checkout.deliveryAmount, locale)} />
          <Row label={t("review.total")} value={formatCurrency(checkout.totalAmount, locale)} />
        </ContextSurface>

        <div className="flex gap-3">
          <Button variant="ghost" onClick={() => setStep("address")}>
            {tCommon("back")}
          </Button>
          <Button variant="primary" className="flex-1" onClick={enterPaymentStep}>
            {tCommon("continue")}
          </Button>
        </div>
      </div>
    );
  }

  if (step === "payment") {
    return (
      <div className="flex flex-col gap-5">
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

        <Button variant="ghost" onClick={() => setStep("review")}>
          {tCommon("back")}
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

  // failed
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("paymentFailed.title")}</h1>
      <ContextSurface className="flex flex-col gap-2">
        <p className="text-body text-text-secondary">{failureMessage ?? t("paymentFailed.generic")}</p>
        <p className="text-metadata text-text-secondary">{t("paymentFailed.preserved")}</p>
      </ContextSurface>
      <div className="flex gap-3">
        <Button variant="ghost" onClick={() => router.push(`/${locale}/cart`)}>
          {t("paymentFailed.returnToCart")}
        </Button>
        <Button variant="primary" className="flex-1" onClick={retryPayment}>
          {t("paymentFailed.tryAgain")}
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
