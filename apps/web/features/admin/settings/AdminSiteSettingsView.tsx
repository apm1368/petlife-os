"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Globe, Save, Settings, ToggleLeft, Mail, Phone, Bell, Palette, LockKeyhole } from "@petlife/ui";
import Link from "@/features/navigation/localized-link";
import { ApiError } from "@/lib/api/client";
import { adminSettingsService, type PlatformSetting, type SettingValue } from "@/services/admin-settings.service";
import { useAdminStore } from "@/stores/admin-store";
import "../admin-glass.css";

const LOCALES = ["fa", "en", "de", "es"] as const;
type Loc = (typeof LOCALES)[number];
type LocalizedValue = Partial<Record<Loc, string>>;

/** The page layout: which keys each section edits, in order. Keys must exist in the API registry. */
const SECTIONS: { key: string; icon: typeof Globe; keys: string[] }[] = [
  { key: "identity", icon: Palette, keys: ["site.tagline", "site.footerNote"] },
  { key: "contact", icon: Phone, keys: ["site.contactPhone", "site.workingHours", "site.contactEmail", "site.contactAddress"] },
  { key: "social", icon: Globe, keys: ["social.instagram", "social.telegram", "social.whatsapp", "social.x", "social.linkedin", "social.youtube", "social.aparat"] },
  { key: "announcement", icon: Bell, keys: ["platform.announcement", "platform.announcementTone", "platform.announcementAudience", "platform.announcementLink"] },
  { key: "features", icon: ToggleLeft, keys: ["features.shop", "features.services", "features.travel", "features.insurance", "features.places", "features.community", "features.lostPets", "features.animalSupport", "features.blog", "features.memorials"] },
  { key: "access", icon: LockKeyhole, keys: ["auth.passwordSignupEnabled", "auth.otpEnabled", "auth.googleEnabled"] },
  { key: "maintenance", icon: Settings, keys: ["maintenance.enabled", "maintenance.message"] },
];

const nameKey = (key: string) => key.replace(".", "_");

function initialDraft(row: PlatformSetting): SettingValue {
  if (row.type === "localizedText") return (row.value && typeof row.value === "object" ? { ...row.value } : {}) as SettingValue;
  return row.value;
}

function normalize(row: PlatformSetting, draft: SettingValue): SettingValue {
  if (row.type === "localizedText") {
    const v = (draft ?? {}) as LocalizedValue;
    const out: LocalizedValue = {};
    for (const l of LOCALES) if (v[l]?.trim()) out[l] = v[l]!.trim();
    return Object.keys(out).length ? (out as SettingValue) : null;
  }
  if (row.type === "text" || row.type === "url" || row.type === "email") return typeof draft === "string" && draft.trim() ? draft.trim() : null;
  return draft;
}

/**
 * Site settings: a friendly, grouped editor over the same audited settings API as /admin/settings. Ordinary keys
 * apply immediately; two-admin keys (maintenance, sign-up and sign-in switches) are proposed and wait for a second
 * SUPER_ADMIN on /admin/settings.
 */
