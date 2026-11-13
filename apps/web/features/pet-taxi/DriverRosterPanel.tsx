"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { PetTaxiDriversDto } from "@petlife/types";
import { Button, StatusLabel } from "@petlife/ui";
import { petTaxiService } from "@/services/pet-taxi.service";

const TONE = { PENDING: "attention", VERIFIED: "success", SUSPENDED: "urgent" } as const;

/**
 * The owner's drivers: who may drive for this organization, with licence and vehicle. New or changed details wait for
 * opetlife staff to check them; until then that person cannot go online.
 */
export function DriverRosterPanel() {
  const t = useTranslations("petTaxi.driver.roster");
  const [data, setData] = useState<PetTaxiDriversDto | null>(null);
  const [form, setForm] = useState({ providerUserId: "", licenceNumber: "", vehiclePlate: "", vehicleDescription: "" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await petTaxiService.drivers());
    } catch {
      setMessage({ ok: false, text: t("failed") });
    }
  }, [t]);
  useEffect(() => void load(), [load]);

  async function save() {
    const providerUserId = form.providerUserId || data?.members[0]?.providerUserId || "";
    if (!providerUserId || form.licenceNumber.trim().length < 3 || form.vehiclePlate.trim().length < 3 || form.vehicleDescription.trim().length < 3) return setMessage({ ok: false, text: t("incomplete") });
    setBusy(true);
    setMessage(null);
    try {
      setData(await petTaxiService.registerDriver({ ...form, providerUserId }));
      setMessage({ ok: true, text: t("saved") });
      setForm({ providerUserId: "", licenceNumber: "", vehiclePlate: "", vehicleDescription: "" });
    } catch {
      setMessage({ ok: false, text: t("failed") });
    } finally {
      setBusy(false);
    }
  }

  const input = (key: "licenceNumber" | "vehiclePlate" | "vehicleDescription", max: number) => (
    <label className="pet-taxi__field">
      <span>{t(key)}</span>
      <input value={form[key]} maxLength={max} dir="auto" onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </label>
  );

  return (
    <section className="pet-taxi__panel" aria-labelledby="driver-roster">
      <h2 id="driver-roster">{t("title")}</h2>
      <p className="pet-taxi__muted">{t("hint")}</p>
      {data?.drivers.length ? (
        <ul className="pet-taxi__roster">
          {data.drivers.map((d) => (
            <li key={d.id}>
              <strong>{d.name}</strong> · <span dir="auto">{d.vehiclePlate}</span> · {d.vehicleDescription} <StatusLabel tone={TONE[d.status]}>{t(`status.${d.status}`)}</StatusLabel>
              {d.status === "SUSPENDED" && d.statusReason ? <small className="pet-taxi__muted"> {d.statusReason}</small> : null}
            </li>
          ))}
        </ul>
      ) : data ? (
        <p className="pet-taxi__muted">{t("empty")}</p>
      ) : null}
      {data?.members.length ? (
        <div className="pet-taxi__form">
          <label className="pet-taxi__field">
            <span>{t("member")}</span>
            <select value={form.providerUserId || data.members[0]!.providerUserId} onChange={(e) => setForm({ ...form, providerUserId: e.target.value })}>
              {data.members.map((m) => (
                <option key={m.providerUserId} value={m.providerUserId}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          {input("licenceNumber", 40)}
          {input("vehiclePlate", 20)}
          {input("vehicleDescription", 120)}
          <Button isLoading={busy} onClick={() => void save()}>
            {t("save")}
          </Button>
        </div>
      ) : null}
      {message ? (
        <p role={message.ok ? "status" : "alert"} className={message.ok ? "pet-taxi__muted" : "pet-taxi__error"}>
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
