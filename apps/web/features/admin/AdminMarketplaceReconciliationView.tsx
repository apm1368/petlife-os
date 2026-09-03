"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Input, Select, Skeleton, StatusLabel } from "@petlife/ui";
import { MarketplaceSettlementImportSource } from "@petlife/types";
import type { MarketplaceSettlementReconciliationResultDto } from "@petlife/types";
import { adminFinanceService } from "@/services/admin-finance.service";
import { formatCurrency } from "@/lib/currency/format-currency";

function reconciliationTone(status: string) {
  if (status === "MATCHED") return "success" as const;
  if (status === "MISMATCH" || status === "DUPLICATE") return "urgent" as const;
  if (status === "MISSING_EXTERNAL" || status === "MISSING_INTERNAL" || status === "REVIEW_REQUIRED") return "attention" as const;
  return "neutral" as const;
}

/**
 * Marketplace settlement import + reconciliation queue (spec: "reconcile
 * marketplace statement... mismatch -> flag -> admin review -> explicit
 * adjustment/correction if needed"). The import form takes one line per
 * row of `externalOrderId,amount` — a deliberately minimal manual/CSV-like
 * entry point (spec: "no official Torob/Digikala settlement API exists";
 * see README "External provider status") rather than a full spreadsheet UI.
 */
export function AdminMarketplaceReconciliationView() {
  const t = useTranslations("admin.reconciliation");
  const locale = useLocale() as "fa" | "en";

  const [results, setResults] = useState<MarketplaceSettlementReconciliationResultDto[] | null>(null);
  const [error, setError] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const [channelAccountId, setChannelAccountId] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [currency, setCurrency] = useState("IRR");
  const [linesText, setLinesText] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  async function load() {
    setError(false);
    try {
      setResults(await adminFinanceService.listReconciliation());
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function resolve(id: string) {
    if (!notes.trim()) return;
    await adminFinanceService.resolveReconciliation(id, notes);
    setResolvingId(null);
    setNotes("");
    await load();
  }

  async function runImport() {
    setImportError(null);
    const lines = linesText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [externalOrderId, amountStr] = line.split(",").map((s) => s.trim());
        return { externalOrderId: externalOrderId ?? "", amount: Number(amountStr) };
      });
    if (!channelAccountId || !periodStart || !periodEnd || lines.length === 0 || lines.some((l) => !l.externalOrderId || !Number.isFinite(l.amount))) {
      setImportError(t("import.invalid"));
      return;
    }
    try {
      await adminFinanceService.importMarketplaceSettlement({
        marketplaceChannelAccountId: channelAccountId,
        source: MarketplaceSettlementImportSource.MANUAL,
        periodStart: new Date(periodStart).toISOString(),
        periodEnd: new Date(periodEnd).toISOString(),
        currency,
        lines,
      });
      setLinesText("");
      await load();
    } catch {
      setImportError(t("import.failed"));
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-page-title text-text-primary">{t("title")}</h1>

      <ContextSurface className="flex flex-col gap-2">
        <span className="text-section-title text-text-primary">{t("import.title")}</span>
        <div className="flex flex-wrap items-end gap-2">
          <Input label={t("import.channelAccountId")} value={channelAccountId} onChange={(e) => setChannelAccountId(e.target.value)} className="min-w-[220px]" />
          <Input type="date" label={t("import.periodStart")} value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          <Input type="date" label={t("import.periodEnd")} value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          <Select label={t("import.currency")} value={currency} onChange={(e) => setCurrency(e.target.value)} options={[{ value: "IRR", label: "IRR" }]} />
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-metadata text-text-secondary">{t("import.linesLabel")}</span>
          <textarea
            className="min-h-[100px] rounded-md border border-border-strong bg-surface-elevated px-3 py-2 text-body text-text-primary"
            placeholder={t("import.linesPlaceholder")}
            value={linesText}
            onChange={(e) => setLinesText(e.target.value)}
          />
        </label>
        {importError ? <span className="text-metadata text-state-urgent">{importError}</span> : null}
        <Button onClick={runImport}>{t("import.submit")}</Button>
      </ContextSurface>

      {error ? (
        <ErrorRecovery title={t("title")} message="" retryLabel={t("retry")} onRetry={load} />
      ) : !results ? (
        <Skeleton className="h-64 w-full" aria-label={t("loading")} />
      ) : results.length === 0 ? (
        <EmptyState title={t("empty")} />
      ) : (
        <div className="flex flex-col gap-2">
          <span className="text-section-title text-text-primary">{t("queueTitle")}</span>
          {results.map((row) => (
            <ContextSurface key={row.id} className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <StatusLabel tone={reconciliationTone(row.status)}>{row.status}</StatusLabel>
                {row.resolvedAt ? <span className="text-metadata text-text-secondary">{t("resolved")}</span> : null}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-metadata text-text-secondary">
                {row.expectedAmount !== null ? <span>{t("expected", { amount: formatCurrency(row.expectedAmount, locale) })}</span> : null}
                {row.statementAmount !== null ? <span>{t("statement", { amount: formatCurrency(row.statementAmount, locale) })}</span> : null}
                {row.variance !== null ? <span>{t("variance", { amount: formatCurrency(row.variance, locale) })}</span> : null}
              </div>
              {row.notes ? <p className="text-metadata text-text-secondary">{row.notes}</p> : null}
              {!row.resolvedAt ? (
                resolvingId === row.id ? (
                  <div className="flex items-end gap-2">
                    <Input label={t("notesLabel")} value={notes} onChange={(e) => setNotes(e.target.value)} className="flex-1" />
                    <Button size="sm" onClick={() => resolve(row.id)}>{t("submitResolve")}</Button>
                  </div>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => setResolvingId(row.id)}>
                    {t("resolve")}
                  </Button>
                )
              ) : null}
            </ContextSurface>
          ))}
        </div>
      )}
    </div>
  );
}