export function AdminSiteSettingsView() {
  const t = useTranslations("adminSiteSettings");
  const context = useAdminStore((s) => s.context);
  const canView = !!context?.permissions.includes("settings.view");
  const canManage = !!context?.permissions.includes("settings.manage");
  const [rows, setRows] = useState<PlatformSetting[] | null>(null);
  const [failed, setFailed] = useState<"forbidden" | "failed" | null>(null);
  const [revision, setRevision] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, SettingValue>>({});
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState<{ applied: number; pending: number; errors: { key: string; code: string }[] } | null>(null);

  useEffect(() => {
    if (!canView) return;
    const controller = new AbortController();
    setFailed(null);
    adminSettingsService.list(controller.signal).then((list) => {
      if (controller.signal.aborted) return;
      setRows(list);
      setDrafts(Object.fromEntries(list.map((r) => [r.key, initialDraft(r)])));
    }).catch((e: unknown) => { if (!controller.signal.aborted) setFailed(e instanceof ApiError && e.status === 403 ? "forbidden" : "failed"); });
    return () => controller.abort();
  }, [canView, revision]);

  const byKey = useMemo(() => new Map((rows ?? []).map((r) => [r.key, r])), [rows]);
  const dirty = useMemo(() => (rows ?? []).filter((r) => SECTIONS.some((s) => s.keys.includes(r.key)) && JSON.stringify(normalize(r, drafts[r.key] ?? null)) !== JSON.stringify(normalize(r, initialDraft(r)))), [rows, drafts]);

  if (!context) return <div className="gx-skel" style={{ height: 260 }} aria-label={t("loading")} />;
  if (!canView || failed === "forbidden") return <section className="gx-card" role="alert"><h1>{t("title")}</h1><p className="gx-muted">{t("forbidden")}</p></section>;

  async function saveAll() {
    if (!dirty.length || saving) return;
    setSaving(true);
    setOutcome(null);
    const note = reason.trim().length >= 5 ? reason.trim() : t("defaultReason");
    let applied = 0, pending = 0;
    const errors: { key: string; code: string }[] = [];
    for (const row of dirty) {
      try {
        const change = await adminSettingsService.propose(row.key, { value: normalize(row, drafts[row.key] ?? null), baseVersion: row.version, reason: note });
        if (change.status === "PENDING") pending++; else applied++;
      } catch (e) {
        const reasonCode = e instanceof ApiError ? String((e.details as { reason?: string } | undefined)?.reason ?? e.code) : "FAILED";
        errors.push({ key: row.key, code: reasonCode });
      }
    }
    setOutcome({ applied, pending, errors });
    setSaving(false);
    setRevision((n) => n + 1);
  }

  const set = (key: string, value: SettingValue) => { setDrafts((d) => ({ ...d, [key]: value })); setOutcome(null); };

  return (
    <div className="gx-page">
      <header className="gx-head">
        <div>
          <p className="gx-kicker"><Globe size={16} aria-hidden="true" />{t("kicker")}</p>
          <h1>{t("title")}</h1>
          <p>{t("subtitle")}</p>
        </div>
        <div className="gx-toolbar">
          <Link href="/admin/settings" className="gx-btn"><Settings size={16} aria-hidden="true" />{t("operational")}</Link>
          <Link href="/admin/messaging" className="gx-btn"><Mail size={16} aria-hidden="true" />{t("messaging")}</Link>
        </div>
      </header>

      {failed ? <div className="gx-card" role="alert"><p>{t("failed")}</p><button type="button" className="gx-btn" onClick={() => setRevision((n) => n + 1)}>{t("retry")}</button></div> : !rows ? <div className="gx-skel" style={{ height: 320 }} aria-label={t("loading")} /> : (
        <>
          {SECTIONS.map((section) => {
            const Icon = section.icon;
            const sectionRows = section.keys.map((k) => byKey.get(k)).filter((r): r is PlatformSetting => Boolean(r));
            if (!sectionRows.length) return null;
            return (
              <section key={section.key} className="gx-card" aria-labelledby={`site-${section.key}`}>
                <header><h2 id={`site-${section.key}`}><Icon size={18} aria-hidden="true" style={{ display: "inline", marginInlineEnd: 8 }} />{t(`sections.${section.key}.title`)}</h2><p>{t(`sections.${section.key}.hint`)}</p></header>
                <div className={section.key === "features" || section.key === "access" ? "gx-grid gx-grid--3" : "gx-grid gx-grid--2"}>
                  {sectionRows.map((row) => <Field key={row.key} row={row} value={drafts[row.key] ?? null} disabled={!canManage} onChange={(v) => set(row.key, v)} />)}
                </div>
              </section>
            );
          })}

          {canManage ? (
            <section className="gx-card" style={{ position: "sticky", bottom: 16, zIndex: 5 }} aria-label={t("save.label")}>
              <div className="gx-toolbar" style={{ alignItems: "flex-end" }}>
                <label className="gx-field" style={{ flex: 1, minWidth: 220 }}><span>{t("save.reason")}</span><input value={reason} maxLength={500} placeholder={t("defaultReason")} onChange={(e) => setReason(e.target.value)} /></label>
                <button type="button" className="gx-btn gx-btn--primary" disabled={!dirty.length || saving} onClick={saveAll}><Save size={16} aria-hidden="true" />{saving ? t("save.saving") : t("save.button", { count: dirty.length })}</button>
                {dirty.length ? <button type="button" className="gx-btn" disabled={saving} onClick={() => setDrafts(Object.fromEntries(rows.map((r) => [r.key, initialDraft(r)])))}>{t("save.discard")}</button> : null}
              </div>
              {outcome ? <div role="status" className="gx-muted" style={{ marginTop: 10 }}>
                {outcome.applied ? <p>{t("save.applied", { count: outcome.applied })}</p> : null}
                {outcome.pending ? <p>{t("save.pending", { count: outcome.pending })} <Link className="underline" href="/admin/settings">{t("save.review")}</Link></p> : null}
                {outcome.errors.map((e) => <p key={e.key} role="alert" style={{ color: "var(--chart-5)" }}>{t("save.error", { name: t.has(`names.${nameKey(e.key)}`) ? t(`names.${nameKey(e.key)}`) : e.key, code: t.has(`errors.${e.code}`) ? t(`errors.${e.code}`) : e.code })}</p>)}
              </div> : null}
            </section>
          ) : <p className="gx-muted">{t("readOnly")}</p>}
        </>
      )}
    </div>
  );
}

