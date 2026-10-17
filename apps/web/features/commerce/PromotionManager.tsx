"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { Button, ContextSurface, Dialog, EmptyState, ErrorRecovery, Input, Select, Skeleton, StatusLabel } from "@petlife/ui";
import type { ProductCategoryDto, PromotionDto, PromotionInput, PromotionScopeName } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { formatCurrency } from "@/lib/currency/format-currency";
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

const L = {
  title: { fa: "تخفیف‌ها", en: "Promotions" },
  intro: {
    fa: "تخفیف‌ها خودکار روی قیمت اعمال می‌شوند؛ کد تخفیف ندارند و با هم جمع نمی‌شوند — برای هر کالا فقط بهترین تخفیف فعال حساب می‌شود. قیمت نهایی همیشه روی سرور محاسبه می‌شود.",
    en: "Promotions apply automatically — no codes, never stacked: each item gets only its single best live promotion. The final price is always computed on the server.",
  },
  create: { fa: "تخفیف جدید", en: "New promotion" },
  empty: { fa: "هنوز تخفیفی ساخته نشده است", en: "No promotions yet" },
  name: { fa: "نام (برای مشتری نمایش داده می‌شود)", en: "Name (shown to customers)" },
  type: { fa: "نوع تخفیف", en: "Discount type" },
  percent: { fa: "درصدی", en: "Percent" },
  fixed: { fa: "مبلغ ثابت برای هر واحد", en: "Fixed amount per unit" },
  value: { fa: "مقدار", en: "Value" },
  valuePercentHint: { fa: "۱ تا ۹۰ درصد", en: "1 to 90 percent" },
  valueFixedHint: { fa: "به تومان، برای هر واحد", en: "In Toman, per unit" },
  cap: { fa: "سقف تخفیف هر واحد (تومان، اختیاری)", en: "Max discount per unit (Toman, optional)" },
  scope: { fa: "دامنه", en: "Applies to" },
  scopeALL: { fa: "همه کالاها", en: "All products" },
  scopeCATEGORY: { fa: "دسته‌بندی‌های انتخاب‌شده", en: "Selected categories" },
  scopePRODUCT: { fa: "کالاهای انتخاب‌شده", en: "Selected products" },
  scopeSELLER: { fa: "فروشندگان انتخاب‌شده", en: "Selected sellers" },
  sellerAll: { fa: "همه کالاهای شما", en: "All of your products" },
  startsAt: { fa: "شروع", en: "Starts" },
  endsAt: { fa: "پایان (اختیاری)", en: "Ends (optional)" },
  usageLimit: { fa: "حداکثر تعداد سفارش (اختیاری)", en: "Max number of orders (optional)" },
  save: { fa: "ذخیره به‌عنوان پیش‌نویس", en: "Save as draft" },
  saveChanges: { fa: "ذخیره تغییرات", en: "Save changes" },
  cancel: { fa: "انصراف", en: "Cancel" },
  activate: { fa: "فعال‌سازی", en: "Activate" },
  pause: { fa: "توقف موقت", en: "Pause" },
  end: { fa: "پایان دادن", en: "End" },
  edit: { fa: "ویرایش", en: "Edit" },
  live: { fa: "در حال اجرا", en: "Live" },
  searchProducts: { fa: "جست‌وجوی کالا", en: "Search products" },
  selected: { fa: "انتخاب‌شده", en: "Selected" },
  used: { fa: "استفاده", en: "Used" },
  given: { fa: "تخفیف داده‌شده", en: "Discount given" },
  failed: { fa: "ذخیره نشد. دوباره تلاش کنید.", en: "Could not save. Please try again." },
  pauseToEdit: { fa: "برای تغییر مقدار یا دامنه، ابتدا تخفیف را متوقف کنید.", en: "Pause the promotion before changing its value or scope." },
  status: {
    DRAFT: { fa: "پیش‌نویس", en: "Draft" },
    ACTIVE: { fa: "فعال", en: "Active" },
    PAUSED: { fa: "متوقف", en: "Paused" },
    ENDED: { fa: "پایان‌یافته", en: "Ended" },
  },
  retry: { fa: "تلاش دوباره", en: "Retry" },
  loadFailed: { fa: "بارگیری نشد", en: "Could not load" },
} as const;

