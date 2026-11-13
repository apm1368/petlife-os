"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button, ContextSurface, Dialog, EmptyState, ErrorRecovery, Input, Skeleton, StatusLabel, type StatusTone } from "@petlife/ui";
import type { AdminSetPetDetailDto, AdminSetPetDesignFileDto, AdminSetPetListDto, SetPetSizeCode, SetPetStatus, SetPetZoneCode } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { apiErrorText } from "@/lib/errors/api-error-text";
import { formatCurrency } from "@/lib/currency/format-currency";
import { intlLocale } from "@/features/admin/admin-copy";
import { useAdminStore } from "@/stores/admin-store";
import { adminSetPetService } from "@/services/admin-set-pet.service";

type Locale = "fa" | "en" | "de" | "es" | "ar" | "nl";
const STATUSES: SetPetStatus[] = ["SUBMITTED", "QUOTED", "CONFIRMED", "IN_PRODUCTION", "SHIPPED", "CANCELLED"];
const TONE: Record<SetPetStatus, StatusTone> = { SUBMITTED: "attention", QUOTED: "pending", CONFIRMED: "info", IN_PRODUCTION: "info", SHIPPED: "success", CANCELLED: "neutral" };
/** Sizes are stored S…XXXL and shown as 2XL/3XL, the way they are printed on the label. */
export const sizeLabel = (s: SetPetSizeCode) => (s === "XXL" ? "2XL" : s === "XXXL" ? "3XL" : s);

function useFormat() {
  const locale = useLocale() as Locale;
  return {
    locale,
    num: (n: number) => new Intl.NumberFormat(intlLocale(locale)).format(n),
    money: (irr: number) => formatCurrency(irr, locale),
    date: (iso: string) => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium" }).format(new Date(iso)),
    dateTime: (iso: string) => new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)),
  };
}

export function AdminSetPetQueueView() {
  const t = useTranslations("admin.setPet");
  const { locale, num, money, date } = useFormat();
  const [status, setStatus] = useState<SetPetStatus>("SUBMITTED");
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AdminSetPetListDto | null>(null);
  const [error, setError] = useState<"forbidden" | "load" | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setData(null);
    try {
      setData(await adminSetPetService.list({ status, q: q || undefined, page }));
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? "forbidden" : "load");
    }
  }, [status, q, page]);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-page-title text-text-primary">{t("title")}</h1>
        <p className="text-metadata text-text-secondary">{t("intro")}</p>
      </header>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label={t("statusTabs")}>
        {STATUSES.map((s) => (
          <Button
            key={s}
            size="sm"
            role="tab"
            aria-selected={status === s}
            variant={status === s ? "primary" : "ghost"}
            onClick={() => {
              setStatus(s);
              setPage(1);
            }}
          >
            {t(`status.${s}`)}
            {data ? ` (${num(data.counts[s])})` : ""}
          </Button>
        ))}
      </div>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(draft.trim());
          setPage(1);
        }}
      >
        <div className="min-w-48 flex-1">
          <Input label={t("search")} placeholder={t("searchPlaceholder")} value={draft} maxLength={60} onChange={(e) => setDraft(e.target.value)} />
        </div>
        <Button type="submit">{t("searchButton")}</Button>
      </form>
      {error === "forbidden" ? <EmptyState title={t("forbidden")} description="commerce.view" /> : null}
      {error === "load" ? <ErrorRecovery title={t("loadFailed")} message="" retryLabel={t("retry")} onRetry={() => void load()} /> : null}
      {!data && !error ? <Skeleton className="h-48 w-full" aria-label={t("loading")} /> : null}
      {data && data.items.length === 0 ? <EmptyState title={t("empty")} /> : null}
      <ul className="flex flex-col gap-3">
        {data?.items.map((r) => (
          <li key={r.id}>
            <ContextSurface className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <Link className="text-body font-medium text-text-primary underline" href={`/${locale}/admin/commerce/set-pet/${r.id}`}>
                  {r.number} · {r.memberName}
                </Link>
                <span className="block text-metadata text-text-secondary">
                  {t("rowSizes", { human: r.humanSizes.map(sizeLabel).join("، "), pet: sizeLabel(r.petSize) })}
                  {r.petName ? ` · ${r.petName}` : ""} · {t("rowDesigns", { zones: num(r.placements), files: num(r.designs) })}
                </span>
                <span className="block text-metadata text-text-secondary">
                  {t("submittedOn", { date: date(r.createdAt) })}
                  {r.quoteAmountIrr !== null ? ` · ${money(r.quoteAmountIrr)}` : ""}
                  {r.estimatedReadyAt ? ` · ${t("readyBy", { date: date(r.estimatedReadyAt) })}` : ""}
                </span>
              </div>
              <StatusLabel tone={TONE[r.status]}>{t(`status.${r.status}`)}</StatusLabel>
            </ContextSurface>
          </li>
        ))}
      </ul>
      {data && data.total > data.pageSize ? (
        <nav className="flex items-center gap-3" aria-label={t("pages")}>
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((v) => v - 1)}>
            {t("previous")}
          </Button>
          <span className="text-metadata">{num(page)}</span>
          <Button size="sm" variant="secondary" disabled={page * data.pageSize >= data.total} onClick={() => setPage((v) => v + 1)}>
            {t("next")}
          </Button>
        </nav>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <ContextSurface className="flex min-w-0 flex-col gap-3">
      <h2 className="text-section-title text-text-primary">{title}</h2>
      {children}
    </ContextSurface>
  );
}

