"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { SellerShippingProfileDto, ShippingProvider } from "@petlife/types";
import { Button, ContextSurface, ErrorRecovery, Input, LocateFixed, Skeleton } from "@petlife/ui";
import { apiFetch } from "@/lib/api/client";
import { useSellerStore } from "@/stores/seller-store";

type Pickup = SellerShippingProfileDto["pickup"];
const latinDigits = (v: string) => v.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

/**
 * Seller panel → Shipping: which of the methods opetlife has switched on this seller offers, and the pickup address
 * (with an optional map point) that every quote and courier request uses. Clinics that sell use the same page.
 */
export function SellerShippingView() {
  const t = useTranslations("seller.shipping");
  const tCommon = useTranslations("common");
  const sellerId = useSellerStore((s) => s.context?.active?.sellerOrganizationId);
  const role = useSellerStore((s) => s.context?.active?.role);
  const canEdit = role === "OWNER" || role === "ADMIN";
  const [profile, setProfile] = useState<SellerShippingProfileDto | null>(null);
  const [offered, setOffered] = useState<ShippingProvider[]>([]);
  const [pickup, setPickup] = useState<Pickup | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!sellerId) return;
    setFailed(false);
    try {
      const p = await apiFetch<SellerShippingProfileDto>(`/seller-organizations/${sellerId}/shipping-profile`);
      setProfile(p);
      setOffered(p.offeredProviders);
      setPickup(p.pickup);
    } catch {
      setFailed(true);
    }
  }, [sellerId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (failed) return <ErrorRecovery title={t("failed")} message={t("subtitle")} retryLabel={tCommon("retry")} onRetry={() => void load()} />;
  if (!profile || !pickup) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;

  const set = (k: keyof Pickup) => (e: React.ChangeEvent<HTMLInputElement>) => setPickup((p) => (p ? { ...p, [k]: k === "postalCode" ? latinDigits(e.target.value) : e.target.value } : p));

  async function save() {
    if (!sellerId || !pickup) return;
    if (pickup.postalCode && !/^\d{10}$/.test(pickup.postalCode)) return setMessage({ ok: false, text: t("saveFailed") });
    setBusy(true);
    setMessage(null);
    const str = (v: string | null) => (v && v.trim() ? v.trim() : undefined);
    try {
      const saved = await apiFetch<SellerShippingProfileDto>(`/seller-organizations/${sellerId}/shipping-profile`, {
        method: "PUT",
        body: {
          offeredProviders: offered,
          contactName: str(pickup.contactName),
          phone: str(pickup.phone),
          addressLine: str(pickup.addressLine),
          city: str(pickup.city),
          region: str(pickup.region),
          area: str(pickup.area),
          postalCode: str(pickup.postalCode),
          instructions: str(pickup.instructions),
          ...(pickup.latitude != null && pickup.longitude != null ? { latitude: pickup.latitude, longitude: pickup.longitude } : {}),
        },
      });
      setProfile(saved);
      setMessage({ ok: true, text: t("saved") });
    } catch {
      setMessage({ ok: false, text: t("saveFailed") });
    } finally {
      setBusy(false);
    }
  }

  function locate() {
    navigator.geolocation?.getCurrentPosition(
      (pos) => setPickup((p) => (p ? { ...p, latitude: Math.round(pos.coords.latitude * 1e6) / 1e6, longitude: Math.round(pos.coords.longitude * 1e6) / 1e6 } : p)),
      () => setMessage({ ok: false, text: t("locationDenied") }),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-page-title text-text-primary">{t("title")}</h1>
        <p className="text-body text-text-secondary">{t("subtitle")}</p>
      </header>
      {!canEdit ? <p className="text-metadata text-text-secondary">{t("readOnly")}</p> : null}

      <ContextSurface className="flex flex-col gap-3">
        <h2 className="text-section-title text-text-primary">{t("methods")}</h2>
        <p className="text-metadata text-text-secondary">{t("methodsHint")}</p>
        {profile.availableProviders.length === 0 ? <p className="text-metadata text-text-secondary">{t("noneActive")}</p> : null}
        <div className="flex flex-wrap gap-2">
          {profile.availableProviders.map((p) => (
            <label key={p} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border-default px-4">
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={offered.includes(p)}
                onChange={(e) => setOffered((list) => (e.target.checked ? [...list, p] : list.filter((x) => x !== p)))}
              />
              <span className="text-body text-text-primary">{t(`provider.${p}`)}</span>
            </label>
          ))}
        </div>
      </ContextSurface>

      <ContextSurface className="flex flex-col gap-3">
        <h2 className="text-section-title text-text-primary">{t("pickup")}</h2>
        <p className="text-metadata text-text-secondary">{t("pickupHint")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label={t("fields.contactName")} value={pickup.contactName ?? ""} onChange={set("contactName")} disabled={!canEdit} maxLength={120} />
          <Input label={t("fields.phone")} value={pickup.phone ?? ""} onChange={set("phone")} disabled={!canEdit} dir="ltr" inputMode="tel" maxLength={40} />
          <Input label={t("fields.city")} value={pickup.city ?? ""} onChange={set("city")} disabled={!canEdit} maxLength={120} />
          <Input label={t("fields.region")} value={pickup.region ?? ""} onChange={set("region")} disabled={!canEdit} maxLength={120} />
          <Input label={t("fields.area")} value={pickup.area ?? ""} onChange={set("area")} disabled={!canEdit} maxLength={120} />
          <Input label={t("fields.postalCode")} value={pickup.postalCode ?? ""} onChange={set("postalCode")} disabled={!canEdit} dir="ltr" inputMode="numeric" maxLength={10} />
        </div>
        <Input label={t("fields.addressLine")} value={pickup.addressLine ?? ""} onChange={set("addressLine")} disabled={!canEdit} maxLength={300} />
        <Input label={t("fields.instructions")} value={pickup.instructions ?? ""} onChange={set("instructions")} disabled={!canEdit} maxLength={500} />
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={locate}>
              <LocateFixed size={16} aria-hidden /> {t("useLocation")}
            </Button>
            {pickup.latitude != null && pickup.longitude != null ? (
              <>
                <span dir="ltr" className="text-metadata text-text-secondary">
                  {pickup.latitude.toFixed(5)}, {pickup.longitude.toFixed(5)}
                </span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setPickup((p) => (p ? { ...p, latitude: null, longitude: null } : p))}>
                  {t("clearLocation")}
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
      </ContextSurface>

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void save()} isLoading={busy}>
            {busy ? t("saving") : t("save")}
          </Button>
          {message ? (
            <span role={message.ok ? "status" : "alert"} className={`text-metadata ${message.ok ? "text-state-success" : "text-state-urgent"}`}>
              {message.text}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
