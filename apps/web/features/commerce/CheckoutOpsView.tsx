"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ContextSurface, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import type { CheckoutOpsDto } from "@petlife/types";
import { commerceService } from "@/services/commerce.service";
import { formatCurrency } from "@/lib/currency/format-currency";

/**
 * Minimal internal payment/financing ops view (spec section 45) — not a full
 * Admin CRM, just a read-only inspection of everything CheckoutService's
 * getOpsView aggregates: PaymentIntent/PaymentAttempt/Transaction,
 * FinancingIntent, Refund, provider webhook events, and the reconciliation
 * log. Reachable only by the checkout's own owner (SessionAuthGuard +
 * ownership check on the backend) — no separate admin/support role exists
 * yet, see README "Known limitations".
 */
export function CheckoutOpsView({ checkoutId }: { checkoutId: string }) {
  const t = useTranslations("commerce.ops");
  const locale = useLocale() as "fa" | "en";
  const [ops, setOps] = useState<CheckoutOpsDto | null>(null);
  const [error, setError] = useState(false);

  async function load() {
    setError(false);
    setOps(null);
    try {
      setOps(await commerceService.getOpsView(checkoutId));
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutId]);

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={load} />;
  if (!ops) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;

  const when = (iso: string) => new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>
      <p className="text-metadata text-text-secondary">
        {t("checkout")}: {ops.checkout.id}
      </p>

      <Section title={t("paymentIntents")} empty={ops.paymentIntents.length === 0} emptyLabel={t("none")}>
        {ops.paymentIntents.map((intent) => (
          <Line key={intent.id}>
            <StatusLabel tone="neutral">{intent.status}</StatusLabel>
            <span className="text-metadata text-text-secondary">{intent.provider}</span>
            <span className="text-body text-text-primary">{formatCurrency(intent.amount, locale)}</span>
          </Line>
        ))}
      </Section>

      <Section title={t("financingIntents")} empty={ops.financingIntents.length === 0} emptyLabel={t("none")}>
        {ops.financingIntents.map((intent) => (
          <Line key={intent.id}>
            <StatusLabel tone="neutral">{intent.status}</StatusLabel>
            <span className="text-metadata text-text-secondary">{intent.provider}</span>
            <span className="text-body text-text-primary">{formatCurrency(intent.amount, locale)}</span>
          </Line>
        ))}
      </Section>

      <Section title={t("refunds")} empty={ops.refunds.length === 0} emptyLabel={t("none")}>
        {ops.refunds.map((refund) => (
          <Line key={refund.id}>
            <StatusLabel tone="neutral">{refund.status}</StatusLabel>
            <span className="text-body text-text-primary">{formatCurrency(refund.amount, locale)}</span>
            <span className="text-metadata text-text-secondary">{when(refund.createdAt)}</span>
          </Line>
        ))}
      </Section>

      <Section title={t("providerEvents")} empty={ops.providerEvents.length === 0} emptyLabel={t("none")}>
        {ops.providerEvents.map((event) => (
          <Line key={event.id}>
            <StatusLabel tone="neutral">{event.status}</StatusLabel>
            <span className="text-metadata text-text-secondary">{event.provider}</span>
            <span className="text-metadata text-text-secondary">{event.eventType}</span>
            <span className="text-metadata text-text-secondary">
              {t("attemptCount")}: {event.attemptCount}
            </span>
          </Line>
        ))}
      </Section>

      <Section title={t("reconciliationLogs")} empty={ops.reconciliationLogs.length === 0} emptyLabel={t("none")}>
        {ops.reconciliationLogs.map((log) => (
          <Line key={log.id}>
            <span className="text-metadata text-text-secondary">{log.provider}</span>
            <span className="text-metadata text-text-secondary">
              {t("localStatus")}: {log.localStatus}
            </span>
            <span className="text-metadata text-text-secondary">
              {t("remoteStatus")}: {log.remoteStatus}
            </span>
            <StatusLabel tone="neutral">{log.action}</StatusLabel>
          </Line>
        ))}
      </Section>
    </div>
  );
}

function Section({ title, empty, emptyLabel, children }: { title: string; empty: boolean; emptyLabel: string; children: ReactNode }) {
  return (
    <ContextSurface className="flex flex-col gap-2">
      <p className="text-section-title text-text-primary">{title}</p>
      {empty ? <p className="text-metadata text-text-secondary">{emptyLabel}</p> : children}
    </ContextSurface>
  );
}

function Line({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle pb-2 last:border-b-0 last:pb-0">{children}</div>;
}