function Field({ row, value, disabled, onChange }: { row: PlatformSetting; value: SettingValue; disabled: boolean; onChange: (v: SettingValue) => void }) {
  const t = useTranslations("adminSiteSettings");
  const name = t.has(`names.${nameKey(row.key)}`) ? t(`names.${nameKey(row.key)}`) : row.key;
  const hint = row.highImpact ? <span className="gx-tag gx-tag--AT_RISK">{t("twoAdmins")}</span> : null;
  const pending = row.pendingChanges > 0 ? <span className="gx-tag gx-tag--NEW">{t("pendingCount", { count: row.pendingChanges })}</span> : null;
  const head = <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>{name}{hint}{pending}</span>;

  if (row.type === "boolean") {
    const on = value === true;
    return (
      <div className="gx-kpi" style={{ gap: 8 }}>
        <span className="gx-kpi__label">{head}</span>
        <button type="button" role="switch" aria-checked={on} aria-label={name} disabled={disabled} onClick={() => onChange(!on)} className={`gx-btn ${on ? "gx-btn--primary" : ""}`} style={{ justifySelf: "start", width: "fit-content" }}>
          {on ? t("on") : t("off")}
        </button>
      </div>
    );
  }
  if (row.type === "enum") {
    return (
      <label className="gx-field"><span>{head}</span>
        <select value={String(value ?? "")} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
          {(row.constraints.options ?? []).map((o) => <option key={o} value={o}>{t.has(`options.${o}`) ? t(`options.${o}`) : o}</option>)}
        </select>
      </label>
    );
  }
  if (row.type === "localizedText") {
    const v = (value ?? {}) as LocalizedValue;
    const long = (row.constraints.maxLength ?? 0) > 200;
    return (
      <fieldset className="gx-field" style={{ border: 0, padding: 0, margin: 0, gridColumn: long ? "1 / -1" : undefined }}>
        <legend style={{ marginBottom: 6 }}>{head}</legend>
        <div className="gx-grid gx-grid--2" style={{ gap: 8 }}>
          {LOCALES.map((l) => (
            <label key={l} className="gx-field"><span>{t(`languages.${l}`)}</span>
              {long
                ? <textarea dir={l === "fa" ? "rtl" : "ltr"} lang={l} rows={3} maxLength={row.constraints.maxLength ?? 280} disabled={disabled} value={v[l] ?? ""} onChange={(e) => onChange({ ...v, [l]: e.target.value } as SettingValue)} style={{ minHeight: 80, padding: 10, borderRadius: 14, border: "1px solid var(--glass-edge)", background: "var(--glass-input)", color: "var(--text-primary)", font: "inherit", fontSize: ".85rem" }} />
                : <input dir={l === "fa" ? "rtl" : "ltr"} lang={l} maxLength={row.constraints.maxLength ?? 280} disabled={disabled} value={v[l] ?? ""} onChange={(e) => onChange({ ...v, [l]: e.target.value } as SettingValue)} />}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }
  const type = row.type === "email" ? "email" : row.type === "url" ? "url" : row.key === "site.contactPhone" ? "tel" : "text";
  return (
    <label className="gx-field"><span>{head}</span>
      <input type={type === "url" ? "text" : type} dir="ltr" inputMode={type === "tel" ? "tel" : type === "email" ? "email" : type === "url" ? "url" : undefined} maxLength={row.constraints.maxLength ?? 280} disabled={disabled} value={typeof value === "string" ? value : ""} placeholder={row.type === "url" ? "https://" : undefined} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
