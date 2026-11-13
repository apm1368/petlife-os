"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, ErrorRecovery, Input, Select, Skeleton, StatusLabel } from "@petlife/ui";
import { adminService, type AdminPetMemorialItem } from "@/services/admin.service";

const STATUSES = ["PENDING_REVIEW", "PUBLISHED", "REJECTED", "WITHDRAWN"] as const;

export function AdminPetMemorialsView() {
  const t = useTranslations("admin.memorials");
  const tc = useTranslations("admin.common");
  const locale = useLocale();
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("PENDING_REVIEW");
  const [items, setItems] = useState<AdminPetMemorialItem[] | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  async function load() {
    setFailed(false);
    try { setItems((await adminService.listPetMemorials(status)).items); }
    catch { setFailed(true); }
  }
  useEffect(() => { void load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);
  async function review(item: AdminPetMemorialItem, action: "APPROVE" | "REJECT") {
    const reason = reasons[item.id]?.trim() ?? "";
    if (reason.length < 3) return;
    setBusyId(item.id);
    try { await adminService.reviewPetMemorial(item.id, action, reason); await load(); }
    catch { setFailed(true); }
    finally { setBusyId(null); }
  }
  const date = (value: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

  return <div className="flex flex-col gap-4">
    <header><h1 className="text-page-title text-text-primary">{t("title")}</h1><p className="text-body text-text-secondary">{t("description")}</p></header>
    <Select label={t("filter")} value={status} onChange={(event) => setStatus(event.target.value as (typeof STATUSES)[number])} options={STATUSES.map((value) => ({ value, label: t(`status.${value}`) }))} />
    {failed ? <ErrorRecovery title={t("title")} message={t("error")} retryLabel={tc("retry")} onRetry={() => void load()} /> : null}
    {!failed && items === null ? <Skeleton className="h-48 w-full" aria-label={tc("loading")} /> : null}
    {!failed && items?.length === 0 ? <EmptyState title={t("empty")} /> : null}
    {items?.map((item) => <ContextSurface key={item.id} className="grid gap-4 sm:grid-cols-[140px_minmax(0,1fr)]">
      {item.imageUrl ? <Image unoptimized src={item.imageUrl} alt={t("photoAlt", { name: item.displayName })} width={280} height={280} className="aspect-square w-full rounded-xl object-cover" /> : <div className="aspect-square rounded-xl bg-surface-subtle" role="img" aria-label={t("missingImage")} />}
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2"><h2 className="text-section-title text-text-primary">{item.displayName}</h2><StatusLabel tone={item.status === "PENDING_REVIEW" ? "attention" : item.status === "PUBLISHED" ? "success" : "neutral"}>{t(`status.${item.status}`)}</StatusLabel></div>
        <p className="text-metadata text-text-secondary">{t("pet", { name: item.petName })}</p>
        <p className="text-metadata text-text-secondary">{t("submitted", { date: date(item.submittedAt) })}</p>
        <p className="text-metadata text-text-secondary">{t("consentVersion", { version: item.consentVersion })}</p>
        {item.status === "PENDING_REVIEW" ? <>
          <Input label={t("reason")} minLength={3} maxLength={1000} value={reasons[item.id] ?? ""} onChange={(event) => setReasons((current) => ({ ...current, [item.id]: event.target.value }))} />
          <div className="flex flex-wrap gap-2"><Button isLoading={busyId === item.id} disabled={(reasons[item.id]?.trim().length ?? 0) < 3} onClick={() => void review(item, "APPROVE")}>{t("approve")}</Button><Button variant="secondary" isLoading={busyId === item.id} disabled={(reasons[item.id]?.trim().length ?? 0) < 3} onClick={() => void review(item, "REJECT")}>{t("reject")}</Button></div>
        </> : null}
      </div>
    </ContextSurface>)}
  </div>;
}