type Lang = "fa" | "en";

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Native date inputs are Gregorian; the Persian UI always shows the Jalali reading next to them. */
function jalali(value: string, lang: Lang): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(lang === "fa" ? "fa-IR" : "en-US", { dateStyle: "full", timeStyle: "short" }).format(d);
}

function describe(p: PromotionDto, lang: Lang): string {
  const value = p.discountType === "PERCENT" ? `${p.value.toLocaleString(lang === "fa" ? "fa-IR" : "en-US")}٪` : formatCurrency(p.value, lang);
  return value;
}

/**
 * Promotion manager (seller and admin share it; the API decides what each
 * may target). Shows live state, usage and discount actually given.
 */
export function PromotionManager({ api, mode, sellerOptions, productOptions }: { api: PromotionApi; mode: "PLATFORM" | "SELLER"; sellerOptions?: TargetOption[]; productOptions?: TargetOption[] }) {
  const lang = useLocale() as Lang;
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
      setActionError(err instanceof ApiError && err.status < 500 ? err.message : L.failed[lang]);
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <ErrorRecovery title={L.loadFailed[lang]} message="" retryLabel={L.retry[lang]} onRetry={load} />;
  if (!items) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h1 className="text-page-title text-text-primary">{L.title[lang]}</h1>
          <p className="text-metadata text-text-secondary">{L.intro[lang]}</p>
        </div>
        <Button onClick={() => setEditing("new")}>{L.create[lang]}</Button>
      </div>
      {actionError ? (
        <p role="alert" className="text-metadata text-state-urgent">
          {actionError}
        </p>
      ) : null}
      {items.length === 0 ? <EmptyState title={L.empty[lang]} /> : null}
      <div className="flex flex-col gap-3">
        {items.map((p) => (
          <ContextSurface key={p.id} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-body font-medium text-text-primary">{p.name}</p>
                <p className="text-metadata text-text-secondary">
                  {describe(p, lang)} · {L[`scope${p.scope}` as "scopeALL"]?.[lang] ?? p.scope}
                  {p.maxDiscountAmount ? ` · ${L.cap[lang].split(" (")[0]}: ${formatCurrency(p.maxDiscountAmount, lang)}` : ""}
                </p>
              </div>
              <div className="flex gap-1.5">
                {p.isLive ? <StatusLabel tone="success">{L.live[lang]}</StatusLabel> : null}
                <StatusLabel tone={p.status === "ACTIVE" ? "success" : p.status === "PAUSED" ? "attention" : "neutral"}>{L.status[p.status][lang]}</StatusLabel>
              </div>
            </div>
            <p className="text-metadata text-text-secondary">
              {jalali(p.startsAt, lang)}
              {p.endsAt ? ` — ${jalali(p.endsAt, lang)}` : ""}
            </p>
            <p className="text-metadata text-text-secondary">
              {L.used[lang]}: {p.usageCount.toLocaleString(lang === "fa" ? "fa-IR" : "en-US")}
              {p.usageLimit ? ` / ${p.usageLimit.toLocaleString(lang === "fa" ? "fa-IR" : "en-US")}` : ""} · {L.given[lang]}: {formatCurrency(p.discountGivenAmount, lang)}
            </p>
            <div className="flex flex-wrap gap-2">
              {p.status !== "ENDED" ? (
                <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                  {L.edit[lang]}
                </Button>
              ) : null}
              {p.status === "DRAFT" || p.status === "PAUSED" ? (
                <Button size="sm" variant="secondary" isLoading={busyId === p.id} onClick={() => transition(p, "ACTIVE")}>
                  {L.activate[lang]}
                </Button>
              ) : null}
              {p.status === "ACTIVE" ? (
                <Button size="sm" variant="secondary" isLoading={busyId === p.id} onClick={() => transition(p, "PAUSED")}>
                  {L.pause[lang]}
                </Button>
              ) : null}
              {p.status !== "ENDED" ? (
                <Button size="sm" variant="ghost" disabled={busyId === p.id} onClick={() => transition(p, "ENDED")}>
                  {L.end[lang]}
                </Button>
              ) : null}
            </div>
          </ContextSurface>
        ))}
      </div>

      {editing ? (
        <PromotionForm
          key={editing === "new" ? "new" : editing.id}
          lang={lang}
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
  lang,
  mode,
  initial,
  sellerOptions,
  productOptions,
  onClose,
  onSave,
}: {
  lang: Lang;
  mode: "PLATFORM" | "SELLER";
  initial: PromotionDto | null;
  sellerOptions: TargetOption[];
  productOptions?: TargetOption[];
  onClose: () => void;
  onSave: (input: PromotionInput) => Promise<void>;
}) {
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
      setError(err instanceof ApiError && err.status < 500 ? err.message : L.failed[lang]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title={initial ? initial.name : L.create[lang]}>
      <div className="flex max-h-[70dvh] flex-col gap-3 overflow-y-auto">
        <Input label={L.name[lang]} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        {priceLocked ? <p className="text-metadata text-state-attention">{L.pauseToEdit[lang]}</p> : null}
        <Select
          label={L.type[lang]}
          disabled={priceLocked}
          value={discountType}
          onChange={(e) => setDiscountType(e.target.value as "PERCENT" | "FIXED")}
          options={[
            { value: "PERCENT", label: L.percent[lang] },
            { value: "FIXED", label: L.fixed[lang] },
          ]}
        />
        <Input label={L.value[lang]} hint={discountType === "PERCENT" ? L.valuePercentHint[lang] : L.valueFixedHint[lang]} inputMode="numeric" disabled={priceLocked} value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ""))} />
        {discountType === "PERCENT" ? <Input label={L.cap[lang]} inputMode="numeric" disabled={priceLocked} value={cap} onChange={(e) => setCap(e.target.value.replace(/[^\d]/g, ""))} /> : null}
        <Select
          label={L.scope[lang]}
          disabled={priceLocked}
          value={scope}
          onChange={(e) => setScope(e.target.value as PromotionScopeName)}
          options={scopes.map((s) => ({ value: s, label: s === "ALL" && mode === "SELLER" ? L.sellerAll[lang] : L[`scope${s}` as "scopeALL"][lang] }))}
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
            <Input label={L.searchProducts[lang]} value={productQuery} disabled={priceLocked} onChange={(e) => setProductQuery(e.target.value)} />
            {productIds.length ? (
              <p className="text-metadata text-text-secondary">
                {L.selected[lang]}: {productIds.map((id) => knownProducts[id] ?? id.slice(0, 8)).join(lang === "fa" ? "، " : ", ")}
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
        <Input label={L.startsAt[lang]} type="datetime-local" disabled={priceLocked} value={startsAt} hint={jalali(startsAt, lang) ?? undefined} onChange={(e) => setStartsAt(e.target.value)} />
        <Input label={L.endsAt[lang]} type="datetime-local" value={endsAt} hint={jalali(endsAt, lang) ?? undefined} onChange={(e) => setEndsAt(e.target.value)} />
        <Input label={L.usageLimit[lang]} inputMode="numeric" value={usageLimit} onChange={(e) => setUsageLimit(e.target.value.replace(/[^\d]/g, ""))} />
        {error ? (
          <p role="alert" className="text-metadata text-state-urgent">
            {error}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            {L.cancel[lang]}
          </Button>
          <Button className="flex-1" disabled={!valid} isLoading={saving} onClick={submit}>
            {initial ? L.saveChanges[lang] : L.save[lang]}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
