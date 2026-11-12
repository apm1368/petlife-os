"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, KeyRound, Plus, Save, X } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import Link from "@/features/navigation/localized-link";
import { useAdminStore } from "@/stores/admin-store";
import {
  adminAccessService,
  adminVerticals,
  type AdminCustomRoleDto,
  type AdminPermissionDefinition,
  type AdminVertical,
} from "@/services/admin-access.service";

/**
 * Owner-defined roles, edited section by section. Each permission domain (customers, shop, travel…) gets a level —
 * no access, view only, or full — and can be opened for fine-grained choices. The sections follow the back-office
 * sidebar so a role reads the way the menu does. admin.manage is never offered: managing admins stays with
 * SUPER_ADMIN (the API and the database refuse it too).
 */
const SECTIONS: { key: string; domains: string[] }[] = [
  { key: "overview", domains: ["analytics", "task"] },
  { key: "customers", domains: ["customer", "support", "dispute", "subscription", "pet"] },
  { key: "marketplace", domains: ["verification", "orders", "commerce", "promotions", "services", "travel", "insurance", "places"] },
  { key: "trust", domains: ["trust", "animalSupport"] },
  { key: "finance", domains: ["finance", "sellerFinance", "settlement", "wallet"] },
  { key: "content", domains: ["content"] },
  { key: "system", domains: ["settings", "access", "audit", "system"] },
];
const NOT_DELEGABLE = new Set(["admin.manage"]);
type Level = "none" | "view" | "full" | "custom";

interface Draft {
  id: string | null;
  name: string;
  description: string;
  permissions: Set<string>;
  verticals: Set<AdminVertical>;
  reason: string;
}

const emptyDraft = (): Draft => ({ id: null, name: "", description: "", permissions: new Set(), verticals: new Set(), reason: "" });

