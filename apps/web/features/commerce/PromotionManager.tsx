"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, ContextSurface, Dialog, EmptyState, ErrorRecovery, Input, Select, Skeleton, StatusLabel } from "@petlife/ui";
import type { ProductCategoryDto, PromotionDto, PromotionInput, PromotionScopeName } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { formatCurrency } from "@/lib/currency/format-currency";
import { formatCount } from "@/lib/number/format-number";
import { commerceService } from "@/services/commerce.service";

export interface PromotionApi {
  list: () => Promise<PromotionDto[]>;
  create: (input: PromotionInput) => Promise<PromotionDto>;
  update: (id: string, input: Partial<PromotionInput>) => Promise<PromotionDto>;
  transition: (id: string, status: "ACTIVE" | "PAUSED" | "ENDED") => Promise<PromotionDto>;
}

export interface TargetOption {
  id: string;
  label: string;
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Native date inputs are Gregorian; the Persian UI always shows the Jalali reading next to them. */
function localizedDate(value: string, locale: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const intlLocale = locale === "fa" ? "fa-IR-u-ca-persian-nu-arabext" : locale;
  return new Intl.DateTimeFormat(intlLocale, { dateStyle: "full", timeStyle: "short" }).format(d);
}

function describe(p: PromotionDto, locale: string): string {
  return p.discountType === "PERCENT"
    ? `${formatCount(p.value, locale)}${locale === "fa" ? "٪" : "%"}`
    : formatCurrency(p.value, locale);
}

/**
 * Promotion manager (seller and admin share it; the API decides what each
 * may target). Shows live state, usage and discount actually given.
 */
export function PromotionManager({ api, mode, sellerOptions, productOptions }: { api: PromotionApi; mode: "PLATFORM" | "SELLER"; sellerOptions?: TargetOption[]; productOptions?: TargetOption[] }) {
  const locale = useLocale();
  const t = useTranslations("commerce.promotions");
  const [items, setItems] = useState<PromotionDto[] | null>(null);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState<PromotionDto | "new" | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function load() {
    setError(false);
    try {
      setItems(await api.list());
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function transition(p: PromotionDto, status: "ACTIVE" | "PAUSED" | "ENDED") {
    setBusyId(p.id);
    setActionError(null);
    try {
      const updated = await api.transition(p.id, status);
      setItems((prev) => prev?.map((x) => (x.id === p.id ? updated : x)) ?? null);
    } catch (err) {
      setActionError(err instanceof ApiError && err.status < 500 ? err.message : t("failed"));
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <ErrorRecovery title={t("loadFailed")} message="" retryLabel={t("retry")} onRetry={load} />;
  if (!items) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h1 className="text-page-title text-text-primary">{t("title")}</h1>
          <p className="text-metadata text-text-secondary">{t("intro")}</p>
        </div>
        <Button onClick={() => setEditing("new")}>{t("create")}</Button>
      </div>
      {actionError ? (
        <p role="alert" className="text-metadata text-state-urgent">
          {actionError}
        </p>
      ) : null}
      {items.length === 0 ? <EmptyState title={t("empty")} /> : null}
      <div className="flex flex-col gap-3">
        {items.map((p) => (
          <ContextSurface key={p.id} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-body font-medium text-text-primary">{p.name}</p>
                <p className="text-metadata text-text-secondary">
                  {describe(p, locale)} · {t(`scope.${p.scope}`)}
                  {p.maxDiscountAmount ? ` · ${t("capShort")}: ${formatCurrency(p.maxDiscountAmount, locale)}` : ""}
                </p>
              </div>
              <div className="flex gap-1.5">
                {p.isLive ? <StatusLabel tone="success">{t("live")}</StatusLabel> : null}
                <StatusLabel tone={p.status === "ACTIVE" ? "success" : p.status === "PAUSED" ? "attention" : "neutral"}>{t(`status.${p.status}`)}</StatusLabel>
              </div>
            </div>
            <p className="text-metadata text-text-secondary">
              {localizedDate(p.startsAt, locale)}
              {p.endsAt ? ` — ${localizedDate(p.endsAt, locale)}` : ""}
            </p>
            <p className="text-metadata text-text-secondary">
              {t("used")}: {formatCount(p.usageCount, locale)}
              {p.usageLimit ? ` / ${formatCount(p.usageLimit, locale)}` : ""} · {t("given")}: {formatCurrency(p.discountGivenAmount, locale)}
            </p>
            <div className="flex flex-wrap gap-2">
              {p.status !== "ENDED" ? (
                <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                  {t("edit")}
                </Button>
              ) : null}
              {p.status === "DRAFT" || p.status === "PAUSED" ? (
                <Button size="sm" variant="secondary" isLoading={busyId === p.id} onClick={() => transition(p, "ACTIVE")}>
                  {t("activate")}
                </Button>
              ) : null}
              {p.status === "ACTIVE" ? (
                <Button size="sm" variant="secondary" isLoading={busyId === p.id} onClick={() => transition(p, "PAUSED")}>
                  {t("pause")}
                </Button>
              ) : null}
              {p.status !== "ENDED" ? (
                <Button size="sm" variant="ghost" disabled={busyId === p.id} onClick={() => transition(p, "ENDED")}>
                  {t("end")}
                </Button>
              ) : null}
            </div>
          </ContextSurface>
        ))}
      </div>

      {editing ? (
        <PromotionForm
          key={editing === "new" ? "new" : editing.id}
          locale={locale}
          mode={mode}
          initial={editing === "new" ? null : editing}
          sellerOptions={sellerOptions ?? []}
          productOptions={productOptions}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            const saved = editing === "new" ? await api.create(input) : await api.update(editing.id, input);
            setItems((prev) => (editing === "new" ? [saved, ...(prev ?? [])] : prev?.map((x) => (x.id === saved.id ? saved : x)) ?? null));
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

function PromotionForm({
  locale,
  mode,
  initial,
  sellerOptions,
  productOptions,
  onClose,
  onSave,
}: {
  locale: string;
  mode: "PLATFORM" | "SELLER";
  initial: PromotionDto | null;
  sellerOptions: TargetOption[];
  productOptions?: TargetOption[];
  onClose: () => void;
  onSave: (input: PromotionInput) => Promise<void>;
}) {
  const t = useTranslations("commerce.promotions");
  const [name, setName] = useState(initial?.name ?? "");
  const [discountType, setDiscountType] = useState<"PERCENT" | "FIXED">(initial?.discountType ?? "PERCENT");
  const [value, setValue] = useState(initial ? String(initial.discountType === "FIXED" ? initial.value / 10 : initial.value) : "");
  const [cap, setCap] = useState(initial?.maxDiscountAmount ? String(initial.maxDiscountAmount / 10) : "");
  const [scope, setScope] = useState<PromotionScopeName>(initial?.scope ?? "ALL");
  const [categoryIds, setCategoryIds] = useState<string[]>(initial?.categoryIds ?? []);
  const [productIds, setProductIds] = useState<string[]>(initial?.productIds ?? []);
  const [sellerIds, setSellerIds] = useState<string[]>(initial?.sellerOrganizationIds ?? []);
  const [startsAt, setStartsAt] = useState(toLocalInput(initial?.startsAt ?? new Date().toISOString()));
  const [endsAt, setEndsAt] = useState(toLocalInput(initial?.endsAt ?? null));
  const [usageLimit, setUsageLimit] = useState(initial?.usageLimit ? String(initial.usageLimit) : "");
  const [categories, setCategories] = useState<ProductCategoryDto[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<TargetOption[]>(productOptions ?? []);
  const [knownProducts, setKnownProducts] = useState<Record<string, string>>(() => Object.fromEntries((productOptions ?? []).map((p) => [p.id, p.label])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const priceLocked = initial?.status === "ACTIVE";

  useEffect(() => {
    void commerceService.listCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    if (productOptions) {
      const q = productQuery.trim().toLowerCase();
      setProductResults(productOptions.filter((p) => !q || p.label.toLowerCase().includes(q)).slice(0, 30));
      return;
    }
    const q = productQuery.trim();
    if (q.length < 2) return;
    const timer = setTimeout(() => {
      void commerceService.searchProducts({ search: q, pageSize: 20 }).then((res) => {
        const opts = res.items.map((p) => ({ id: p.id, label: p.title }));
        setProductResults(opts);
        setKnownProducts((prev) => ({ ...prev, ...Object.fromEntries(opts.map((o) => [o.id, o.label])) }));
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [productQuery, productOptions]);

  const scopes: PromotionScopeName[] = mode === "SELLER" ? ["ALL", "CATEGORY", "PRODUCT"] : ["ALL", "CATEGORY", "PRODUCT", "SELLER"];
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const valueNumber = Number(value);
  const valid = useMemo(() => {
    if (!name.trim() || !startsAt || !Number.isFinite(valueNumber) || valueNumber <= 0) return false;
    if (discountType === "PERCENT" && (valueNumber < 1 || valueNumber > 90 || !Number.isInteger(valueNumber))) return false;
    if (scope === "CATEGORY" && categoryIds.length === 0) return false;
    if (scope === "PRODUCT" && productIds.length === 0) return false;
    if (scope === "SELLER" && sellerIds.length === 0) return false;
    if (endsAt && new Date(endsAt) <= new Date(startsAt)) return false;
    return true;
  }, [name, startsAt, valueNumber, discountType, scope, categoryIds, productIds, sellerIds, endsAt]);

  async function submit() {
    setSaving(true);
    setError(null);
    const input: PromotionInput = {
      name: name.trim(),
      discountType,
      value: discountType === "FIXED" ? Math.round(valueNumber * 10) : Math.round(valueNumber),
      maxDiscountAmount: cap ? Math.round(Number(cap) * 10) : null,
      scope,
      categoryIds: scope === "CATEGORY" ? categoryIds : [],
      productIds: scope === "PRODUCT" ? productIds : [],
      sellerOrganizationIds: scope === "SELLER" ? sellerIds : [],
      startsAt: new Date(startsAt).toISOString(),
      endsAt: endsAt ? new Date(endsAt).toISOString() : null,
      usageLimit: usageLimit ? Number(usageLimit) : null,
    };
    try {
      if (priceLocked) {
        await onSave({ name: input.name, endsAt: input.endsAt, usageLimit: input.usageLimit } as PromotionInput);
      } else {
        await onSave(input);
      }
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : t("failed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title={initial ? initial.name : t("create")}>
      <div className="flex max-h-[70dvh] flex-col gap-3 overflow-y-auto">
        <Input label={t("name")} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        {priceLocked ? <p className="text-metadata text-state-attention">{t("pauseToEdit")}</p> : null}
        <Select
          label={t("type")}
          disabled={priceLocked}
          value={discountType}
          onChange={(e) => setDiscountType(e.target.value as "PERCENT" | "FIXED")}
          options={[
            { value: "PERCENT", label: t("percent") },
            { value: "FIXED", label: t("fixed") },
          ]}
        />
        <Input label={t("value")} hint={discountType === "PERCENT" ? t("valuePercentHint") : t("valueFixedHint")} inputMode="numeric" disabled={priceLocked} value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ""))} />
        {discountType === "PERCENT" ? <Input label={t("cap")} inputMode="numeric" disabled={priceLocked} value={cap} onChange={(e) => setCap(e.target.value.replace(/[^\d]/g, ""))} /> : null}
        <Select
          label={t("scope")}
          disabled={priceLocked}
          value={scope}
          onChange={(e) => setScope(e.target.value as PromotionScopeName)}
          options={scopes.map((s) => ({ value: s, label: s === "ALL" && mode === "SELLER" ? t("sellerAll") : t(`scope.${s}`) }))}
        />
        {scope === "CATEGORY" ? (
          <fieldset className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border border-border-subtle p-2" disabled={priceLocked}>
            {categories.map((c) => (
              <label key={c.id} className="flex min-h-9 items-center gap-2 text-body text-text-primary">
                <input type="checkbox" checked={categoryIds.includes(c.id)} onChange={() => setCategoryIds(toggle(categoryIds, c.id))} />
                {c.parentId ? "— " : ""}
                {c.name}
              </label>
            ))}
          </fieldset>
        ) : null}
        {scope === "PRODUCT" ? (
          <div className="flex flex-col gap-2">
            <Input label={t("searchProducts")} value={productQuery} disabled={priceLocked} onChange={(e) => setProductQuery(e.target.value)} />
            {productIds.length ? (
              <p className="text-metadata text-text-secondary">
                {t("selected")}: {productIds.map((id) => knownProducts[id] ?? id.slice(0, 8)).join(locale === "fa" ? "، " : ", ")}
              </p>
            ) : null}
            <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
              {productResults.map((p) => (
                <label key={p.id} className="flex min-h-9 items-center gap-2 text-body text-text-primary">
                  <input type="checkbox" disabled={priceLocked} checked={productIds.includes(p.id)} onChange={() => setProductIds(toggle(productIds, p.id))} />
                  {p.label}
                </label>
              ))}
            </div>
          </div>
        ) : null}
        {scope === "SELLER" ? (
          <fieldset className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border border-border-subtle p-2" disabled={priceLocked}>
            {sellerOptions.map((s) => (
              <label key={s.id} className="flex min-h-9 items-center gap-2 text-body text-text-primary">
                <input type="checkbox" checked={sellerIds.includes(s.id)} onChange={() => setSellerIds(toggle(sellerIds, s.id))} />
                {s.label}
              </label>
            ))}
          </fieldset>
        ) : null}
        <Input label={t("startsAt")} type="datetime-local" disabled={priceLocked} value={startsAt} hint={localizedDate(startsAt, locale) ?? undefined} onChange={(e) => setStartsAt(e.target.value)} />
        <Input label={t("endsAt")} type="datetime-local" value={endsAt} hint={localizedDate(endsAt, locale) ?? undefined} onChange={(e) => setEndsAt(e.target.value)} />
        <Input label={t("usageLimit")} inputMode="numeric" value={usageLimit} onChange={(e) => setUsageLimit(e.target.value.replace(/[^\d]/g, ""))} />
        {error ? (
          <p role="alert" className="text-metadata text-state-urgent">
            {error}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button className="flex-1" disabled={!valid} isLoading={saving} onClick={submit}>
            {initial ? t("saveChanges") : t("save")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
