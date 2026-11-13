"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { adminCommerceService } from "@/services/admin-commerce.service";
import { Panel, PanelTitle } from "../console-ui";

const FIELD = "w-full rounded-md border border-border-subtle bg-surface-base px-3 py-2 text-body text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";
const RUNNING = ["QUEUED", "RUNNING"];
/** The owner's one-time total (2026-11-13); the server clamps to what is left of it. */
export const FACTS_TOTAL = 16_000;
/** Seconds per product, from the run's pacing (one request every 3 s, plus listing pages). */
const SECONDS_PER_PRODUCT = 3.3;

export interface FactsJobProgress {
  planned: boolean;
  subcategories: Array<{ code: string; title: string; total: number | null }>;
  plan: Array<{ code: string; title: string; quota: number; taken: number; exhausted: boolean }>;
  current: number;
  pass: "QUOTA" | "FILL";
}
export interface FactsJobRow {
  id?: string;
  mode?: string;
  status: string;
  maxProducts?: number;
  productsSeen?: number;
  productsImported?: number;
  productsFailed?: number;
  progress?: FactsJobProgress | null;
}

/**
 * The owner's one-time Digikala pet import (2026-11-12/13), facts only: drafts with name, brand, category, specifications,
 * weight and variants (colour, size, flavour); no photos or descriptions. About 16,000 products across all pet
 * sub-categories, run slowly in the background; while it runs, this shows where it is and roughly how long is left.
 */
export function DigikalaFactsImportPanel({ categories, jobs, onStarted }: { categories: { id: string; name: string }[]; jobs: FactsJobRow[] | null; onStarted: () => void }) {
  const t = useTranslations("adminDigikalaFacts");
  const locale = useLocale();
  const nf = new Intl.NumberFormat(locale);
  const [categoryId, setCategoryId] = useState("");
  const [maxProducts, setMaxProducts] = useState(String(FACTS_TOTAL));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const running = jobs?.find((job) => job.mode === "DIGIKALA_FACTS" && RUNNING.includes(job.status));
  const chosen = categoryId || categories[0]?.id || "";

  async function start() {
    const count = Math.round(Number(maxProducts.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[,٬.]/g, "")));
    if (!chosen || !Number.isFinite(count) || count < 1 || count > FACTS_TOTAL) return setMessage({ ok: false, text: t("invalid") });
    setBusy(true);
    setMessage(null);
    try {
      await adminCommerceService.startDigikalaFactsImport({ categoryId: chosen, maxProducts: count, idempotencyKey: crypto.randomUUID() });
      setMessage({ ok: true, text: t("started") });
      onStarted();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof ApiError && e.status === 409 ? t("alreadyRun") : e instanceof ApiError && e.status === 403 ? t("forbidden") : t("failed") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel>
      <PanelTitle title={t("title")} hint={t("hint")} />
      <ul className="mb-3 list-disc ps-5 text-sm text-text-secondary">
        <li>{t("rules.facts")}</li>
        <li>{t("rules.noContent")}</li>
        <li>{t("rules.reference")}</li>
        <li>{t("rules.pace")}</li>
        <li>{t("rules.resume")}</li>
      </ul>
      {running ? (
        <FactsProgressView job={running} nf={nf} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
          <label className="flex flex-col gap-1 text-sm">
            {t("category")}
            <select className={FIELD} value={chosen} onChange={(e) => setCategoryId(e.target.value)}>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t("maxProducts")}
            <input className={FIELD} inputMode="numeric" dir="ltr" value={maxProducts} onChange={(e) => setMaxProducts(e.target.value)} />
          </label>
          <Button isLoading={busy} disabled={!chosen} onClick={() => void start()}>{t("start")}</Button>
        </div>
      )}
      {message ? <p role={message.ok ? "status" : "alert"} className={`mt-2 text-sm ${message.ok ? "text-state-success" : "text-state-urgent"}`}>{message.text}</p> : null}
    </Panel>
  );
}

function FactsProgressView({ job, nf }: { job: FactsJobRow; nf: Intl.NumberFormat }) {
  const t = useTranslations("adminDigikalaFacts");
  const progress = job.progress ?? null;
  const target = job.maxProducts ?? FACTS_TOTAL;
  const seen = job.productsSeen ?? 0;
  const hours = Math.max(1, Math.ceil(((target - seen) * SECONDS_PER_PRODUCT) / 3600));
  const index = progress?.planned && progress.plan.length ? Math.min(progress.current, progress.plan.length - 1) : -1;
  const entry = index >= 0 ? progress!.plan[index] : undefined;
  return (
    <section aria-label={t("progress.title")} className="flex flex-col gap-2 text-sm">
      <p className="font-bold text-text-primary">{t("progress.title")}</p>
      {!progress?.planned ? (
        <p>{t("progress.planning", { done: nf.format(progress?.subcategories.filter((s) => s.total !== null).length ?? 0), total: nf.format(progress?.subcategories.length ?? 0) })}</p>
      ) : progress.pass === "FILL" ? (
        <p>{t("progress.fill")}</p>
      ) : entry ? (
        <p>{t("progress.subcategory", { index: nf.format(index + 1), count: nf.format(progress.plan.length), title: entry.title })}</p>
      ) : null}
      <progress className="h-2 w-full" value={seen} max={target} aria-label={t("progress.title")} />
      <p className="text-text-secondary">{t("progress.counts", { seen: nf.format(seen), target: nf.format(target), imported: nf.format(job.productsImported ?? 0), failed: nf.format(job.productsFailed ?? 0) })}</p>
      <p className="text-text-secondary">{t("progress.eta", { hours: nf.format(hours) })}</p>
    </section>
  );
}