const ZONES: Array<{ zone: SetPetZoneCode; size: string }> = [
  { zone: "RIGHT_UPPER_ARM", size: "10×10" },
  { zone: "LEFT_UPPER_ARM", size: "10×10" },
  { zone: "FRONT_CENTER", size: "20×20" },
  { zone: "BACK", size: "20×20" },
  { zone: "PET_BACK", size: "" },
];

export function AdminSetPetDetailView({ id }: { id: string }) {
  const t = useTranslations("admin.setPet");
  const { locale, num, money, date, dateTime } = useFormat();
  const canManage = !!useAdminStore((s) => s.context?.permissions)?.includes("commerce.manage");
  const [data, setData] = useState<AdminSetPetDetailDto | null>(null);
  const [error, setError] = useState<"forbidden" | "notFound" | "load" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState("");
  const [readyBy, setReadyBy] = useState("");
  const [quoteNote, setQuoteNote] = useState("");
  const [statusTo, setStatusTo] = useState<SetPetStatus | null>(null);
  const [statusNote, setStatusNote] = useState("");
  const [shippingNote, setShippingNote] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [downloading, setDownloading] = useState<AdminSetPetDesignFileDto | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const row = await adminSetPetService.get(id);
      setData(row);
      setAdminNote(row.adminNote ?? "");
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? "forbidden" : e instanceof ApiError && e.status === 404 ? "notFound" : "load");
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<AdminSetPetDetailDto>, after?: () => void) {
    setBusy(true);
    setActionError(null);
    try {
      const row = await action();
      setData(row);
      after?.();
    } catch (e) {
      setActionError(apiErrorText(e, locale, t("actionFailed")));
    } finally {
      setBusy(false);
    }
  }

  async function openDesign() {
    if (!downloading || reason.trim().length < 5) return;
    setBusy(true);
    setActionError(null);
    try {
      const target = await adminSetPetService.download(downloading.id, reason.trim());
      window.open(target.downloadUrl, "_blank", "noopener,noreferrer");
      setDownloading(null);
      setReason("");
    } catch (e) {
      setActionError(apiErrorText(e, locale, t("downloadFailed")));
    } finally {
      setBusy(false);
    }
  }

  if (error === "forbidden") return <EmptyState title={t("forbidden")} description="commerce.view" />;
  if (error === "notFound") return <EmptyState title={t("notFound")} />;
  if (error === "load") return <ErrorRecovery title={t("loadFailed")} message="" retryLabel={t("retry")} onRetry={() => void load()} />;
  if (!data) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;

  const byZone = new Map(data.placements.map((p) => [p.zone, p.designFile]));
  const fileLabel = (f: AdminSetPetDesignFileDto) => `${f.originalFilename ?? f.mimeType} · ${num(Math.ceil(f.fileSizeBytes / 1024))} KB`;

  return (
    <div className="flex min-w-0 flex-col gap-4 break-words">
      <Link className="text-metadata underline" href={`/${locale}/admin/commerce/set-pet`}>
        {t("back")}
      </Link>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-page-title text-text-primary">{data.number}</h1>
          <p className="text-metadata text-text-secondary">
            {data.member.displayName}
            {data.pet ? ` · ${data.pet.name}` : ""} · {t("submittedOn", { date: dateTime(data.createdAt) })}
          </p>
        </div>
        <StatusLabel tone={TONE[data.status]}>{t(`status.${data.status}`)}</StatusLabel>
      </header>
      {actionError ? (
        <p role="alert" className="text-metadata text-state-urgent">
          {actionError}
        </p>
      ) : null}

      <Section title={t("garments")}>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-metadata text-text-secondary">{t("humanGarment")}</dt>
            <dd className="text-body">{t("humanLine", { count: num(data.human.sizes.length), sizes: data.human.sizes.map(sizeLabel).join("، "), colour: data.human.colour })}</dd>
          </div>
          <div>
            <dt className="text-metadata text-text-secondary">{t("petGarment")}</dt>
            <dd className="text-body">{t("petLine", { size: sizeLabel(data.petGarment.size), colour: data.petGarment.colour })}</dd>
          </div>
        </dl>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(["neckCm", "chestCm", "backLengthCm", "weightKg"] as const).map((k) => (
            <div key={k}>
              <dt className="text-metadata text-text-secondary">{t(`measure.${k}`)}</dt>
              <dd className="text-body">{data.petGarment[k] === null ? "—" : num(data.petGarment[k]!)}</dd>
            </div>
          ))}
        </dl>
        {data.notes ? <p className="whitespace-pre-wrap text-body text-text-secondary">{t("memberNotes", { notes: data.notes })}</p> : null}
      </Section>

      <Section title={t("placement")}>
        <p className="text-metadata text-text-secondary">{t("placementHint")}</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {ZONES.map(({ zone, size }) => {
            const file = byZone.get(zone);
            return (
              <li key={zone} className={`rounded-md border p-3 ${file ? "border-border-strong" : "border-dashed border-border-subtle"}`}>
                <span className="block text-body font-medium">
                  {t(`zone.${zone}`)}
                  {size ? <span className="text-metadata text-text-secondary"> · {t("cm", { size })}</span> : null}
                </span>
                {file ? (
                  <span className="flex flex-wrap items-center gap-2 text-metadata text-text-secondary">
                    {fileLabel(file)}
                    {file.status === "READY" ? (
                      <Button size="sm" variant="secondary" onClick={() => setDownloading(file)}>
                        {t("openDesign")}
                      </Button>
                    ) : (
                      <span>{t(`fileStatus.${file.status}`)}</span>
                    )}
                  </span>
                ) : (
                  <span className="text-metadata text-text-secondary">{t("noDesign")}</span>
                )}
              </li>
            );
          })}
        </ul>
        <p className="text-metadata text-text-secondary">{t("downloadsAudited")}</p>
      </Section>

      <Section title={t("quote")}>
        {data.quote.amountIrr !== null ? (
          <p className="text-body">
            {t("quoteLine", { amount: money(data.quote.amountIrr), date: data.quote.estimatedReadyAt ? date(data.quote.estimatedReadyAt) : "—" })}
            {data.quote.quotedBy ? <span className="text-metadata text-text-secondary"> · {t("by", { name: data.quote.quotedBy })}</span> : null}
          </p>
        ) : (
          <p className="text-metadata text-text-secondary">{t("noQuote")}</p>
        )}
        {data.quote.note ? <p className="whitespace-pre-wrap text-metadata text-text-secondary">{data.quote.note}</p> : null}
        {canManage && data.canQuote ? (
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              const toman = Number(amount);
              if (!Number.isSafeInteger(toman) || toman <= 0 || !readyBy || quoteNote.trim().length < 3) {
                setActionError(t("quoteInvalid"));
                return;
              }
              void run(async () => adminSetPetService.quote(id, { amountIrr: toman * 10, estimatedReadyAt: new Date(`${readyBy}T12:00:00Z`).toISOString(), note: quoteNote.trim() }), () => {
                setAmount("");
                setReadyBy("");
                setQuoteNote("");
              });
            }}
          >
            <Input label={t("amountToman")} type="number" min={1} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
            <Input label={t("readyByLabel")} type="date" value={readyBy} onChange={(e) => setReadyBy(e.target.value)} />
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-metadata text-text-secondary">{t("quoteNote")}</span>
              <textarea value={quoteNote} maxLength={1000} rows={3} onChange={(e) => setQuoteNote(e.target.value)} className="rounded-md border border-border-strong bg-surface-elevated p-2 text-body" />
            </label>
            <Button type="submit" isLoading={busy}>
              {t(data.status === "QUOTED" ? "requote" : "sendQuote")}
            </Button>
          </form>
        ) : null}
      </Section>

      {canManage && data.allowedTransitions.length ? (
        <Section title={t("statusActions")}>
          <div className="flex flex-wrap gap-2">
            {data.allowedTransitions.map((to) => (
              <Button key={to} size="sm" variant={to === "CANCELLED" ? "ghost" : "secondary"} onClick={() => setStatusTo(to)}>
                {t(`action.${to}`)}
              </Button>
            ))}
          </div>
          {data.status === "QUOTED" ? <p className="text-metadata text-text-secondary">{t("waitingForMember")}</p> : null}
        </Section>
      ) : null}

      {data.cancelled ? (
        <p className="text-metadata text-text-secondary">{t("cancelledLine", { by: t(`actor.${data.cancelled.by ?? "STAFF"}`), reason: data.cancelled.reason ?? "—" })}</p>
      ) : null}
      {data.shippingNote ? <p className="text-metadata text-text-secondary">{t("shippingLine", { note: data.shippingNote })}</p> : null}

      <Section title={t("timeline")}>
        <ol className="flex flex-col gap-2">
          {data.timeline.map((e) => (
            <li key={e.id} className="border-t border-border-subtle pt-2 first:border-t-0 first:pt-0">
              <span className="block text-metadata text-text-secondary">
                {dateTime(e.at)} · {e.actor === "STAFF" ? e.staffName ?? t("actor.STAFF") : t("actor.MEMBER")}
              </span>
              <span className="text-body">
                {e.from ? `${t(`status.${e.from}`)} → ` : ""}
                {t(`status.${e.to}`)}
              </span>
              {e.note ? <span className="block whitespace-pre-wrap text-metadata text-text-secondary">{e.note}</span> : null}
            </li>
          ))}
        </ol>
      </Section>

      <Section title={t("adminNote")}>
        <p className="text-metadata text-text-secondary">{t("adminNoteHint")}</p>
        <textarea aria-label={t("adminNote")} value={adminNote} maxLength={2000} rows={3} disabled={!canManage} onChange={(e) => setAdminNote(e.target.value)} className="rounded-md border border-border-strong bg-surface-elevated p-2 text-body" />
        {canManage ? (
          <Button variant="secondary" isLoading={busy} onClick={() => void run(async () => adminSetPetService.saveNote(id, adminNote))}>
            {t("saveNote")}
          </Button>
        ) : null}
      </Section>

      <Dialog open={!!statusTo} title={statusTo ? t(`action.${statusTo}`) : ""} onClose={() => !busy && setStatusTo(null)}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!statusTo) return;
            if (statusTo === "CANCELLED" && statusNote.trim().length < 3) {
              setActionError(t("cancelReasonRequired"));
              return;
            }
            void run(async () => adminSetPetService.setStatus(id, { to: statusTo, note: statusNote.trim() || undefined, shippingNote: statusTo === "SHIPPED" ? shippingNote.trim() || undefined : undefined }), () => {
              setStatusTo(null);
              setStatusNote("");
              setShippingNote("");
            });
          }}
        >
          {statusTo === "SHIPPED" ? <Input label={t("shippingNote")} value={shippingNote} maxLength={500} onChange={(e) => setShippingNote(e.target.value)} /> : null}
          <label className="flex flex-col gap-1">
            <span className="text-metadata text-text-secondary">{t(statusTo === "CANCELLED" ? "cancelReason" : "statusNote")}</span>
            <textarea value={statusNote} maxLength={1000} rows={3} onChange={(e) => setStatusNote(e.target.value)} className="rounded-md border border-border-strong bg-surface-elevated p-2 text-body" />
          </label>
          <p className="text-metadata text-text-secondary">{t("memberIsNotified")}</p>
          <Button type="submit" isLoading={busy}>
            {t("confirm")}
          </Button>
        </form>
      </Dialog>

      <Dialog open={!!downloading} title={t("openDesign")} onClose={() => !busy && setDownloading(null)}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void openDesign();
          }}
        >
          <p className="text-metadata text-text-secondary">{downloading ? fileLabel(downloading) : ""}</p>
          <Input label={t("downloadReason")} value={reason} minLength={5} maxLength={300} onChange={(e) => setReason(e.target.value)} />
          <Button type="submit" isLoading={busy} disabled={reason.trim().length < 5}>
            {t("downloadConfirm")}
          </Button>
        </form>
      </Dialog>
    </div>
  );
}
