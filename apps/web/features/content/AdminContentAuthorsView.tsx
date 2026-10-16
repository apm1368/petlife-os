"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Input, Skeleton } from "@petlife/ui";
import type { ContentAuthorDto } from "@petlife/types";
import { adminContentService } from "@/services/admin-content.service";
import { useAdminStore } from "@/stores/admin-store";

export function AdminContentAuthorsView() {
  const t = useTranslations("rollout.authors");
  const actions = useTranslations("rollout.records");
  const adminContext = useAdminStore((s) => s.context);
  const permissions = adminContext?.permissions;
  const [items, setItems] = useState<ContentAuthorDto[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState(false);
  async function load() { setFailed(false); try { setItems(await adminContentService.listAuthors()); } catch { setFailed(true); } }
  useEffect(() => { if (permissions?.includes("content.view")) void load(); }, [permissions]);
  async function save() {
    if (!name.trim() || busy || !permissions?.includes(editing ? "content.edit" : "content.create")) return;
    setBusy(true); setSaveError(false);
    try { if (editing) await adminContentService.updateAuthor(editing, { name: name.trim(), bio: bio.trim() || undefined }); else await adminContentService.createAuthor({ name: name.trim(), bio: bio.trim() || undefined }); setName(""); setBio(""); setEditing(null); await load(); }
    catch { setSaveError(true); } finally { setBusy(false); }
  }
  if (!permissions?.includes("content.view")) return <EmptyState title={actions("noAccess")} />;
  if (failed) return <ErrorRecovery title={t("title")} message={actions("failed")} retryLabel={actions("retry")} onRetry={load} />;
  return <div className="flex flex-col gap-6"><h1 className="text-page-title">{t("title")}</h1>
    {permissions?.includes("content.create") || editing ? <ContextSurface className="flex flex-col gap-4"><Input label={t("name")} value={name} onChange={(e) => setName(e.target.value)} /><label className="flex flex-col gap-2"><span>{t("bio")}</span><textarea rows={4} className="rounded border border-border-subtle bg-surface-elevated p-3" value={bio} onChange={(e) => setBio(e.target.value)} /></label><div className="flex gap-3"><Button isLoading={busy} disabled={!name.trim()} onClick={save}>{actions("save")}</Button>{editing ? <Button variant="secondary" onClick={() => { setEditing(null); setName(""); setBio(""); }}>{actions("cancel")}</Button> : null}</div>{saveError ? <p role="alert">{actions("failedSave")}</p> : null}</ContextSurface> : null}
    {!items ? <Skeleton className="h-48 w-full" /> : items.length === 0 ? <EmptyState title={actions("empty")} /> : items.map((item) => <ContextSurface key={item.id}><h2 className="text-section-title">{item.name}</h2><p className="mt-3">{item.bio}</p>{permissions?.includes("content.edit") ? <Button className="mt-4" variant="secondary" onClick={() => { setEditing(item.id); setName(item.name); setBio(item.bio ?? ""); }}>{actions("edit")}</Button> : null}</ContextSurface>)}
  </div>;
}
