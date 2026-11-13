"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { AdminPetTaxiDriverDto } from "@petlife/types";
import { CarFront } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { petTaxiService } from "@/services/pet-taxi.service";
import { useAdminStore } from "@/stores/admin-store";

/** /admin/services/pet-taxi/drivers — staff check each driver's licence and vehicle before they can go online. */
export function AdminPetTaxiDriversView() {
  const t = useTranslations("adminPetTaxi.drivers");
  const context = useAdminStore((s) => s.context);
  const has = (p: string) => !!context?.permissions?.includes(p as never);
  const [rows, setRows] = useState<AdminPetTaxiDriverDto[] | null>(null);
  const [failed, setFailed] = useState<"forbidden" | "error" | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setFailed(null);
    try {
      setRows(await petTaxiService.adminDrivers());
    } catch (error) {
      setFailed(error instanceof ApiError && error.status === 403 ? "forbidden" : "error");
    }
  }, []);
  useEffect(() => void load(), [load]);

  if ((context && !has("services.view")) || failed === "forbidden")
    return (
      <section className="gx-card" role="alert">
        <h1>{t("title")}</h1>
        <p className="gx-muted">{t("forbidden")}</p>
      </section>
    );
  if (failed === "error")
    return (
      <div className="gx-inline-alert" role="alert">
        <p>{t("failed")}</p>
        <button type="button" className="gx-btn" onClick={() => void load()}>
          {t("retry")}
        </button>
      </div>
    );
  if (!rows) return <div className="gx-skel" style={{ height: 240 }} aria-label={t("loading")} />;
  const canManage = has("services.manage");

  async function decide(row: AdminPetTaxiDriverDto, status: "VERIFIED" | "SUSPENDED") {
    const reason = reasons[row.id]?.trim() ?? "";
    if (reason.length < 3) return setMessage({ ok: false, text: t("reasonRequired") });
    setBusy(row.id);
    setMessage(null);
    try {
      setRows(await petTaxiService.adminDecideDriver(row.id, status, reason));
      setReasons((r) => ({ ...r, [row.id]: "" }));
      setMessage({ ok: true, text: t("decided") });
    } catch {
      setMessage({ ok: false, text: t("failed") });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="gx-page">
      <header className="gx-head">
        <div>
          <p className="gx-kicker">
            <CarFront size={16} aria-hidden="true" />
            {t("kicker")}
          </p>
          <h1>{t("title")}</h1>
          <p>{t("subtitle")}</p>
        </div>
      </header>
      {message ? (
        <p role={message.ok ? "status" : "alert"} className="gx-muted">
          {message.text}
        </p>
      ) : null}
      <section className="gx-card">
        {rows.length === 0 ? (
          <p className="gx-empty">{t("empty")}</p>
        ) : (
          <div className="gx-table-wrap">
            <table className="gx-table">
              <thead>
                <tr>
                  <th>{t("columns.name")}</th>
                  <th>{t("columns.organization")}</th>
                  <th>{t("columns.licence")}</th>
                  <th>{t("columns.vehicle")}</th>
                  <th>{t("columns.status")}</th>
                  {canManage ? <th>{t("columns.decision")}</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>
                      {r.organizationName}
                      {!r.organizationVerified ? <small className="gx-muted"> · {t("orgNotVerified")}</small> : null}
                    </td>
                    <td dir="auto">{r.licenceNumber}</td>
                    <td>
                      <span dir="auto">{r.vehiclePlate}</span> · {r.vehicleDescription}
                    </td>
                    <td>
                      <span className="gx-tag">{t(`status.${r.status}`)}</span>
                      {r.statusReason ? <small className="gx-muted"> {r.statusReason}</small> : null}
                    </td>
                    {canManage ? (
                      <td>
                        <div className="gx-toolbar">
                          <label className="gx-field">
                            <span>{t("reason")}</span>
                            <input value={reasons[r.id] ?? ""} maxLength={300} onChange={(e) => setReasons((x) => ({ ...x, [r.id]: e.target.value }))} />
                          </label>
                          {r.status !== "VERIFIED" ? (
                            <button type="button" className="gx-btn gx-btn--primary" disabled={busy !== null || !r.organizationVerified} onClick={() => void decide(r, "VERIFIED")}>
                              {t("verify")}
                            </button>
                          ) : null}
                          {r.status !== "SUSPENDED" ? (
                            <button type="button" className="gx-btn" disabled={busy !== null} onClick={() => void decide(r, "SUSPENDED")}>
                              {t("suspend")}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
