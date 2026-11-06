"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, Input, Select } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { useAdminStore } from "@/stores/admin-store";
import { adminAccessService, type AdminCustomRole, type AdminCustomRoleQueue, type AdminPermissionDefinition } from "@/services/admin-access.service";

const roleVerticals = ["CLINIC", "GROOMING", "ACCOMMODATION", "INSURANCE", "SHOP", "CONTENT", "SUPPORT"] as const;

export function CustomRolesPanel({ permissions, onChanged }: { permissions: AdminPermissionDefinition[]; onChanged: () => void }) {
  const t = useTranslations("adminAccess.customRoles");
  const context = useAdminStore((state) => state.context);
  const canManage = context?.role === "SUPER_ADMIN" && context.permissions.includes("admin.manage");
  const [queue, setQueue] = useState<AdminCustomRoleQueue | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [selectedVerticals, setSelectedVerticals] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [reviewReasons, setReviewReasons] = useState<Record<string, string>>({});

  const refresh = useCallback(async () => {
    setLoading(true); setFailed(false);
    try { setQueue(await adminAccessService.customRoles()); }
    catch { setFailed(true); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  function toggle(values: string[], setValues: (next: string[]) => void, value: string) {
    setValues(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
  }
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || !canManage) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      await adminAccessService.createCustomRole({ key, label, description, permissions: selectedPermissions, verticals: selectedVerticals, reason });
      setKey(""); setLabel(""); setDescription(""); setSelectedPermissions([]); setSelectedVerticals([]); setReason("");
      setMessage(t("proposed")); await refresh(); onChanged();
    } catch (caught) {
      const rule = caught instanceof ApiError ? caught.details?.reason : undefined;
      setError(rule === "INVALID_CUSTOM_ROLE" ? t("invalid") : t("saveFailed"));
    } finally { setBusy(false); }
  }
  async function review(type: "role" | "assignment", id: string, decision: "APPROVE" | "REJECT") {
    const reviewReason = reviewReasons[id]?.trim() ?? "";
    if (busy || !canManage || reviewReason.length < 5) return;
    setBusy(true); setError(null);
    try {
      if (type === "role") await adminAccessService.reviewCustomRole(id, decision, reviewReason);
      else await adminAccessService.reviewCustomRoleAssignment(id, decision, reviewReason);
      setReviewReasons((previous) => ({ ...previous, [id]: "" }));
      setMessage(t("reviewed")); await refresh(); onChanged();
    } catch (caught) {
      const rule = caught instanceof ApiError ? caught.details?.rule : undefined;
      setError(rule === "SELF_APPROVAL_FORBIDDEN" ? t("selfApproval") : t("saveFailed"));
    } finally { setBusy(false); }
  }

  return <div className="space-y-4">
    {canManage && <ContextSurface>
      <h2 className="text-section-title">{t("createTitle")}</h2>
      <p className="my-2 text-sm text-text-secondary">{t("approvalHelp")}</p>
      <form className="space-y-4" onSubmit={create}>
        <div className="grid gap-3 md:grid-cols-2">
          <Input label={t("key")} required minLength={2} maxLength={40} pattern="[a-z][a-z0-9-]{1,39}" value={key} onChange={(event) => setKey(event.target.value)} />
          <Input label={t("label")} required minLength={2} maxLength={80} value={label} onChange={(event) => setLabel(event.target.value)} />
        </div>
        <Input label={t("description")} required minLength={5} maxLength={300} value={description} onChange={(event) => setDescription(event.target.value)} />
        <fieldset className="space-y-2"><legend className="font-medium">{t("permissions")}</legend><div className="grid gap-2 md:grid-cols-2">{permissions.filter((item) => item.customRoleAllowed).map((item) => <label key={item.permission} className="flex items-start gap-2"><input type="checkbox" checked={selectedPermissions.includes(item.permission)} onChange={() => toggle(selectedPermissions, setSelectedPermissions, item.permission)} /><bdi dir="ltr">{item.permission}</bdi></label>)}</div></fieldset>
        <fieldset className="space-y-2"><legend className="font-medium">{t("verticals")}</legend><div className="flex flex-wrap gap-3">{roleVerticals.map((vertical) => <label key={vertical} className="flex items-center gap-2"><input type="checkbox" checked={selectedVerticals.includes(vertical)} onChange={() => toggle(selectedVerticals, setSelectedVerticals, vertical)} />{t(`vertical.${vertical}`)}</label>)}</div></fieldset>
        <Input label={t("reason")} required minLength={5} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
        <Button type="submit" disabled={busy || selectedPermissions.length === 0 || selectedVerticals.length === 0 || reason.trim().length < 5}>{busy ? t("working") : t("propose")}</Button>
      </form>
    </ContextSurface>}
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
    {loading ? <p role="status">{t("loading")}</p> : failed ? <div><p role="alert">{t("loadFailed")}</p><Button variant="secondary" onClick={() => void refresh()}>{t("retry")}</Button></div> : <>
      <ContextSurface className="space-y-3"><h2 className="text-section-title">{t("definitions")}</h2>
        {(queue?.roles ?? []).length === 0 ? <p>{t("empty")}</p> : queue?.roles.map((role) => <div key={role.id} className="space-y-2 border-b pb-3 last:border-0"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">{role.label} <bdi dir="ltr" className="text-sm">({role.key})</bdi></h3><span>{t(`status.${role.status}`)}</span></div><p className="text-sm">{role.description}</p><div className="flex flex-wrap gap-2">{role.permissions.map((permission) => <bdi key={permission} dir="ltr" className="rounded border px-2 py-1 text-xs">{permission}</bdi>)}</div><p className="text-sm text-text-secondary">{t("scope")}: {role.verticals.map((vertical) => t(`vertical.${vertical}`)).join(" · ")}</p>
          {canManage && role.status === "PENDING" && role.requestedByAdminId !== context?.adminUserId && <div className="flex flex-wrap items-end gap-2"><Input label={t("reviewReason")} minLength={5} maxLength={500} value={reviewReasons[role.id] ?? ""} onChange={(event) => setReviewReasons((previous) => ({ ...previous, [role.id]: event.target.value }))} /><Button disabled={busy || (reviewReasons[role.id]?.trim().length ?? 0) < 5} onClick={() => void review("role", role.id, "APPROVE")}>{t("approve")}</Button><Button variant="secondary" disabled={busy || (reviewReasons[role.id]?.trim().length ?? 0) < 5} onClick={() => void review("role", role.id, "REJECT")}>{t("reject")}</Button></div>}
        </div>)}
      </ContextSurface>
      <ContextSurface className="space-y-3"><h2 className="text-section-title">{t("pendingAssignments")}</h2>
        {(queue?.pendingAssignments ?? []).length === 0 ? <p>{t("empty")}</p> : queue?.pendingAssignments.map((item) => <div key={item.id} className="flex flex-wrap items-end gap-3 border-b pb-3 last:border-0"><div className="min-w-48 flex-1"><p className="font-medium">{item.displayName ?? t("unnamed")}</p><p>{item.customRoleLabel ?? t("removeRole")} · {item.reason}</p></div>
          {canManage && item.requestedByAdminId !== context?.adminUserId && <><Input label={t("reviewReason")} minLength={5} maxLength={500} value={reviewReasons[item.id] ?? ""} onChange={(event) => setReviewReasons((previous) => ({ ...previous, [item.id]: event.target.value }))} /><Button disabled={busy || (reviewReasons[item.id]?.trim().length ?? 0) < 5} onClick={() => void review("assignment", item.id, "APPROVE")}>{t("approve")}</Button><Button variant="secondary" disabled={busy || (reviewReasons[item.id]?.trim().length ?? 0) < 5} onClick={() => void review("assignment", item.id, "REJECT")}>{t("reject")}</Button></>}
        </div>)}
      </ContextSurface>
    </>}
  </div>;
}

export function CustomRoleAssignmentForm({ adminId, roles: suppliedRoles, onSaved }: { adminId: string; roles?: AdminCustomRole[]; onSaved: () => void }) {
  const t = useTranslations("adminAccess.customRoles");
  const [roleId, setRoleId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [fetchedRoles, setFetchedRoles] = useState<AdminCustomRole[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(!suppliedRoles);
  const [rolesFailed, setRolesFailed] = useState(false);
  const [roleLoadRevision, setRoleLoadRevision] = useState(0);
  useEffect(() => {
    if (suppliedRoles) return;
    let active = true;
    setLoadingRoles(true); setRolesFailed(false);
    adminAccessService.customRoles().then((data) => { if (active) setFetchedRoles(data.roles.filter((role) => role.status === "ACTIVE")); })
      .catch(() => { if (active) setRolesFailed(true); })
      .finally(() => { if (active) setLoadingRoles(false); });
    return () => { active = false; };
  }, [suppliedRoles, roleLoadRevision]);
  const roles = suppliedRoles ?? fetchedRoles;
  const options = roles.filter((role) => role.status === "ACTIVE");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || reason.trim().length < 5) return;
    setBusy(true); setError(false);
    try { await adminAccessService.requestCustomRoleAssignment(adminId, roleId || null, reason.trim()); setReason(""); onSaved(); }
    catch { setError(true); }
    finally { setBusy(false); }
  }
  return <ContextSurface className="space-y-3"><h3 className="font-medium">{t("assignmentTitle")}</h3><p className="text-sm text-text-secondary">{t("approvalHelp")}</p>{loadingRoles ? <p role="status">{t("loading")}</p> : rolesFailed ? <div><p role="alert">{t("loadFailed")}</p><Button variant="secondary" onClick={() => setRoleLoadRevision((value) => value + 1)}>{t("retry")}</Button></div> : <form className="flex flex-wrap items-end gap-3" onSubmit={submit}>
    <Select label={t("role")} value={roleId} onChange={(event) => setRoleId(event.target.value)} options={[{ value: "", label: t("removeRole") }, ...options.map((role) => ({ value: role.id, label: role.label }))]} />
    <Input label={t("reason")} required minLength={5} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /><Button type="submit" disabled={busy || reason.trim().length < 5}>{busy ? t("working") : t("requestAssignment")}</Button>
  </form>}{error && <p role="alert">{t("saveFailed")}</p>}</ContextSurface>;
}
