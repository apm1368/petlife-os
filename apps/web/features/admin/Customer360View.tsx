"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button, ContextSurface, ErrorRecovery, Input, Skeleton, StatusLabel } from "@petlife/ui";
import { InternalNoteEntityType, type Customer360Dto } from "@petlife/types";
import { adminService } from "@/services/admin.service";
import { formatCurrency } from "@/lib/currency/format-currency";
import { adminStatusTone } from "./status-tone";
import { useAdminStore } from "@/stores/admin-store";
import { ApiError } from "@/lib/api/client";
import { useStatusText } from "@/lib/status/use-status-text";

function formatDate(iso: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "fa" ? "fa-IR" : "en-US").format(new Date(iso));
}

export function Customer360View({ userId }: { userId: string }) {
  const context = useAdminStore(s => s.context);
  const t = useTranslations("admin.customer360");
  const common = useTranslations("admin.common");
  if (!context) return <p role="status">{common("loading")}</p>;
  if (!context.isAdmin || !context.permissions.includes("customer.view")) return <p role="alert">{t("forbidden")}</p>;
  // Remount on identity/permission changes: previously revealed PII and drafts cannot cross identities.
  return <CustomerRecord key={JSON.stringify([userId, context.adminUserId, context.role, context.permissions])} userId={userId} canReveal={context.permissions.includes("customer.pii.reveal")} />;
}

