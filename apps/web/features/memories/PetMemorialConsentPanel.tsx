"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, ErrorRecovery, Input, Select, Skeleton } from "@petlife/ui";
import type { PetMemoryDto } from "@petlife/types";
import { memoriesService, type PetMemorialStatusDto } from "@/services/memories.service";

export function PetMemorialConsentPanel({ petId, petName, memories }: { petId: string; petName: string; memories: PetMemoryDto[] }) {
  const t = useTranslations("memories.publicMemorial");
  const [record, setRecord] = useState<PetMemorialStatusDto | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [allowed, setAllowed] = useState(true);
  const [imageMemoryId, setImageMemoryId] = useState("");
  const [displayName, setDisplayName] = useState(petName);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const photos = memories.filter((memory) => memory.type === "PHOTO" && memory.visibility === "PUBLIC" && memory.archivedAt === null && memory.mediaUrls.length > 0);

  async function load() {
    setError(false);
    try {
      setRecord(await memoriesService.getMemorial(petId));
      setAllowed(true);
    } catch (caught) {
      const status = typeof caught === "object" && caught !== null && "status" in caught ? (caught as { status?: number }).status : undefined;
      if (status === 403) setAllowed(false);
      else setError(true);
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => { void load(); /* intentionally keyed only by pet id */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petId]);

  async function submit() {
    if (!consent || !imageMemoryId || !displayName.trim()) return;
    setBusy(true); setError(false);
    try {
      setRecord(await memoriesService.submitMemorial(petId, { displayName: displayName.trim(), imageMemoryId, consent: true }));
      setConsent(false);
    } catch {
      setError(true);
    } finally { setBusy(false); }
  }

  async function withdraw() {
    setBusy(true); setError(false);
    try { await memoriesService.withdrawMemorial(petId); await load(); }
    catch { setError(true); }
    finally { setBusy(false); }
  }

  if (!loaded) return <Skeleton className="h-24 w-full" aria-label={t("loading")} />;
  if (!allowed) return <ContextSurface><p role="status" className="text-metadata text-text-secondary">{t("ownerOnly")}</p></ContextSurface>;
  if (error) return <ErrorRecovery title={t("title")} message={t("error")} retryLabel={t("retry")} onRetry={() => void load()} />;

  return <ContextSurface className="flex flex-col gap-3" aria-labelledby="pet-memorial-title">
    <div><h2 id="pet-memorial-title" className="text-section-title text-text-primary">{t("title")}</h2><p className="text-metadata text-text-secondary">{t("explanation")}</p></div>
    {record && record.status !== "WITHDRAWN" && record.status !== "REJECTED" ? <div className="flex flex-col gap-2">
      <p className="text-body text-text-primary">{t(`status.${record.status}`)}</p>
      {record.reviewReason ? <p className="text-metadata text-text-secondary">{record.reviewReason}</p> : null}
      <Button variant="secondary" isLoading={busy} onClick={withdraw}>{t("withdraw")}</Button>
    </div> : <>
      {record?.status === "REJECTED" ? <p className="text-metadata text-text-secondary">{t("rejected")}{record.reviewReason ? ` ${record.reviewReason}` : ""}</p> : null}
      <Input label={t("displayName")} maxLength={120} value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
      {photos.length > 0 ? <Select label={t("image")} value={imageMemoryId} onChange={(event) => setImageMemoryId(event.target.value)} options={[{ value: "", label: t("chooseImage") }, ...photos.map((photo) => ({ value: photo.id, label: photo.title?.trim() || t("photoOption") }))]} /> : <p className="text-metadata text-text-secondary">{t("noPublicPhoto")}</p>}
      <label className="flex items-start gap-2 text-metadata text-text-primary">
        <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1 size-5 shrink-0 accent-brand-strong" />
        <span>{t("consent", { name: displayName.trim() || petName })}</span>
      </label>
      <p className="text-metadata text-text-secondary">{t("privacy")}</p>
      <Button isLoading={busy} disabled={!consent || !imageMemoryId || !displayName.trim()} onClick={submit}>{t("submit")}</Button>
    </>}
  </ContextSurface>;
}
