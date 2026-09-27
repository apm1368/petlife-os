"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { Button, Input } from "@petlife/ui";
import type { ProviderServiceDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { providerOsService, type ProviderResource } from "@/services/provider-os.service";

const RESOURCE_TYPES: Record<string, [string, string]> = {
  EXAM_ROOM: ["اتاق معاینه", "Exam room"],
  GROOMING_STATION: ["میز آرایش", "Grooming station"],
  IMAGING_DEVICE: ["دستگاه تصویربرداری", "Imaging device"],
  VEHICLE: ["خودرو", "Vehicle"],
  TRAINING_ROOM: ["سالن آموزش", "Training room"],
  OTHER: ["سایر", "Other"],
};

/**
 * Booking policy + options for one service (owner only; the API enforces it). Changes apply to
 * future bookings only — confirmed bookings keep the terms they were booked under.
 */
export function ProviderServiceSettings({ service, onSaved }: { service: ProviderServiceDto; onSaved: (s: ProviderServiceDto) => void }) {
  const fa = useLocale() === "fa";
  const [policy, setPolicy] = useState({
    bookingMode: service.bookingMode as string,
    paymentMode: service.paymentMode as string,
    depositAmount: service.depositAmount ? String(service.depositAmount) : "",
    cancellationPolicy: service.cancellationPolicy ?? "",
    freeCancellationHours: String(service.freeCancellationHours),
    lateCancellationRefundPercent: String(service.lateCancellationRefundPercent),
    preparationNotes: service.preparationNotes ?? "",
    maxPetsPerBooking: String(service.maxPetsPerBooking),
    requiredResourceType: service.requiredResourceType ?? "",
  });
  const [variant, setVariant] = useState({ name: "", priceAmount: "", durationMinutes: String(service.durationMinutes) });
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const fail = (e: unknown) => setMessage({ tone: "error", text: e instanceof ApiError && e.code === "PROVIDER_ACCESS_DENIED" ? (fa ? "فقط مالک مجموعه می‌تواند تغییر دهد." : "Only the organization owner can change this.") : e instanceof ApiError ? e.message : fa ? "ذخیره نشد." : "Could not save." });

  async function savePolicy() {
    setBusy(true);
    setMessage(null);
    try {
      const updated = await providerOsService.updateService(service.id, {
        bookingMode: policy.bookingMode,
        paymentMode: policy.paymentMode,
        depositAmount: policy.depositAmount ? Number(policy.depositAmount) : null,
        cancellationPolicy: policy.cancellationPolicy.trim() || null,
        freeCancellationHours: Number(policy.freeCancellationHours),
        lateCancellationRefundPercent: Number(policy.lateCancellationRefundPercent),
        preparationNotes: policy.preparationNotes.trim() || null,
        maxPetsPerBooking: Number(policy.maxPetsPerBooking),
        requiredResourceType: policy.requiredResourceType || null,
      } as unknown as Partial<ProviderServiceDto>);
      onSaved(updated);
      setMessage({ tone: "ok", text: fa ? "ذخیره شد؛ برای نوبت‌های جدید اعمال می‌شود." : "Saved; applies to new bookings." });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function addVariant() {
    setBusy(true);
    setMessage(null);
    try {
      await providerOsService.createVariant(service.id, { name: variant.name.trim(), priceAmount: variant.priceAmount ? Number(variant.priceAmount) : null, durationMinutes: Number(variant.durationMinutes) });
      onSaved(await providerOsService.getService(service.id));
      setVariant({ name: "", priceAmount: "", durationMinutes: String(service.durationMinutes) });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function toggleVariant(id: string, isActive: boolean) {
    try {
      await providerOsService.updateVariant(service.id, id, { isActive });
      onSaved(await providerOsService.getService(service.id));
    } catch (e) {
      fail(e);
    }
  }

  const field = "rounded border border-border-subtle bg-surface-base p-2";
  return (
    <div className="flex flex-col gap-4 border-t border-border-subtle pt-3">
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 font-bold">{fa ? "قوانین رزرو" : "Booking policy"}</legend>
        <label className="flex flex-col gap-1 text-sm">{fa ? "نوع رزرو" : "Booking mode"}
          <select className={field} value={policy.bookingMode} onChange={(e) => setPolicy({ ...policy, bookingMode: e.target.value })}>
            <option value="INSTANT">{fa ? "فوری" : "Instant"}</option>
            <option value="REQUEST">{fa ? "درخواست و تأیید" : "Request and approve"}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">{fa ? "پرداخت" : "Payment"}
          <select className={field} value={policy.paymentMode} onChange={(e) => setPolicy({ ...policy, paymentMode: e.target.value })}>
            <option value="PAY_AT_PROVIDER">{fa ? "پرداخت در محل" : "Pay at provider"}</option>
            <option value="NONE">{fa ? "بدون هزینه" : "No charge"}</option>
            <option value="FULL_PREPAYMENT">{fa ? "پرداخت کامل آنلاین" : "Full online prepayment"}</option>
            <option value="DEPOSIT">{fa ? "پیش‌پرداخت آنلاین" : "Online deposit"}</option>
          </select>
        </label>
        {policy.paymentMode === "DEPOSIT" ? <Input label={fa ? "مبلغ پیش‌پرداخت (ریال)" : "Deposit (IRR)"} type="number" value={policy.depositAmount} onChange={(e) => setPolicy({ ...policy, depositAmount: e.target.value })} /> : null}
        <Input label={fa ? "لغو رایگان تا (ساعت قبل)" : "Free cancellation (hours before)"} type="number" value={policy.freeCancellationHours} onChange={(e) => setPolicy({ ...policy, freeCancellationHours: e.target.value })} />
        <Input label={fa ? "بازگشت وجه در لغو دیرهنگام (٪)" : "Late cancellation refund (%)"} type="number" value={policy.lateCancellationRefundPercent} onChange={(e) => setPolicy({ ...policy, lateCancellationRefundPercent: e.target.value })} />
        <Input label={fa ? "حداکثر حیوان در هر نوبت" : "Max pets per booking"} type="number" value={policy.maxPetsPerBooking} onChange={(e) => setPolicy({ ...policy, maxPetsPerBooking: e.target.value })} />
        <label className="flex flex-col gap-1 text-sm">{fa ? "منبع لازم" : "Required resource"}
          <select className={field} value={policy.requiredResourceType} onChange={(e) => setPolicy({ ...policy, requiredResourceType: e.target.value })}>
            <option value="">{fa ? "ندارد" : "None"}</option>
            {Object.entries(RESOURCE_TYPES).map(([k, v]) => <option key={k} value={k}>{v[fa ? 0 : 1]}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">{fa ? "متن قوانین لغو (به مشتری نمایش داده می‌شود)" : "Cancellation terms (shown to customers)"}
          <textarea className={field} maxLength={2000} value={policy.cancellationPolicy} onChange={(e) => setPolicy({ ...policy, cancellationPolicy: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">{fa ? "آمادگی قبل از مراجعه" : "Preparation before the visit"}
          <textarea className={field} maxLength={2000} value={policy.preparationNotes} onChange={(e) => setPolicy({ ...policy, preparationNotes: e.target.value })} />
        </label>
        <div className="sm:col-span-2"><Button isLoading={busy} onClick={() => void savePolicy()}>{fa ? "ذخیره قوانین" : "Save policy"}</Button></div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 font-bold">{fa ? "گزینه‌های خدمت (اندازه، مدت، نوع ویزیت)" : "Service options (size, duration, visit type)"}</legend>
        {service.variants.length ? (
          <ul className="divide-y divide-border-subtle text-sm">
            {service.variants.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className={v.isActive ? "" : "text-text-secondary line-through"}>{v.name} · {v.durationMinutes} {fa ? "دقیقه" : "min"}{v.priceAmount !== null ? ` · ${v.priceAmount.toLocaleString()}` : ""}</span>
                <Button variant="ghost" size="sm" onClick={() => void toggleVariant(v.id, !v.isActive)}>{v.isActive ? (fa ? "غیرفعال" : "Disable") : fa ? "فعال" : "Enable"}</Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-secondary">{fa ? "بدون گزینه؛ مشتری قیمت و مدت پایه را رزرو می‌کند." : "No options; customers book the base price and duration."}</p>
        )}
        <div className="grid gap-2 sm:grid-cols-[1fr_10rem_8rem_auto] sm:items-end">
          <Input label={fa ? "نام گزینه" : "Option name"} value={variant.name} onChange={(e) => setVariant({ ...variant, name: e.target.value })} />
          <Input label={fa ? "قیمت (ریال)" : "Price (IRR)"} type="number" value={variant.priceAmount} onChange={(e) => setVariant({ ...variant, priceAmount: e.target.value })} />
          <Input label={fa ? "مدت (دقیقه)" : "Minutes"} type="number" value={variant.durationMinutes} onChange={(e) => setVariant({ ...variant, durationMinutes: e.target.value })} />
          <Button variant="secondary" disabled={!variant.name.trim() || Number(variant.durationMinutes) < 5} isLoading={busy} onClick={() => void addVariant()}>{fa ? "افزودن" : "Add"}</Button>
        </div>
      </fieldset>
      {message ? <p role={message.tone === "error" ? "alert" : "status"} className={message.tone === "error" ? "text-state-urgent" : "text-brand-natural"}>{message.text}</p> : null}
    </div>
  );
}

/** Rooms, stations, devices and vehicles a service can require. */
export function ProviderResourcesSection({ locationId }: { locationId: string | null }) {
  const fa = useLocale() === "fa";
  const [resources, setResources] = useState<ProviderResource[] | null>(null);
  const [draft, setDraft] = useState({ name: "", type: "EXAM_ROOM" });
  const [error, setError] = useState<string | null>(null);

  const load = () => void providerOsService.listResources().then(setResources).catch(() => setResources([]));
  useEffect(load, []);

  async function add() {
    if (!locationId) return;
    setError(null);
    try {
      await providerOsService.createResource({ locationId, name: draft.name.trim(), type: draft.type });
      setDraft({ ...draft, name: "" });
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : fa ? "ثبت نشد" : "Could not save");
    }
  }

  async function toggle(r: ProviderResource) {
    setError(null);
    try {
      await providerOsService.updateResource(r.id, { isActive: !r.isActive });
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : fa ? "ذخیره نشد" : "Could not save");
    }
  }

  return (
    <section className="flex flex-col gap-3 border-t border-border-subtle pt-4">
      <h2 className="text-section-title">{fa ? "منابع (اتاق، میز، دستگاه، خودرو)" : "Resources (rooms, stations, devices, vehicles)"}</h2>
      <p className="text-sm text-text-secondary">{fa ? "اگر خدمتی منبع لازم داشته باشد، هم‌زمان بیش از تعداد منابع آزاد نوبت داده نمی‌شود." : "A service that requires a resource is never booked beyond the free resources at that time."}</p>
      {resources?.length ? (
        <ul className="divide-y divide-border-subtle text-sm">
          {resources.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 py-2">
              <span className={r.isActive ? "" : "text-text-secondary line-through"}>{r.name} · {RESOURCE_TYPES[r.type]?.[fa ? 0 : 1] ?? r.type}</span>
              <Button variant="ghost" size="sm" onClick={() => void toggle(r)}>{r.isActive ? (fa ? "غیرفعال" : "Disable") : fa ? "فعال" : "Enable"}</Button>
            </li>
          ))}
        </ul>
      ) : resources ? <p className="text-sm text-text-secondary">{fa ? "منبعی تعریف نشده است." : "No resources yet."}</p> : null}
      <div className="grid gap-2 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
        <Input label={fa ? "نام" : "Name"} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        <label className="flex flex-col gap-1 text-sm">{fa ? "نوع" : "Type"}
          <select className="rounded border border-border-subtle bg-surface-base p-2" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>
            {Object.entries(RESOURCE_TYPES).map(([k, v]) => <option key={k} value={k}>{v[fa ? 0 : 1]}</option>)}
          </select>
        </label>
        <Button variant="secondary" disabled={!draft.name.trim() || !locationId} onClick={() => void add()}>{fa ? "افزودن" : "Add"}</Button>
      </div>
      {error ? <p role="alert" className="text-state-urgent">{error}</p> : null}
    </section>
  );
}