function CustomerRecord({ userId, canReveal }: { userId: string; canReveal: boolean }) {
  const t = useTranslations("admin.customer360");
  const tCommon = useTranslations("admin.common");
  const router = useRouter();
  const locale = useLocale() as "fa" | "en";
  const status = useStatusText();

  const [data, setData] = useState<Customer360Dto | null>(null);
  const [error, setError] = useState<"loadFailed" | "notFound" | "forbidden" | null>(null);
  const [revealed, setRevealed] = useState<{ field: string; value: string } | null>(null);
  const [reason, setReason] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const actionLock = useRef(false);
  const mounted = useRef(true);
  const [actionError, setActionError] = useState<"revealFailed" | "noteUncertain" | null>(null);
  const [noteUncertain, setNoteUncertain] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const noteDraftRef = useRef("");
  const noteUncertainRef = useRef(false);
  useEffect(() => { noteDraftRef.current = noteBody; noteUncertainRef.current = noteUncertain; }, [noteBody, noteUncertain]);

  const load = () => setRevision(value => value + 1);
  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    setData(null);
    void adminService.getCustomer360(userId, controller.signal).then(value => {
      if (!controller.signal.aborted) {
        setData(value);
        if (noteUncertainRef.current) {
          const recorded = value.internalNotes.some(note => note.body === noteDraftRef.current.trim());
          setNoteUncertain(false); setActionError(null);
          if (recorded) { setNoteBody(""); setNoteSaved(true); }
        }
      }
    }).catch(error => {
      if (!controller.signal.aborted) setError(error instanceof ApiError && error.status === 404 ? "notFound" : error instanceof ApiError && error.status === 403 ? "forbidden" : "loadFailed");
    });
    return () => controller.abort();
  }, [userId, revision]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function reveal(field: "email" | "phone") {
    if (!canReveal || !reason.trim() || actionLock.current) return;
    actionLock.current = true; setBusy(true); setActionError(null); setRevealed(null);
    try {
      const result = await adminService.revealPii(userId, field, reason.trim());
      if (mounted.current) setRevealed({ field: result.field, value: result.value });
    } catch {
      if (mounted.current) setActionError("revealFailed");
    } finally {
      actionLock.current = false; if (mounted.current) setBusy(false);
    }
  }

  async function addNote() {
    if (!noteBody.trim() || actionLock.current || noteUncertain) return;
    actionLock.current = true; setBusy(true); setActionError(null); setNoteSaved(false);
    try {
      await adminService.addNote(InternalNoteEntityType.USER, userId, noteBody.trim());
      if (mounted.current) { setNoteBody(""); setNoteSaved(true); load(); }
    } catch {
      if (mounted.current) { setActionError("noteUncertain"); setNoteUncertain(true); }
    } finally {
      actionLock.current = false; if (mounted.current) setBusy(false);
    }
  }

  if (error) return <ErrorRecovery title={t(error)} message="" retryLabel={tCommon("retry")} onRetry={load} />;
  if (!data) return <Skeleton className="h-64 w-full" aria-label={tCommon("loading")} />;

  return (
    <div className="flex flex-col gap-4">
      <Button variant="ghost" size="sm" onClick={() => router.push(`/${locale}/admin/customers`)}>
        {tCommon("backToList")}
      </Button>
      <h1 className="text-page-title text-text-primary">{data.user.displayName}</h1>
      {actionError === "revealFailed" && <p role="alert">{t(actionError)}</p>}
      {noteUncertain && <p role="alert">{t("noteUncertain")}</p>}
      {noteSaved && <p role="status">{t("noteSaved")}</p>}
      {noteUncertain && <Button onClick={load}>{t("reloadNotes")}</Button>}

      <ContextSurface className="flex flex-col gap-2">
        <span className="text-metadata text-text-secondary">{t("sections.contact")}</span>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-body text-text-primary">{revealed?.field === "email" ? revealed.value : data.user.emailMasked ?? "—"}</span>
          {canReveal && <Button disabled={busy || !reason.trim()} size="sm" variant="secondary" onClick={() => reveal("email")}>
            {t("reveal.email")}
          </Button>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-body text-text-primary">{revealed?.field === "phone" ? revealed.value : data.user.phoneMasked ?? "—"}</span>
          {canReveal && <Button disabled={busy || !reason.trim()} size="sm" variant="secondary" onClick={() => reveal("phone")}>
            {t("reveal.phone")}
          </Button>}
        </div>
        {canReveal && <Input disabled={busy} label={tCommon("reasonLabel")} placeholder={tCommon("reasonPlaceholder")} value={reason} onChange={(e) => setReason(e.target.value)} />}
        {canReveal && !reason.trim() ? <p className="text-metadata text-text-secondary">{t("revealReasonHelp")}</p> : null}
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
            <StatusLabel tone={adminStatusTone(o.status)}>{status.label(o.status)}</StatusLabel>
            <span className="text-body text-text-primary">{formatCurrency(o.totalAmount, locale)}</span>
            <span className="text-metadata text-text-secondary">{formatDate(o.createdAt, locale)}</span>
          </div>
        ))}
      </ContextSurface>

      <ContextSurface className="flex flex-col gap-2">
        <h2 className="text-metadata text-text-secondary">{t("sections.recentBookings")}</h2>
        {data.recentBookings.length === 0 ? <p>{t("noBookings")}</p> : null}
        {data.recentBookings.map(booking => <div key={booking.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle pt-2">
          <StatusLabel tone={adminStatusTone(booking.bookingStatus)}>{status.label(booking.bookingStatus)}</StatusLabel>
          <span>{formatDate(booking.startAt, locale)}</span>
        </div>)}
      </ContextSurface>

      <ContextSurface className="flex flex-col gap-2">
        <span className="text-metadata text-text-secondary">{t("sections.supportCases")}</span>
        {data.supportCases.length === 0 ? <span className="text-body text-text-secondary">—</span> : null}
        {data.supportCases.map((c) => (
          <button key={c.id} type="button" className="flex items-center justify-between gap-3 border-t border-border-subtle pt-2 text-start first:border-t-0 first:pt-0" onClick={() => router.push(`/${locale}/admin/support/${c.id}`)}>
            <span className="text-body text-text-primary">{c.caseNumber}</span>
            <span className="text-metadata text-text-secondary">{c.subject}</span>
            <StatusLabel tone={adminStatusTone(c.status)}>{status.label(c.status)}</StatusLabel>
          </button>
        ))}
      </ContextSurface>

      <ContextSurface className="flex flex-col gap-2">
        <span className="text-metadata text-text-secondary">{t("sections.disputes")}</span>
        {data.disputes.length === 0 ? <span className="text-body text-text-secondary">—</span> : null}
        {data.disputes.map((d) => (
          <button key={d.id} type="button" className="flex items-center justify-between gap-3 border-t border-border-subtle pt-2 text-start first:border-t-0 first:pt-0" onClick={() => router.push(`/${locale}/admin/disputes/${d.id}`)}>
            <span className="text-body text-text-primary">{d.claim}</span>
            <StatusLabel tone={adminStatusTone(d.status)}>{status.label(d.status)}</StatusLabel>
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
          <Input disabled={busy || noteUncertain} label={t("addNote.placeholder")} placeholder={t("addNote.placeholder")} value={noteBody} onChange={(e) => setNoteBody(e.target.value)} className="flex-1" />
          <Button disabled={busy || noteUncertain || !noteBody.trim()} onClick={addNote}>{t("addNote.submit")}</Button>
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