export function AdminCustomRolesView() {
  const t = useTranslations("adminCustomRoles");
  const tShell = useTranslations("admin.shell");
  const tm = useTranslations("adminAccessMatrix");
  const tAccess = useTranslations("adminAccess");
  const locale = useLocale();
  const context = useAdminStore((s) => s.context);
  const canView = !!context?.permissions.includes("access.view");
  const canManage = !!context?.permissions.includes("admin.manage");
  const [roles, setRoles] = useState<AdminCustomRoleDto[] | null>(null);
  const [catalog, setCatalog] = useState<AdminPermissionDefinition[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [archiving, setArchiving] = useState<{ role: AdminCustomRoleDto; reason: string } | null>(null);

  useEffect(() => {
    if (!canView) return;
    const controller = new AbortController();
    setFailed(false);
    Promise.all([adminAccessService.customRoles(controller.signal), adminAccessService.permissions(controller.signal)])
      .then(([r, p]) => {
        if (controller.signal.aborted) return;
        setRoles(r);
        setCatalog(p.filter((row) => !NOT_DELEGABLE.has(row.permission)));
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [canView, revision]);

  const byDomain = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of catalog ?? []) map.set(row.domain, [...(map.get(row.domain) ?? []), row.permission]);
    return map;
  }, [catalog]);
  const sections = useMemo(
    () => SECTIONS.map((s) => ({ ...s, domains: s.domains.filter((d) => byDomain.has(d)) })).filter((s) => s.domains.length),
    [byDomain],
  );
  const permissionLabel = (p: string) => (tm.has(`permissions.${p.replace(/\./g, "_")}`) ? tm(`permissions.${p.replace(/\./g, "_")}`) : p);
  const domainLabel = (d: string) => (tm.has(`domains.${d}`) ? tm(`domains.${d}`) : d);
  const viewSet = (domain: string) => (byDomain.get(domain) ?? []).filter((p) => p.endsWith(".view"));
  const levelOf = (domain: string, granted: ReadonlySet<string>): Level => {
    const all = byDomain.get(domain) ?? [];
    const have = all.filter((p) => granted.has(p));
    if (!have.length) return "none";
    if (have.length === all.length) return "full";
    const view = viewSet(domain);
    if (view.length && have.length === view.length && view.every((p) => granted.has(p))) return "view";
    return "custom";
  };
  const fmt = (n: number) => new Intl.NumberFormat(locale === "fa" ? "fa-IR" : locale).format(n);

  if (!context) return <p role="status">{t("loading")}</p>;
  if (!canView) return <p role="alert">{t("forbidden")}</p>;

  const setLevel = (domain: string, level: Exclude<Level, "custom">) =>
    setDraft((d) => {
      if (!d) return d;
      const next = new Set(d.permissions);
      for (const p of byDomain.get(domain) ?? []) next.delete(p);
      const add = level === "full" ? byDomain.get(domain) ?? [] : level === "view" ? viewSet(domain) : [];
      for (const p of add) next.add(p);
      return { ...d, permissions: next };
    });
  const togglePermission = (p: string) =>
    setDraft((d) => {
      if (!d) return d;
      const next = new Set(d.permissions);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return { ...d, permissions: next };
    });
  const toggleVertical = (v: AdminVertical) =>
    setDraft((d) => {
      if (!d) return d;
      const next = new Set(d.verticals);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return { ...d, verticals: next };
    });
  const ruleText = (e: unknown) => {
    const rule = e instanceof ApiError ? (e.details?.rule ?? e.details?.reason) : undefined;
    return typeof rule === "string" && t.has(`rules.${rule}`) ? t(`rules.${rule}`) : t("saveFailed");
  };

  async function save() {
    if (!draft || busy) return;
    if (draft.name.trim().length < 2 || draft.permissions.size === 0 || draft.reason.trim().length < 5) {
      setError(t("incomplete"));
      return;
    }
    setBusy(true);
    setError(null);
    const input = {
      name: draft.name.trim(),
      description: draft.description.trim() || undefined,
      permissions: [...draft.permissions],
      verticals: [...draft.verticals],
      reason: draft.reason.trim(),
    };
    try {
      if (draft.id) await adminAccessService.updateCustomRole(draft.id, input);
      else await adminAccessService.createCustomRole(input);
      setNotice(t(draft.id ? "updated" : "created", { name: input.name }));
      setDraft(null);
      setRevision((v) => v + 1);
    } catch (e) {
      setError(ruleText(e));
    } finally {
      setBusy(false);
    }
  }

  async function archive() {
    if (!archiving || busy || archiving.reason.trim().length < 5) return;
    setBusy(true);
    setError(null);
    try {
      await adminAccessService.archiveCustomRole(archiving.role.id, archiving.reason.trim());
      setNotice(t("archived", { name: archiving.role.name }));
      setArchiving(null);
      setRevision((v) => v + 1);
    } catch (e) {
      setError(ruleText(e));
    } finally {
      setBusy(false);
    }
  }

  const summary = (granted: ReadonlySet<string>) =>
    sections.flatMap((s) => s.domains).filter((d) => levelOf(d, granted) !== "none");

  return (
    <div className="gx-page">
      <header className="gx-pagehead">
        <div className="gx-pagehead__text">
          <p className="gx-kicker">
            <KeyRound size={14} aria-hidden="true" />
            {tShell("nav.access")}
          </p>
          <h1>{t("title")}</h1>
          <p>{t("intro")}</p>
        </div>
        {canManage && !draft ? (
          <div className="gx-pagehead__actions">
            <button type="button" className="gx-btn gx-btn--primary" onClick={() => { setDraft(emptyDraft()); setOpen(new Set()); setError(null); setNotice(null); }} disabled={!catalog}>
              <Plus size={16} aria-hidden="true" />
              {t("newRole")}
            </button>
          </div>
        ) : null}
      </header>

      {!canManage ? <p className="gx-muted">{t("readOnly")}</p> : null}
      {notice ? <p role="status" className="gx-inline-note">{notice}</p> : null}
      {failed ? (
        <div role="alert" className="gx-inline-alert">
          <p>{t("failed")}</p>
          <button type="button" className="gx-btn" onClick={() => setRevision((v) => v + 1)}>{t("retry")}</button>
        </div>
      ) : null}

      {draft ? (
        <section className="gx-card gx-role-editor" aria-labelledby="role-editor-title">
          <header>
            <h2 id="role-editor-title">{draft.id ? t("editTitle", { name: draft.name || "…" }) : t("newRole")}</h2>
            <button type="button" className="gx-btn" onClick={() => setDraft(null)}>
              <X size={16} aria-hidden="true" />
              {t("cancel")}
            </button>
          </header>
          <div className="gx-role-editor__basics">
            <label className="gx-field">
              {t("name")}
              <input value={draft.name} maxLength={60} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={t("namePlaceholder")} />
            </label>
            <label className="gx-field">
              {t("description")}
              <input value={draft.description} maxLength={300} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder={t("descriptionPlaceholder")} />
            </label>
          </div>

          <fieldset className="gx-role-editor__verticals">
            <legend>{t("verticals")}</legend>
            <p className="gx-muted">{t("verticalsHint")}</p>
            <div className="gx-chips">
              {adminVerticals.map((v) => (
                <button key={v} type="button" className="gx-chip" aria-pressed={draft.verticals.has(v)} onClick={() => toggleVertical(v)}>
                  {tAccess.has(`verticals.${v}`) ? tAccess(`verticals.${v}`) : v}
                </button>
              ))}
            </div>
            <p className="gx-muted">{draft.verticals.size ? t("verticalsSome", { count: draft.verticals.size }) : t("verticalsAll")}</p>
          </fieldset>

          <div className="gx-section-title">
            <h2>{t("sections")}</h2>
            <p>{t("sectionsHint", { count: fmt(draft.permissions.size) })}</p>
          </div>
          {sections.map((section) => (
            <fieldset key={section.key} className="gx-role-section">
              <legend>{tShell(`groups.${section.key}`)}</legend>
              {section.domains.map((domain) => {
                const level = levelOf(domain, draft.permissions);
                const hasView = viewSet(domain).length > 0 && viewSet(domain).length < (byDomain.get(domain)?.length ?? 0);
                const levels: Exclude<Level, "custom">[] = hasView ? ["none", "view", "full"] : ["none", "full"];
                const expanded = open.has(domain);
                return (
                  <div key={domain} className="gx-role-domain">
                    <div className="gx-role-domain__row">
                      <span className="gx-role-domain__name">{domainLabel(domain)}</span>
                      <div className="gx-seg" role="radiogroup" aria-label={domainLabel(domain)}>
                        {levels.map((l) => (
                          <button key={l} type="button" role="radio" aria-checked={level === l} onClick={() => setLevel(domain, l)}>
                            {t(`levels.${l}`)}
                          </button>
                        ))}
                      </div>
                      {level === "custom" ? <span className="gx-tag">{t("levels.custom")}</span> : null}
                      <button
                        type="button"
                        className="gx-role-domain__more"
                        aria-expanded={expanded}
                        aria-label={t("details", { domain: domainLabel(domain) })}
                        onClick={() => setOpen((o) => { const n = new Set(o); if (n.has(domain)) n.delete(domain); else n.add(domain); return n; })}
                      >
                        <ChevronDown size={16} aria-hidden="true" />
                      </button>
                    </div>
                    {expanded ? (
                      <ul className="gx-role-domain__perms">
                        {(byDomain.get(domain) ?? []).map((p) => (
                          <li key={p}>
                            <label>
                              <input type="checkbox" checked={draft.permissions.has(p)} onChange={() => togglePermission(p)} />
                              <span>{permissionLabel(p)}</span>
                              <bdi dir="ltr">{p}</bdi>
                            </label>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
            </fieldset>
          ))}
          <p className="gx-muted">{t("notDelegable")}</p>
          <label className="gx-field">
            {t("reason")}
            <input value={draft.reason} maxLength={500} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} placeholder={t("reasonPlaceholder")} />
          </label>
          {error ? <p role="alert" className="gx-inline-alert">{error}</p> : null}
          <div className="gx-toolbar">
            <button type="button" className="gx-btn gx-btn--primary" onClick={() => void save()} disabled={busy}>
              <Save size={16} aria-hidden="true" />
              {busy ? t("saving") : t("save")}
            </button>
            <button type="button" className="gx-btn" onClick={() => setDraft(null)}>{t("cancel")}</button>
          </div>
        </section>
      ) : null}

      {!draft ? (
        !roles ? (
          failed ? null : <div className="gx-skel" style={{ height: 180 }} aria-label={t("loading")} />
        ) : roles.length === 0 ? (
          <section className="gx-card">
            <p className="gx-empty">{t("empty")}</p>
          </section>
        ) : (
          <ul className="gx-role-list">
            {roles.map((role) => {
              const granted = new Set(role.permissions);
              const domains = summary(granted);
              return (
                <li key={role.id} className="gx-card">
                  <header>
                    <div>
                      <h2>{role.name}</h2>
                      {role.description ? <p>{role.description}</p> : null}
                    </div>
                    <span className="gx-tag">{t("members", { count: role.members })}</span>
                  </header>
                  <p className="gx-muted">
                    {role.verticals.length ? role.verticals.map((v) => (tAccess.has(`verticals.${v}`) ? tAccess(`verticals.${v}`) : v)).join(" · ") : t("verticalsAll")}
                  </p>
                  <ul className="gx-role-summary">
                    {domains.map((d) => (
                      <li key={d}>
                        <span>{domainLabel(d)}</span>
                        <b>{t(`levels.${levelOf(d, granted)}`)}</b>
                      </li>
                    ))}
                  </ul>
                  {canManage ? (
                    <div className="gx-toolbar">
                      <button
                        type="button"
                        className="gx-btn"
                        disabled={!catalog}
                        onClick={() => {
                          setDraft({ id: role.id, name: role.name, description: role.description ?? "", permissions: new Set(role.permissions), verticals: new Set(role.verticals as AdminVertical[]), reason: "" });
                          setOpen(new Set());
                          setError(null);
                          setNotice(null);
                        }}
                      >
                        {t("edit")}
                      </button>
                      <button type="button" className="gx-btn" disabled={role.members > 0} title={role.members > 0 ? t("rules.ROLE_IN_USE") : undefined} onClick={() => setArchiving({ role, reason: "" })}>
                        {t("archive")}
                      </button>
                    </div>
                  ) : null}
                  {archiving?.role.id === role.id ? (
                    <div className="gx-role-archive">
                      <label className="gx-field">
                        {t("reason")}
                        <input value={archiving.reason} maxLength={500} onChange={(e) => setArchiving({ ...archiving, reason: e.target.value })} />
                      </label>
                      {error ? <p role="alert" className="gx-inline-alert">{error}</p> : null}
                      <div className="gx-toolbar">
                        <button type="button" className="gx-btn gx-btn--primary" disabled={busy || archiving.reason.trim().length < 5} onClick={() => void archive()}>{t("archiveConfirm")}</button>
                        <button type="button" className="gx-btn" onClick={() => setArchiving(null)}>{t("cancel")}</button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )
      ) : null}

      <p className="gx-muted">
        {t("assignHint")} <Link href="/admin/access" className="gx-link">{tShell("tabs.adminsRoles")}</Link>
      </p>
    </div>
  );
}
