"use client";
import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, ContextSurface, Input, Select } from "@petlife/ui";
import { useProviderStore } from "@/stores/provider-store";
import { clinicContactsService, type ClinicContact, type ClinicExportKind, type ContactImportResult } from "@/services/clinic-contacts.service";

export function ClinicContacts({ canExport }: { canExport: boolean }) {
  const organization = useProviderStore(s => s.context?.active?.providerOrganizationId);
  return <ClinicContactsContent key={organization} canExport={canExport}/>;
}
function ClinicContactsContent({ canExport }: { canExport: boolean }) {
  const t = useTranslations("clinicContacts"), locale = useLocale();
  const fileId = useId();
  const owner = useProviderStore(s => s.context?.active?.role === "OWNER");
  const [q, setQ] = useState(""), [rows, setRows] = useState<ClinicContact[]>([]);
  const [loading, setLoading] = useState(true), [loadFailed, setLoadFailed] = useState(false), [revision, setRevision] = useState(0);
  const [csv, setCsv] = useState(""), [filename, setFilename] = useState("");
  const [preview, setPreview] = useState<ContactImportResult | null>(null), [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false), [fileLoading, setFileLoading] = useState(false), [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<number | null>(null), [kind, setKind] = useState<ClinicExportKind>("contacts");
  const generation = useRef(0), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setLoadFailed(false);
    clinicContactsService.list(q, controller.signal).then(data => { if (!controller.signal.aborted) setRows(data); })
      .catch(() => { if (!controller.signal.aborted) setLoadFailed(true); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [q, revision]);
  async function selectFile(file: File | undefined) {
    const current = ++generation.current;
    setFileLoading(false); setCsv(""); setFilename(file?.name ?? ""); setPreview(null); setConfirmed(false); setImported(null); setError(null);
    if (!file) return;
    if (file.size > 1_000_000) { setError(t("fileTooLarge")); return; }
    setFileLoading(true);
    try { const text = await file.text(); if (alive.current && current === generation.current) setCsv(text); }
    catch { if (alive.current && current === generation.current) setError(t("fileFailed")); }
    finally { if (alive.current && current === generation.current) setFileLoading(false); }
  }
  async function validate() {
    if (!owner || !csv || busy || fileLoading) return;
    setBusy(true); setError(null); setPreview(null); setConfirmed(false); setImported(null);
    try { const result = await clinicContactsService.preview(csv); if (alive.current) setPreview(result); }
    catch { if (alive.current) setError(t("previewFailed")); }
    finally { if (alive.current) setBusy(false); }
  }
  async function commit() {
    if (!owner || busy || !confirmed || !preview?.confirmationToken || preview.validRows < 1) return;
    setBusy(true); setError(null);
    try {
      const result = await clinicContactsService.import(csv, preview.confirmationToken);
      if (alive.current) { setImported(result.imported); setPreview(null); setConfirmed(false); setRevision(v => v + 1); }
    } catch { if (alive.current) { setError(t("importFailed")); setPreview(null); setConfirmed(false); } }
    finally { if (alive.current) setBusy(false); }
  }
  async function download() {
    if (!owner || !canExport || busy) return;
    setBusy(true); setError(null);
    try {
      const result = await clinicContactsService.export(kind);
      if (!alive.current) return;
      const url = URL.createObjectURL(new Blob(["\uFEFF", result.csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a"); link.href = url; link.download = result.filename.replace(/[\\/]/g, "_");
      document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { if (alive.current) setError(t("exportFailed")); }
    finally { if (alive.current) setBusy(false); }
  }
  const n = (value: number) => new Intl.NumberFormat(locale).format(value);
  return <div className="space-y-5"><header><h2 className="text-section-title">{t("title")}</h2><p>{t("intro")}</p></header>
    {error && <p role="alert">{error}</p>}{imported !== null && <p role="status">{t("imported", { count: n(imported) })}</p>}
    <Input label={t("search")} value={q} maxLength={100} onChange={e => setQ(e.target.value)}/>
    <p className="text-text-secondary">{t("listLimit")}</p>
    {loadFailed ? <div><p role="alert">{t("loadFailed")}</p><Button onClick={() => setRevision(v => v + 1)}>{t("retry")}</Button></div> : loading ? <p role="status">{t("loading")}</p> : rows.length === 0 ? <p>{t("empty")}</p> :
      <div className="grid gap-3 md:grid-cols-2">{rows.map(row => <ContextSurface key={row.id} className="space-y-2"><h3 className="font-medium">{row.name}</h3>{row.petName && <p>{row.petName}</p>}{row.phone && <p><bdi dir="ltr">{row.phone}</bdi></p>}{row.email && <p className="break-all"><bdi dir="ltr">{row.email}</bdi></p>}{row.notes && <p className="whitespace-pre-wrap break-words">{row.notes}</p>}</ContextSurface>)}</div>}
    {owner && <ContextSurface className="space-y-3"><h3 className="text-section-title">{t("importTitle")}</h3><p>{t("csvHelp")}</p><code dir="ltr" className="block break-all">name,phone,email,petName,species,notes</code>
      <div className="space-y-2"><p>{t("file")}</p><label htmlFor={fileId} className="inline-flex cursor-pointer rounded-md border border-border-strong px-4 py-2 focus-within:ring-2"><input id={fileId} aria-label={t("file")} className="sr-only" type="file" accept=".csv,text/csv" disabled={busy} onChange={e => void selectFile(e.target.files?.[0])}/>{t("chooseFile")}</label></div>
      {filename && <p className="break-all"><bdi>{filename}</bdi></p>}{fileLoading && <p role="status">{t("reading")}</p>}
      <Button disabled={busy || fileLoading || !csv} onClick={() => void validate()}>{t("preview")}</Button>
      {preview && <section className="space-y-3" aria-label={t("previewTitle")}><h4>{t("previewTitle")}</h4><p>{t("summary", { total: n(preview.totalRows), valid: n(preview.validRows), duplicates: n(preview.duplicates.length), errors: n(preview.errors.length) })}</p>
        <ul className="space-y-1">{preview.errors.map((item, index) => <li key={`error-${index}`}>{t("rowError", { row: n(item.row), field: t(`fields.${["name", "phone", "email", "notes"].includes(item.field) ? item.field : "other"}`) })}</li>)}{preview.duplicates.map((item, index) => <li key={`duplicate-${index}`}>{t(item.matches === "FILE" ? "duplicateFile" : "duplicateExisting", { row: n(item.row) })}</li>)}</ul>
        <label className="flex items-start gap-2"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>{t("confirmImport", { count: n(preview.validRows) })}</label>
        <Button disabled={busy || !confirmed || preview.validRows < 1 || !preview.confirmationToken} onClick={() => void commit()}>{t("commit")}</Button>
      </section>}
    </ContextSurface>}
    {owner && canExport && <ContextSurface className="space-y-3"><h3 className="text-section-title">{t("exportTitle")}</h3><p>{t("exportHelp")}</p><Select label={t("exportKind")} value={kind} onChange={e => setKind(e.target.value as ClinicExportKind)} options={(["customers", "appointments", "services", "contacts"] as const).map(value => ({ value, label: t(`exports.${value}`) }))}/><Button disabled={busy} onClick={() => void download()}>{t("download")}</Button></ContextSurface>}
  </div>;
}
