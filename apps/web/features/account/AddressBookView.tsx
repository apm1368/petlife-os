"use client";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { CustomerAddressDto } from "@petlife/types";
import { Button, EmptyState, Input, MapPin, Skeleton, StatusLabel } from "@petlife/ui";
import { LocationPicker } from "@/features/maps/LocationPicker";
import { SystemState } from "@/features/system/SystemState";
import { addressesService, type CreateAddressInput } from "@/services/addresses.service";
import { householdsService } from "@/services/households.service";
import { AccountPageHeader } from "./AccountNav";
import "./address-book.css";

type Draft = {
  label: string;
  recipient: string;
  phone: string;
  city: string;
  region: string;
  area: string;
  addressLine: string;
  postalCode: string;
  instructions: string;
  isDefault: boolean;
  latitude: number | null;
  longitude: number | null;
};

const EMPTY: Draft = { label: "", recipient: "", phone: "", city: "", region: "", area: "", addressLine: "", postalCode: "", instructions: "", isDefault: false, latitude: null, longitude: null };

function fromAddress(a: CustomerAddressDto): Draft {
  return {
    label: a.label ?? "",
    recipient: a.recipient ?? "",
    phone: a.phone ?? "",
    city: a.city,
    region: a.region ?? "",
    area: a.area ?? "",
    addressLine: a.addressLine,
    postalCode: a.postalCode ?? "",
    instructions: a.instructions ?? "",
    isDefault: !!a.isDefault,
    latitude: a.latitude,
    longitude: a.longitude,
  };
}

/** Persian digits typed into the postal code become Latin, as couriers require. */
const latinDigits = (v: string) => v.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));

/**
 * The household's address book (account menu): every delivery address, which one is the default, the neighbourhood
 * and the map pin (required for new addresses, a nudge on older ones) that couriers, fares and "near me" use. The pin
 * is private to the household and saved only with the member's consent.
 */
