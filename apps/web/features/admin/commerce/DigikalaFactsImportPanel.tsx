"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { adminCommerceService } from "@/services/admin-commerce.service";
import { Panel, PanelTitle } from "../console-ui";

const FIELD = "w-full rounded-md border border-border-subtle bg-surface-base px-3 py-2 text-body text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";
const RAN = ["QUEUED", "RUNNING", "COMPLETED", "PARTIAL"];

/**
 * The owner's one-time Digikala pet-category import (2026-11-12), facts only: drafts with name, brand, category,
 * specifications and weight; no photos or descriptions. Runs once; a failed or cancelled run can be started again.
 */
export function DigikalaFactsImportPanel({ categories, jobs, onStarted }: { categories: { id: string; name: string }[]; jobs: { mode?: string; status: string }[] | null; onStarted: () => void }) {
  const t = useTranslations("adminDigikalaFacts");
  const [categoryId, setCategoryId] = useState("");
  const [maxProducts, setMaxProducts] = useState("1000");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const ran = jobs?.find((job) => job.mode === "DIGIKALA_FACTS" && RAN.includes(job.status));
  const chosen = categoryId || categories[0]?.id || "";

  async function start() {
    const count = Math.round(Number(maxProducts.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))));
    if (!chosen || !Number.isFinite(count) || count < 1 || count > 3000) return setMessage({ ok: false, text: t("invalid") });
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
      </ul>
      {ran ? (
        <p role="status" className="text-sm text-text-secondary">{t("alreadyRun")}</p>
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
