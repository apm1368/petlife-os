"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ApiError } from "@/lib/api/client";
import Link from "@/features/navigation/localized-link";
import { adminAccessService, type AdminCustomRoleDto, type AdminMembership } from "@/services/admin-access.service";

/** Gives one admin an owner-defined role, or clears it to restore their built-in role. admin.manage only. */
export function AdminCustomRoleAssign({ member, canManage, isSelf, onSaved }: { member: AdminMembership; canManage: boolean; isSelf: boolean; onSaved: () => void }) {
  const t = useTranslations("adminCustomRoles");
  const [roles, setRoles] = useState<AdminCustomRoleDto[] | null>(null);
  const [choice, setChoice] = useState<string>(member.customRole?.id ?? "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const blocked = member.role === "SUPER_ADMIN" || isSelf;

  useEffect(() => {
    if (!canManage || blocked) return;
    const controller = new AbortController();
    adminAccessService
      .customRoles(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setRoles(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setRoles([]);
      });
    return () => controller.abort();
  }, [canManage, blocked]);

  const current = member.customRole?.id ?? "";
  async function save() {
    if (busy || choice === current || reason.trim().length < 5) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await adminAccessService.assignCustomRole(member.id, choice || null, reason.trim());
      setSaved(true);
      setReason("");
      onSaved();
    } catch (e) {
      const rule = e instanceof ApiError ? (e.details?.rule ?? e.details?.reason) : undefined;
      setError(typeof rule === "string" && t.has(`rules.${rule}`) ? t(`rules.${rule}`) : t("saveFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="gx-card" aria-labelledby={`custom-role-${member.id}`}>
      <header>
        <h3 id={`custom-role-${member.id}`}>{t("assignTitle")}</h3>
        <Link href="/admin/access/roles" className="gx-link">{t("manageRoles")}</Link>
      </header>
      <p className="gx-muted">{member.customRole ? t("assignedNow", { name: member.customRole.name }) : t("builtInNow")}</p>
      {!canManage ? null : blocked ? (
        <p className="gx-muted">{member.role === "SUPER_ADMIN" ? t("rules.PROTECTED_ROLE") : t("rules.SELF_CHANGE_FORBIDDEN")}</p>
      ) : !roles ? (
        <div className="gx-skel" style={{ height: 48 }} aria-label={t("loading")} />
      ) : (
        <div className="gx-role-editor__basics">
          <label className="gx-field">
            {t("assignLabel")}
            <select value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="">{t("noCustomRole")}</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </label>
          <label className="gx-field">
            {t("reason")}
            <input value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder={t("reasonPlaceholder")} />
          </label>
          <div className="gx-toolbar">
            <button type="button" className="gx-btn gx-btn--primary" disabled={busy || choice === current || reason.trim().length < 5} onClick={() => void save()}>
              {busy ? t("saving") : t("assign")}
            </button>
            {saved ? <span role="status" className="gx-muted">{t("assignSaved")}</span> : null}
          </div>
          {error ? <p role="alert" className="gx-inline-alert">{error}</p> : null}
        </div>
      )}
    </section>
  );
}