export function AddressBookView() {
  const t = useTranslations("addressBook");
  const [householdId, setHouseholdId] = useState<string | null | undefined>(undefined);
  const [addresses, setAddresses] = useState<CustomerAddressDto[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<{ id: string | null; draft: Draft } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const households = await householdsService.listMine();
      const id = households[0]?.id ?? null;
      setHouseholdId(id);
      setAddresses(id ? await addressesService.list(id) : []);
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (failed) return <SystemState kind="GENERIC_RETRYABLE_ERROR" title={t("failed")} onRetry={() => void load()} />;

  return (
    <div className="address-book">
      <AccountPageHeader eyebrow={t("eyebrow")} title={t("title")} description={t("description")} />
      {notice ? (
        <p role="status" className="text-metadata text-state-success">
          {notice}
        </p>
      ) : null}
      {addresses === null || householdId === undefined ? (
        <Skeleton className="h-24 w-full" aria-label={t("loading")} />
      ) : householdId === null ? (
        <EmptyState title={t("noHousehold")} />
      ) : (
        <>
          {editing ? (
            <AddressForm
              householdId={householdId}
              editing={editing}
              onCancel={() => setEditing(null)}
              onSaved={(saved) => {
                setEditing(null);
                setNotice(t("saved"));
                setAddresses((list) => {
                  const rest = (list ?? []).filter((a) => a.id !== saved.id).map((a) => (saved.isDefault ? { ...a, isDefault: false } : a));
                  return [saved, ...rest].sort((a, b) => Number(!!b.isDefault) - Number(!!a.isDefault));
                });
              }}
            />
          ) : (
            <div>
              <Button onClick={() => setEditing({ id: null, draft: { ...EMPTY, isDefault: addresses.length === 0 } })}>{t("add")}</Button>
            </div>
          )}
          {addresses.length === 0 && !editing ? <EmptyState title={t("empty")} /> : null}
          <ul className="address-book__list">
            {addresses.map((a) => (
              <li key={a.id} className="address-book__item">
                <div>
                  <p className="address-book__title">
                    <strong>{a.label || a.recipient || a.city}</strong>
                    {a.isDefault ? <StatusLabel tone="success">{t("default")}</StatusLabel> : null}
                  </p>
                  <p>{[a.city, a.area, a.addressLine].filter(Boolean).join("، ")}</p>
                  <p className="address-book__meta">
                    {a.recipient ? <span>{a.recipient}</span> : null}
                    {a.phone ? <span dir="ltr">{a.phone}</span> : null}
                    {a.postalCode ? <span dir="ltr">{a.postalCode}</span> : null}
                    {a.latitude != null && a.longitude != null ? (
                      <span>
                        <MapPin size={14} aria-hidden /> {t("location.hasPoint")}
                      </span>
                    ) : (
                      <span className="address-book__nudge">{t("location.noPoint")}</span>
                    )}
                  </p>
                </div>
                <div className="address-book__actions">
                  <Button size="sm" variant="secondary" onClick={() => setEditing({ id: a.id, draft: fromAddress(a) })}>
                    {t("edit")}
                  </Button>
                  {!a.isDefault ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        try {
                          const saved = await addressesService.update(a.id, { isDefault: true });
                          setAddresses((list) => (list ?? []).map((x) => (x.id === saved.id ? saved : { ...x, isDefault: false })).sort((x, y) => Number(!!y.isDefault) - Number(!!x.isDefault)));
                        } catch {
                          setNotice(t("failedSave"));
                        }
                      }}
                    >
                      {t("makeDefault")}
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      if (!window.confirm(t("removeConfirm"))) return;
                      try {
                        const result = await addressesService.archive(a.id);
                        setAddresses((list) => (list ?? []).filter((x) => x.id !== a.id).map((x) => (x.id === result.newDefaultId ? { ...x, isDefault: true } : x)));
                        setNotice(t("removed"));
                      } catch {
                        setNotice(t("failedSave"));
                      }
                    }}
                  >
                    {t("remove")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function AddressForm({ householdId, editing, onCancel, onSaved }: { householdId: string; editing: { id: string | null; draft: Draft }; onCancel: () => void; onSaved: (a: CustomerAddressDto) => void }) {
  const t = useTranslations("addressBook");
  const [d, setD] = useState<Draft>(editing.draft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tp = useTranslations("locationPicker");
  // An already saved pin was consented to when it was saved; a new or moved pin needs the box ticked again.
  const savedPin = editing.draft.latitude != null && editing.draft.longitude != null ? { latitude: editing.draft.latitude, longitude: editing.draft.longitude } : null;
  const [consent, setConsent] = useState(savedPin !== null);
  const pin = d.latitude != null && d.longitude != null ? { latitude: d.latitude, longitude: d.longitude } : null;
  const pinChanged = (pin?.latitude ?? null) !== (savedPin?.latitude ?? null) || (pin?.longitude ?? null) !== (savedPin?.longitude ?? null);
  const set = (k: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement>) => setD((x) => ({ ...x, [k]: k === "postalCode" ? latinDigits(e.target.value) : e.target.value }));

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!d.addressLine.trim() || !d.city.trim() || (d.postalCode && !/^\d{10}$/.test(d.postalCode))) return setError(t("failedSave"));
    // New addresses need a pin (couriers and fares use it); older ones keep working without one.
    if (!editing.id && !pin) return setError(tp("pinNeeded"));
    if (pin && pinChanged && !consent) return setError(tp("consentNeeded"));
    setBusy(true);
    setError(null);
    const body: Omit<CreateAddressInput, "householdId"> = {
      label: d.label.trim() || undefined,
      recipient: d.recipient.trim() || undefined,
      phone: d.phone.trim() || undefined,
      city: d.city.trim(),
      region: d.region.trim() || undefined,
      area: d.area.trim() || undefined,
      addressLine: d.addressLine.trim(),
      postalCode: d.postalCode || undefined,
      instructions: d.instructions.trim() || undefined,
      countryCode: "IR",
      isDefault: d.isDefault,
      // Only a new or moved pin is sent (with the member's consent); a cleared pin is sent as null so the edit removes it.
      ...(pin && pinChanged ? { latitude: pin.latitude, longitude: pin.longitude, locationConsent: true } : !pin && savedPin ? { latitude: null, longitude: null } : {}),
    };
    try {
      onSaved(editing.id ? await addressesService.update(editing.id, body) : await addressesService.create({ householdId, ...body }));
    } catch {
      setError(t("failedSave"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="address-book__form" onSubmit={save} noValidate>
      <div className="address-book__grid">
        <Input label={t("fields.label")} value={d.label} onChange={set("label")} maxLength={100} />
        <Input label={t("fields.recipient")} value={d.recipient} onChange={set("recipient")} maxLength={200} autoComplete="name" />
        <Input label={t("fields.phone")} value={d.phone} onChange={set("phone")} inputMode="tel" dir="ltr" autoComplete="tel" maxLength={40} />
        <Input label={t("fields.city")} value={d.city} onChange={set("city")} required maxLength={120} autoComplete="address-level2" />
        <Input label={t("fields.region")} value={d.region} onChange={set("region")} maxLength={120} autoComplete="address-level1" />
        <Input label={t("fields.area")} value={d.area} onChange={set("area")} maxLength={120} />
      </div>
      <Input label={t("fields.addressLine")} value={d.addressLine} onChange={set("addressLine")} required maxLength={300} autoComplete="street-address" />
      <div className="address-book__grid">
        <Input label={t("fields.postalCode")} value={d.postalCode} onChange={set("postalCode")} inputMode="numeric" dir="ltr" maxLength={10} autoComplete="postal-code" />
        <Input label={t("fields.instructions")} value={d.instructions} onChange={set("instructions")} maxLength={500} />
      </div>
      <LocationPicker
        audience="member"
        required={!editing.id}
        value={pin}
        onChange={(p) => setD((x) => ({ ...x, latitude: p?.latitude ?? null, longitude: p?.longitude ?? null }))}
        consent={consent}
        onConsentChange={setConsent}
      />
      <label className="address-book__check">
        <input type="checkbox" checked={d.isDefault} onChange={(e) => setD((x) => ({ ...x, isDefault: e.target.checked }))} /> {t("fields.isDefault")}
      </label>
      {error ? (
        <p role="alert" className="text-metadata text-state-urgent">
          {error}
        </p>
      ) : null}
      <div className="address-book__actions">
        <Button type="submit" isLoading={busy}>
          {busy ? t("saving") : t("save")}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
