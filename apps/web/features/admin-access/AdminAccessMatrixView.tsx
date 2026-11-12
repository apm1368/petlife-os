"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, KeyRound, Search, ShieldCheck, Users } from "@petlife/ui";
import Link from "@/features/navigation/localized-link";
import { ApiError } from "@/lib/api/client";
import { adminAccessService, type AdminPermissionDefinition, type AdminRole, type AdminRoleDefinition } from "@/services/admin-access.service";
import { useAdminStore } from "@/stores/admin-store";
import "@/features/admin/admin-glass.css";

const DOMAIN_ORDER = ["customer", "support", "dispute", "trust", "verification", "finance", "sellerFinance", "settlement", "subscription", "commerce", "promotions", "services", "travel", "insurance", "places", "animalSupport", "content", "pet", "task", "analytics", "audit", "access", "admin", "settings", "system"];

/**
 * Access levels at a glance: every role against every permission, grouped by business area, with member counts.
 * Read from the same catalogue the server enforces (ROLE_PERMISSIONS), so what is shown is exactly what is granted.
 */
export function AdminAccessMatrixView() {
  const t = useTranslations("adminAccessMatrix");
  const roleName = useTranslations("adminAccess.roles");
  const context = useAdminStore((s) => s.context);
  const allowed = !!context?.permissions.includes("access.view");
  const [roles, setRoles] = useState<AdminRoleDefinition[] | null>(null);
  const [permissions, setPermissions] = useState<AdminPermissionDefinition[] | null>(null);
  const [failed, setFailed] = useState<"forbidden" | "failed" | null>(null);
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState("");
  const [selected, setSelected] = useState<AdminRole[]>([]);
  const [onlyDifferences, setOnlyDifferences] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    setFailed(null);
    Promise.all([adminAccessService.roles(controller.signal), adminAccessService.permissions(controller.signal)])
      .then(([r, p]) => { if (!controller.signal.aborted) { setRoles(r); setPermissions(p); } })
      .catch((e: unknown) => { if (!controller.signal.aborted) setFailed(e instanceof ApiError && e.status === 403 ? "forbidden" : "failed"); });
    return () => controller.abort();
  }, [allowed, retry]);

  const label = (p: string) => (t.has(`permissions.${p.replace(/\./g, "_")}`) ? t(`permissions.${p.replace(/\./g, "_")}`) : p);
  const domainLabel = (d: string) => (t.has(`domains.${d}`) ? t(`domains.${d}`) : d);
  const columns = useMemo(() => (roles ?? []).filter((r) => !selected.length || selected.includes(r.role)), [roles, selected]);
  const groups = useMemo(() => {
    if (!permissions) return [];
    const q = query.trim().toLocaleLowerCase();
    const rows = permissions.filter((p) => (!domain || p.domain === domain) && (!q || p.permission.toLowerCase().includes(q) || label(p.permission).toLocaleLowerCase().includes(q)));
    const visible = onlyDifferences && columns.length > 1 ? rows.filter((p) => { const n = columns.filter((c) => c.permissions.includes(p.permission)).length; return n > 0 && n < columns.length; }) : rows;
    const rank = (d: string) => { const i = DOMAIN_ORDER.indexOf(d); return i === -1 ? DOMAIN_ORDER.length : i; };
    const domains = [...new Set(visible.map((p) => p.domain))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
    return domains.map((d) => ({ domain: d, rows: visible.filter((p) => p.domain === d) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissions, query, domain, onlyDifferences, columns]);

  if (!context) return <div className="gx-skel" style={{ height: 260 }} aria-label={t("loading")} />;
  if (!allowed || failed === "forbidden") return <section className="gx-card" role="alert"><h1>{t("title")}</h1><p className="gx-muted">{t("forbidden")}</p></section>;
  const toggle = (role: AdminRole) => setSelected((s) => (s.includes(role) ? s.filter((r) => r !== role) : [...s, role]));

  return (
    <div className="gx-page">
      <header className="gx-head">
        <div>
          <p className="gx-kicker"><ShieldCheck size={16} aria-hidden="true" />{t("kicker")}</p>
          <h1>{t("title")}</h1>
          <p>{t("subtitle")}</p>
        </div>
        <Link href="/admin/access" className="gx-btn"><Users size={16} aria-hidden="true" />{t("manageAdmins")}</Link>
      </header>

      {failed ? <div className="gx-card" role="alert"><p>{t("failed")}</p><button type="button" className="gx-btn" onClick={() => setRetry((n) => n + 1)}>{t("retry")}</button></div> : !roles || !permissions ? <div className="gx-skel" style={{ height: 360 }} aria-label={t("loading")} /> : (
        <>
          <section className="gx-grid gx-grid--kpi" aria-label={t("roles")}>
            {roles.map((r) => (
              <button key={r.role} type="button" className="gx-kpi" aria-pressed={selected.includes(r.role)} onClick={() => toggle(r.role)} style={{ textAlign: "start", cursor: "pointer", outline: selected.includes(r.role) ? "2px solid var(--brand-natural)" : undefined }}>
                <span className="gx-kpi__label"><KeyRound size={16} aria-hidden="true" />{roleName.has(r.role) ? roleName(r.role) : r.role}</span>
                <span className="gx-kpi__value" style={{ fontSize: "1.3rem" }}>{t("permissionCount", { count: r.permissions.length })}</span>
                <span className="gx-kpi__foot"><span>{t("members", { active: r.activeMembers, suspended: r.suspendedMembers })}</span>{r.protected ? <span className="gx-tag gx-tag--VIP">{t("protected")}</span> : null}</span>
              </button>
            ))}
          </section>

          <section className="gx-card">
            <header><h2>{t("matrix")}</h2><p>{selected.length ? t("comparing", { count: selected.length }) : t("matrixHint")}</p></header>
            <div className="gx-toolbar" style={{ marginBottom: 12 }}>
              <label className="gx-field" style={{ flex: 1, minWidth: 200 }}><span>{t("search")}</span>
                <span style={{ position: "relative" }}><Search size={16} aria-hidden="true" style={{ position: "absolute", insetInlineStart: 12, top: 12 }} /><input style={{ paddingInlineStart: 36, width: "100%" }} value={query} onChange={(e) => setQuery(e.target.value)} /></span>
              </label>
              <label className="gx-field"><span>{t("domain")}</span>
                <select value={domain} onChange={(e) => setDomain(e.target.value)}><option value="">{t("allDomains")}</option>{[...new Set(permissions.map((p) => p.domain))].map((d) => <option key={d} value={d}>{domainLabel(d)}</option>)}</select>
              </label>
              <label className="gx-chip" style={{ cursor: "pointer" }}><input type="checkbox" checked={onlyDifferences} disabled={selected.length < 2} onChange={(e) => setOnlyDifferences(e.target.checked)} />{t("onlyDifferences")}</label>
              {selected.length ? <button type="button" className="gx-btn" onClick={() => { setSelected([]); setOnlyDifferences(false); }}>{t("clearSelection")}</button> : null}
            </div>
            <div className="gx-table-wrap" style={{ maxHeight: "70vh", overflow: "auto" }}>
              <table className="gx-table" style={{ minWidth: `${16 + columns.length * 6.5}rem` }}>
                <thead>
                  <tr>
                    <th scope="col" style={{ position: "sticky", insetInlineStart: 0, top: 0, zIndex: 3, background: "var(--glass-solid)", minWidth: "15rem" }}>{t("permission")}</th>
                    {columns.map((c) => <th key={c.role} scope="col" style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--glass-solid)", textAlign: "center", whiteSpace: "normal", minWidth: "6rem" }}>{roleName.has(c.role) ? roleName(c.role) : c.role}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {groups.length === 0 ? <tr><td colSpan={columns.length + 1} className="gx-empty">{t("empty")}</td></tr> : groups.flatMap((g) => [
                    <tr key={`d-${g.domain}`}><th colSpan={columns.length + 1} scope="colgroup" style={{ background: "var(--glass-hover)", fontWeight: 800, color: "var(--text-primary)" }}>{domainLabel(g.domain)}</th></tr>,
                    ...g.rows.map((p) => (
                      <tr key={p.permission}>
                        <th scope="row" style={{ position: "sticky", insetInlineStart: 0, background: "var(--glass-solid)", fontWeight: 600, whiteSpace: "normal", color: "var(--text-primary)" }}>
                          {label(p.permission)}<small className="gx-muted" style={{ display: "block" }}><bdi dir="ltr">{p.permission}</bdi></small>
                        </th>
                        {columns.map((c) => {
                          const has = c.permissions.includes(p.permission);
                          return <td key={c.role} style={{ textAlign: "center" }} aria-label={`${roleName.has(c.role) ? roleName(c.role) : c.role}: ${has ? t("granted") : t("notGranted")}`}>{has ? <Check size={18} aria-hidden="true" color="var(--chart-1)" /> : <span aria-hidden="true" style={{ color: "var(--glass-edge)" }}>—</span>}</td>;
                        })}
                      </tr>
                    )),
                  ])}
                </tbody>
              </table>
            </div>
            <p className="gx-muted" style={{ marginTop: 12 }}>{t("footnote")}</p>
          </section>
        </>
      )}
    </div>
  );
}
