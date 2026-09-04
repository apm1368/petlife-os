"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, ErrorRecovery, Input, Skeleton, StatusLabel } from "@petlife/ui";
import type { SubscriptionPlanDto } from "@petlife/types";
import { SubscriptionBillingInterval } from "@petlife/types";
import { adminSubscriptionService } from "@/services/admin-subscription.service";
import { ApiError } from "@/lib/api/client";
import { formatCurrency } from "@/lib/currency/format-currency";

/** Admin plan/price catalog (spec: "Admin -> Subscriptions -> Plans/Prices"). Plans are few and admin-managed — a plain list, no pagination, matching every other admin catalog view in this codebase (AdminCustomersView, AdminAuditView). */
export function AdminSubscriptionPlansView() {
  const t = useTranslations("admin.subscriptions");
  const tCommon = useTranslations("admin.common");
  const locale = useLocale();
  const router = useRouter();

  const [plans, setPlans] = useState<SubscriptionPlanDto[] | null>(null);
  const [error, setError] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [code, setCode] = useState("");
  const [nameFa, setNameFa] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [countries, setCountries] = useState("IR");
  const [trialDays, setTrialDays] = useState("");

  const [priceAmounts, setPriceAmounts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setError(false);
    try {
      const result = await adminSubscriptionService.listPlans();
      setPlans([...result].sort((a, b) => a.sortOrder - b.sortOrder));
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createPlan() {
    if (!code.trim() || !nameFa.trim() || !nameEn.trim()) return;
    setFormError(null);
    setBusy(true);
    try {
      await adminSubscriptionService.createPlan({
        code: code.trim(),
        nameFa: nameFa.trim(),
        nameEn: nameEn.trim(),
        countryAvailability: countries.split(",").map((c) => c.trim()).filter(Boolean),
        trialDays: trialDays ? Number(trialDays) : undefined,
      });
      setCode("");
      setNameFa("");
      setNameEn("");
      setTrialDays("");
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : tCommon("save"));
    } finally {
      setBusy(false);
    }
  }

  async function addPrice(planId: string) {
    const amount = Number(priceAmounts[planId]);
    if (!amount || amount <= 0) return;
    setFormError(null);
    try {
      await adminSubscriptionService.createPrice(planId, { countryCode: "IR", billingInterval: SubscriptionBillingInterval.MONTHLY, amount });
      setPriceAmounts((prev) => ({ ...prev, [planId]: "" }));
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : tCommon("save"));
    }
  }

  if (error) return <ErrorRecovery title={t("plansTitle")} message="" retryLabel={tCommon("retry")} onRetry={load} />;
  if (!plans) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-page-title text-text-primary">{t("plansTitle")}</h1>
        <Button variant="secondary" size="sm" onClick={() => router.push(`/${locale}/admin/subscriptions/households`)}>
          {t("householdsTitle")}
        </Button>
      </div>

      {formError ? <p className="text-body text-state-urgent">{formError}</p> : null}

      <ContextSurface className="flex flex-wrap items-end gap-2">
        <Input label={t("form.code")} value={code} onChange={(e) => setCode(e.target.value)} className="min-w-32" />
        <Input label={t("form.nameFa")} value={nameFa} onChange={(e) => setNameFa(e.target.value)} className="min-w-32" />
        <Input label={t("form.nameEn")} value={nameEn} onChange={(e) => setNameEn(e.target.value)} className="min-w-32" />
        <Input label={t("form.countries")} value={countries} onChange={(e) => setCountries(e.target.value)} className="min-w-24" />
        <Input label={t("form.trialDays")} value={trialDays} onChange={(e) => setTrialDays(e.target.value)} className="min-w-20" />
        <Button isLoading={busy} onClick={createPlan}>
          {t("form.createPlan")}
        </Button>
      </ContextSurface>

      {plans.map((plan) => (
        <ContextSurface key={plan.id} className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-section-title text-text-primary">
              {locale === "fa" ? plan.nameFa : plan.nameEn} <span className="text-metadata text-text-secondary">({plan.code})</span>
            </span>
            <StatusLabel tone={plan.status === "ACTIVE" ? "success" : "neutral"}>{plan.status}</StatusLabel>
          </div>
          <div className="flex flex-wrap gap-3 text-metadata text-text-secondary">
            {plan.prices.map((price) => (
              <span key={price.id}>
                {price.billingInterval}: {formatCurrency(price.amount, locale === "fa" ? "fa" : "en")} ({price.status})
              </span>
            ))}
          </div>
          {!plan.isFree ? (
            <div className="flex items-end gap-2">
              <Input
                label={t("form.newMonthlyPrice")}
                value={priceAmounts[plan.id] ?? ""}
                onChange={(e) => setPriceAmounts((prev) => ({ ...prev, [plan.id]: e.target.value }))}
                className="max-w-40"
              />
              <Button size="sm" variant="secondary" onClick={() => addPrice(plan.id)}>
                {t("form.addPrice")}
              </Button>
            </div>
          ) : null}
        </ContextSurface>
      ))}
    </div>
  );
}
