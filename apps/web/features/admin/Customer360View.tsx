"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, ErrorRecovery, Input, Skeleton, StatusLabel } from "@petlife/ui";
import { InternalNoteEntityType, type Customer360Dto } from "@petlife/types";
import { adminService } from "@/services/admin.service";
import { formatCurrency } from "@/lib/currency/format-currency";
import { adminStatusTone } from "./status-tone";

function formatDate(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US").format(new Date(iso));
}

export function Customer360View({ userId }: { userId: string }) {
  const t = useTranslations("admin.customer360");
  const tCommon = useTranslations("admin.common");
  const router = useRouter();
  const locale = useLocale() as "fa" | "en";

  const [data, setData] = useState<Customer360Dto | null>(null);
  const [error, setError] = useState(false);
  const [revealed, setRevealed] = useState<{ field: string; value: string } | null>(null);
  const [reason, setReason] = useState("");
  const [noteBody, setNoteBody] = useState("");

  async function load() {
    setError(false);
    try {
      setData(await adminService.getCustomer360(userId));
    } catch {
      setError(true);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function reveal(field: "email" | "phone") {
    if (!reason.trim()) return;
    const result = await adminService.revealPii(userId, field, reason);
    setRevealed({ field: result.field, value: result.value });
  }

  async function addNote() {
    if (!noteBody.trim()) return;
    await adminService.addNote(InternalNoteEntityType.USER, userId, noteBody);
    setNoteBody("");
    await load();
  }

  if (error) return <ErrorRecovery title={t("notFound")} message="" retryLabel={tCommon("retry")} onRetry={load} />;
  if (!data) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-4">
      <Button variant="ghost" size="sm" onClick={() => router.push(`/${locale}/admin/customers`)}>
        {tCommon("backToList")}
      </Button>
      <h1 className="text-page-title text-text-primary">{data.user.displayName}</h1>

      <ContextSurface className="flex flex-col gap-2">
        <span className="text-metadata text-text-secondary">{t("sections.contact")}</span>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-body text-text-primary">{revealed?.field === "email" ? revealed.value : data.user.emailMasked ?? "—"}</span>
          <Button size="sm" variant="secondary" onClick={() => reveal("email")}>
            {t("reveal.email")}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-body text-text-primary">{revealed?.field === "phone" ? revealed.value : data.user.phoneMasked ?? "—"}</span>
          <Button size="sm" variant="secondary" onClick={() => reveal("phone")}>
            {t("reveal.phone")}
          </Button>
        </div>
        <Input label={tCommon("reasonLabel")} placeholder={tCommon("reasonPlaceholder")} value={reason} onChange={(e) => setReason(e.target.value)} />
      </ContextSurface>

      <ContextSurface className="flex flex-col gap-2">
        <span className="text-metadata text-text-secondary">{t("sections.households")}</span>
        {data.households.length === 0 ? <span className="text-body text-text-secondary">—</span> : null}
        {data.households.map((h) => (
          <div key={h.id} className="flex flex-col gap-1 border-t border-border-subtle pt-2 first:border-t-0 first:pt-0">
            <span className="text-body text-text-primary">{h.name ?? h.id}</span>
            <span className="text-metadata text-text-secondary">{t("pets", { count: h.pets.length })}</span>
            <div className="flex flex-wrap gap-1.5">
              {h.pets.map((p) => (
                <StatusLabel key={p.id} tone="neutral">
                  {p.name}
                </StatusLabel>
              ))}
            </div>
          </div>
        ))}
      </ContextSurface>

      <ContextSurface className="flex flex-col gap-2">
        <span className="text-metadata text-text-secondary">{t("sections.recentOrders")}</span>
        {data.recentOrders.length === 0 ? <span className="text-body text-text-secondary">—</span> : null}
        {data.recentOrders.map((o) => (
          <div key={o.id} className="flex items-center justify-between gap-3 border-t border-border-subtle pt-2 first:border-t-0 first:pt-0">
            <StatusLabel tone={adminStatusTone(o.status)}>{o.status}</StatusLabel>
            <span className="text-body text-text-primary">{formatCurrency(o.totalAmount, locale)}</span>
            <span className="text-metadata text-text-secondary">{formatDate(o.createdAt, locale)}</span>
          </div>
        ))}
      </ContextSurface>

      <ContextSurface className="flex flex-col gap-2">
        <span className="text-metadata text-text-secondary">{t("sections.supportCases")}</span>
        {data.supportCases.length === 0 ? <span className="text-body text-text-secondary">—</span> : null}
        {data.supportCases.map((c) => (
          <button key={c.id} type="button" className="flex items-center justify-between gap-3 border-t border-border-subtle pt-2 text-start first:border-t-0 first:pt-0" onClick={() => router.push(`/${locale}/admin/support/${c.id}`)}>
            <span className="text-body text-text-primary">{c.caseNumber}</span>
            <span className="text-metadata text-text-secondary">{c.subject}</span>
            <StatusLabel tone={adminStatusTone(c.status)}>{c.status}</StatusLabel>
          </button>
        ))}
      </ContextSurface>

      <ContextSurface className="flex flex-col gap-2">
        <span className="text-metadata text-text-secondary">{t("sections.disputes")}</span>
        {data.disputes.length === 0 ? <span className="text-body text-text-secondary">—</span> : null}
        {data.disputes.map((d) => (
          <button key={d.id} type="button" className="flex items-center justify-between gap-3 border-t border-border-subtle pt-2 text-start first:border-t-0 first:pt-0" onClick={() => router.push(`/${locale}/admin/disputes/${d.id}`)}>
            <span className="text-body text-text-primary">{d.claim}</span>
            <StatusLabel tone={adminStatusTone(d.status)}>{d.status}</StatusLabel>
          </button>
        ))}
      </ContextSurface>

      <ContextSurface className="flex flex-col gap-2">
        <span className="text-metadata text-text-secondary">{t("sections.communications")}</span>
        {data.communications.length === 0 ? <span className="text-body text-text-secondary">—</span> : null}
        {data.communications.map((n) => (
          <div key={n.id} className="flex items-center justify-between gap-3 border-t border-border-subtle pt-2 first:border-t-0 first:pt-0">
            <span className="text-body text-text-primary">{n.title}</span>
            <span className="text-metadata text-text-secondary">{formatDate(n.createdAt, locale)}</span>
          </div>
        ))}
      </ContextSurface>

      <ContextSurface className="flex flex-col gap-2">
        <span className="text-metadata text-text-secondary">{t("sections.internalNotes")}</span>
        {data.internalNotes.map((n) => (
          <div key={n.id} className="flex flex-col gap-0.5 border-t border-border-subtle pt-2 first:border-t-0 first:pt-0">
            <span className="text-body text-text-primary">{n.body}</span>
            <span className="text-metadata text-text-secondary">
              {n.author.displayName} · {formatDate(n.createdAt, locale)}
            </span>
          </div>
        ))}
        <div className="flex gap-2">
          <Input label={t("addNote.placeholder")} placeholder={t("addNote.placeholder")} value={noteBody} onChange={(e) => setNoteBody(e.target.value)} className="flex-1" />
          <Button onClick={addNote}>{t("addNote.submit")}</Button>
        </div>
      </ContextSurface>

      <ContextSurface className="flex flex-col gap-2">
        <span className="text-metadata text-text-secondary">{t("sections.activity")}</span>
        {data.activityTimeline.slice(0, 20).map((e) => (
          <div key={`${e.type}-${e.id}`} className="flex items-center justify-between gap-3 border-t border-border-subtle pt-2 first:border-t-0 first:pt-0">
            <span className="text-body text-text-primary">{e.summary}</span>
            <span className="text-metadata text-text-secondary">{formatDate(e.occurredAt, locale)}</span>
          </div>
        ))}
      </ContextSurface>
    </div>
  );
}
