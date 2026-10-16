"use client";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, ContextSurface } from "@petlife/ui";
import { clinicOsService, type ClinicPlan } from "@/services/clinic-os.service";
import { formatCurrency } from "@/lib/currency/format-currency";

export function ClinicPlans({ currentCode }: { currentCode?: string }) {
  const t = useTranslations("clinicPlans"), locale = useLocale();
  const [plans, setPlans] = useState<ClinicPlan[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(false), [revision, setRevision] = useState(0);
  useEffect(() => {
    const c = new AbortController(); setLoading(true); setError(false);
    clinicOsService.plans(c.signal).then(value => { if (!c.signal.aborted) setPlans(value); }).catch(() => { if (!c.signal.aborted) setError(true); }).finally(() => { if (!c.signal.aborted) setLoading(false); });
    return () => c.abort();
  }, [revision]);
  const n = (v: number) => new Intl.NumberFormat(locale).format(v);
  const money = (amount: number, currency: string) => currency === "IRR" ? formatCurrency(amount, locale === "fa" ? "fa" : "en") : new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
  return <section className="space-y-4" aria-label={t("title")}>
    <header><h2 className="text-section-title">{t("title")}</h2><p className="text-text-secondary">{t("intro")}</p></header>
    {loading ? <p role="status">{t("loading")}</p> : error ? <div><p role="alert">{t("error")}</p><Button onClick={() => setRevision(v => v + 1)}>{t("retry")}</Button></div> : plans.length === 0 ? <p>{t("empty")}</p> : <div className="grid gap-4 lg:grid-cols-3">
      {plans.map(plan => <ContextSurface key={plan.code} className="flex flex-col gap-4">
        <header className="space-y-2"><h3 className="text-section-title">{locale === "fa" ? plan.nameFa : plan.nameEn}</h3>{currentCode === plan.code && <span className="inline-block rounded-full border border-current px-3 py-1 text-sm">{t("current")}</span>}<p className="text-text-secondary">{locale === "fa" ? plan.descriptionFa : plan.descriptionEn}</p></header>
        {!plan.prices?.length ? <p>{t("unannounced")}</p> : plan.prices.map(price => <p key={`${price.billingInterval}-${price.currency}`}><bdi>{money(price.amount, price.currency)}</bdi> · {t.has(`intervals.${price.billingInterval}`) ? t(`intervals.${price.billingInterval}`) : price.billingInterval}</p>)}
        <ul className="space-y-3">{plan.entitlements.map(item => <li key={item.key} className="flex items-start justify-between gap-3 border-t border-border-subtle pt-3"><span>{t.has(`features.${item.key.replaceAll(".", "_")}`) ? t(`features.${item.key.replaceAll(".", "_")}`) : <bdi>{item.key}</bdi>}</span><span>{!item.enabled ? t("excluded") : item.type === "LIMIT" ? item.limit === null ? t("unlimited") : n(item.limit) : t("included")}</span></li>)}</ul>
      </ContextSurface>)}
    </div>}
    <p className="text-sm text-text-secondary">{t("adminOnly")}</p>
  </section>;
}
