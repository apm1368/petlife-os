"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, ErrorRecovery, Input, Select, Skeleton, StatusLabel } from "@petlife/ui";
import { SupportCaseStatus, SupportMessageVisibility, type SupportCaseContextDto, type SupportCaseDetailDto } from "@petlife/types";
import { adminService } from "@/services/admin.service";
import { adminStatusTone } from "./status-tone";

const STATUSES: SupportCaseStatus[] = [
  SupportCaseStatus.OPEN,
  SupportCaseStatus.IN_PROGRESS,
  SupportCaseStatus.WAITING_ON_USER,
  SupportCaseStatus.WAITING_ON_INTERNAL,
  SupportCaseStatus.RESOLVED,
  SupportCaseStatus.CLOSED,
];

function formatDate(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
}

export function AdminSupportCaseDetailView({ caseId }: { caseId: string }) {
  const t = useTranslations("admin.support");
  const tCommon = useTranslations("admin.common");
  const router = useRouter();
  const locale = useLocale();

  const [data, setData] = useState<SupportCaseDetailDto | null>(null);
  const [context, setContext] = useState<SupportCaseContextDto | null>(null);
  const [error, setError] = useState(false);
  const [assigneeAdminId, setAssigneeAdminId] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [visibility, setVisibility] = useState<SupportMessageVisibility>(SupportMessageVisibility.PUBLIC);
  const [noteBody, setNoteBody] = useState("");

  async function load() {
    setError(false);
    try {
      const [detail, ctx] = await Promise.all([adminService.getSupportCase(caseId), adminService.getSupportCaseContext(caseId)]);
      setData(detail);
      setContext(ctx);
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  async function assign() {
    if (!assigneeAdminId.trim()) return;
    await adminService.assignSupportCase(caseId, assigneeAdminId);
    setAssigneeAdminId("");
    await load();
  }

  async function transition(status: SupportCaseStatus) {
    await adminService.transitionSupportCase(caseId, status);
    await load();
  }

  async function sendMessage() {
    if (!messageBody.trim()) return;
    await adminService.postSupportMessage(caseId, messageBody, visibility);
    setMessageBody("");
    await load();
  }

  async function addNote() {
    if (!noteBody.trim()) return;
    await adminService.addSupportNote(caseId, noteBody);
    setNoteBody("");
    await load();
  }

  if (error) return <ErrorRecovery title={t("title")} message="" retryLabel={tCommon("retry")} onRetry={load} />;
  if (!data) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-4">
      <Button variant="ghost" size="sm" onClick={() => router.push(`/${locale}/admin/support`)}>
        {tCommon("backToList")}
      </Button>

      <div className="flex items-center justify-between gap-3">
        <h1 className="text-page-title text-text-primary">{t("detail.caseNumber", { number: data.caseNumber })}</h1>
        <StatusLabel tone={adminStatusTone(data.status)}>{t(`status.${data.status}`)}</StatusLabel>
      </div>
      <span className="text-body text-text-primary">{data.subject}</span>
      <span className="text-body text-text-secondary">{data.description}</span>
      <span className="text-metadata text-text-secondary">{t("detail.requester", { name: data.requesterDisplayName })}</span>

      {context ? (
        <ContextSurface className="flex flex-col gap-2">
          <span className="text-section-title text-text-primary">{t("detail.context.title")}</span>
          {context.household ? <span className="text-metadata text-text-secondary">{t("detail.context.household", { name: context.household.name })}</span> : null}
          {context.pet ? <span className="text-metadata text-text-secondary">{t("detail.context.pet", { name: context.pet.name })}</span> : null}
          {context.relatedEntity ? <span className="text-metadata text-text-secondary">{t("detail.context.relatedEntity", { summary: context.relatedEntity.summary })}</span> : null}
          <span className="text-metadata text-text-secondary">
            {context.firstResponseTimeMinutes !== null ? t("detail.context.firstResponseTime", { minutes: context.firstResponseTimeMinutes }) : t("detail.context.noFirstResponseYet")}
          </span>
          {context.resolutionTimeMinutes !== null ? <span className="text-metadata text-text-secondary">{t("detail.context.resolutionTime", { minutes: context.resolutionTimeMinutes })}</span> : null}
          {context.previousCases.length > 0 ? (
            <div className="flex flex-col gap-1">
              <span className="text-metadata text-text-secondary">{t("detail.context.previousCases")}</span>
              {context.previousCases.map((c) => (
                <button key={c.id} type="button" className="text-start text-metadata text-text-primary underline" onClick={() => router.push(`/${locale}/admin/support/${c.id}`)}>
                  {c.caseNumber} — {c.subject}
                </button>
              ))}
            </div>
          ) : (
            <span className="text-metadata text-text-secondary">{t("detail.context.noPreviousCases")}</span>
          )}
        </ContextSurface>
      ) : null}

      <ContextSurface className="flex flex-wrap items-end gap-2">
        <Input label={t("detail.assignTo")} value={assigneeAdminId} onChange={(e) => setAssigneeAdminId(e.target.value)} className="min-w-48 flex-1" />
        <Button onClick={assign}>{tCommon("assign")}</Button>
      </ContextSurface>

      <ContextSurface className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <Button key={s} size="sm" variant={s === data.status ? "primary" : "secondary"} onClick={() => transition(s)} disabled={s === data.status}>
            {t(`status.${s}`)}
          </Button>
        ))}
      </ContextSurface>

      <ContextSurface className="flex flex-col gap-2">
        <span className="text-section-title text-text-primary">{t("detail.messages")}</span>
        {data.messages.map((m) => (
          <div key={m.id} className="flex flex-col gap-0.5 border-t border-border-subtle pt-2 first:border-t-0 first:pt-0">
            <div className="flex items-center gap-2">
              <StatusLabel tone={m.visibility === "INTERNAL" ? "attention" : "neutral"}>{m.visibility === "INTERNAL" ? t("detail.visibilityInternal") : t("detail.visibilityPublic")}</StatusLabel>
              <span className="text-metadata text-text-secondary">{m.author?.displayName ?? m.authorType} · {formatDate(m.createdAt, locale)}</span>
            </div>
            <span className="text-body text-text-primary">{m.body}</span>
          </div>
        ))}
        <Input label={t("detail.composePlaceholder")} placeholder={t("detail.composePlaceholder")} value={messageBody} onChange={(e) => setMessageBody(e.target.value)} />
        <div className="flex items-center gap-3">
          <Select
            label=""
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as SupportMessageVisibility)}
            options={[
              { value: SupportMessageVisibility.PUBLIC, label: t("detail.visibilityPublic") },
              { value: SupportMessageVisibility.INTERNAL, label: t("detail.visibilityInternal") },
            ]}
            className="w-64"
          />
          <Button onClick={sendMessage}>{t("detail.send")}</Button>
        </div>
      </ContextSurface>

      <ContextSurface className="flex flex-col gap-2">
        <span className="text-section-title text-text-primary">{t("detail.notes")}</span>
        {data.internalNotes.map((n) => (
          <div key={n.id} className="flex flex-col gap-0.5 border-t border-border-subtle pt-2 first:border-t-0 first:pt-0">
            <span className="text-body text-text-primary">{n.body}</span>
            <span className="text-metadata text-text-secondary">{n.author.displayName} · {formatDate(n.createdAt, locale)}</span>
          </div>
        ))}
        <div className="flex gap-2">
          <Input label={t("detail.notes")} placeholder={t("detail.notes")} value={noteBody} onChange={(e) => setNoteBody(e.target.value)} className="flex-1" />
          <Button onClick={addNote}>{tCommon("save")}</Button>
        </div>
      </ContextSurface>
    </div>
  );
}
