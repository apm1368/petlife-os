"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Button, ContextSurface, Dialog, EmptyState, ErrorRecovery, Input, Skeleton, StatusLabel, type StatusTone } from "@petlife/ui";
import {
  SET_PET_GARMENTS,
  SET_PET_ZONE_KEYS,
  type AdminSetPetDesignFileDto,
  type AdminSetPetDetailDto,
  type AdminSetPetListDto,
  type AdminSetPetSettingsDto,
  type SetPetRequestStatus as SetPetStatus,
  type SetPetSize as SetPetSizeCode,
} from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { apiErrorText } from "@/lib/errors/api-error-text";
import { formatCurrency } from "@/lib/currency/format-currency";
import { intlLocale } from "@/features/admin/admin-copy";
import { useAdminStore } from "@/stores/admin-store";
import { adminSetPetService } from "@/services/admin-set-pet.service";

type Locale = "fa" | "en" | "de" | "es" | "ar" | "nl";
const STATUSES: SetPetStatus[] = ["SUBMITTED", "NEEDS_NEW_DESIGN", "PROOF_SENT", "AWAITING_PAYMENT", "PAID", "IN_PRODUCTION", "SHIPPED", "CANCELLED"];
const TONE: Record<SetPetStatus, StatusTone> = {
  SUBMITTED: "attention",
  NEEDS_NEW_DESIGN: "pending",
  PROOF_SENT: "pending",
  AWAITING_PAYMENT: "pending",
  PAID: "attention",
  IN_PRODUCTION: "info",
  SHIPPED: "success",
  CANCELLED: "neutral",
};
/** Sizes are stored S…XXXL and shown as 2XL/3XL, the way they are printed on the label. */
export const sizeLabel = (s: SetPetSizeCode) => (s === "XXL" ? "2XL" : s === "XXXL" ? "3XL" : s);
const ZONE_CM: Record<string, string> = { RIGHT_UPPER_ARM: "10×10", LEFT_UPPER_ARM: "10×10", FRONT_CENTER: "20×20", BACK: "20×20", PET_BACK: "" };
const PROOF_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <ContextSurface className="flex min-w-0 flex-col gap-3">
      <h2 className="text-section-title text-text-primary">{title}</h2>
      {children}
    </ContextSurface>
  );
}

const textarea = "rounded-md border border-border-strong bg-surface-elevated p-2 text-body";

/** The «ست پت» queue (owner P38: its own admin section): tabs by status with counts, search by number or name. */
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
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-page-title text-text-primary">{t("title")}</h1>
          <p className="text-metadata text-text-secondary">{t("intro")}</p>
        </div>
        <Link className="text-metadata underline" href={`/${locale}/admin/commerce/set-pet/prices`}>{t("prices.link")}</Link>
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
                  {t("rowGarments", { people: num(r.humanGarments), pets: num(r.petGarments), zones: num(r.placements) })}
                </span>
                <span className="block text-metadata text-text-secondary">
                  {t("submittedOn", { date: date(r.createdAt) })} · {money(r.totalPaidIrr ?? r.itemsTotalIrr)}
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
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((v) => v - 1)}>{t("previous")}</Button>
          <span className="text-metadata">{num(page)}</span>
          <Button size="sm" variant="secondary" disabled={page * data.pageSize >= data.total} onClick={() => setPage((v) => v + 1)}>{t("next")}</Button>
        </nav>
      ) : null}
    </div>
  );
}

/** One order: garments, prints (audited downloads), price and payment, the print proof, and the staff actions. */
export function AdminSetPetDetailView({ id }: { id: string }) {
  const t = useTranslations("admin.setPet");
  const tg = useTranslations("setPet.garments");
  const tc = useTranslations("setPet.colours");
  const tf = useTranslations("setPet.fonts");
  const tp = useTranslations("setPet.shipping");
  const { locale, num, money, dateTime, date } = useFormat();
  const canManage = !!useAdminStore((s) => s.context?.permissions)?.includes("commerce.manage");
  const [data, setData] = useState<AdminSetPetDetailDto | null>(null);
  const [error, setError] = useState<"forbidden" | "notFound" | "load" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<null | "proof" | "reject" | "IN_PRODUCTION" | "SHIPPED" | "CANCELLED">(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofNote, setProofNote] = useState("");
  const [petW, setPetW] = useState("");
  const [petH, setPetH] = useState("");
  const [note, setNote] = useState("");
  const [shippingNote, setShippingNote] = useState("");
  const [printDefect, setPrintDefect] = useState(false);
  const [adminNote, setAdminNote] = useState("");
  const [downloading, setDownloading] = useState<AdminSetPetDesignFileDto | null>(null);
  const [reason, setReason] = useState("");
  const [proofUrls, setProofUrls] = useState<Record<string, string>>({});

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

  // Proofs are our own checked raster images: shown through short-lived same-origin links.
  useEffect(() => {
    if (!data) return;
    for (const p of data.proofs) {
      if (proofUrls[p.id]) continue;
      void adminSetPetService.proofLink(data.id, p.id).then((r) => {
        if (r.url.startsWith("/") || r.url.startsWith(window.location.origin)) setProofUrls((m) => ({ ...m, [p.id]: r.url }));
      }).catch(() => undefined);
    }
  }, [data, proofUrls]);

  function close(force = false) {
    if (busy && !force) return;
    setDialog(null);
    setNote("");
    setShippingNote("");
    setPrintDefect(false);
    setProofFile(null);
    setProofNote("");
    setPetW("");
    setPetH("");
  }

  async function run(action: () => Promise<AdminSetPetDetailDto>) {
    setBusy(true);
    setActionError(null);
    try {
      setData(await action());
      close(true);
    } catch (e) {
      setActionError(apiErrorText(e, locale, t("actionFailed")));
    } finally {
      setBusy(false);
    }
  }

  async function sendProof() {
    if (!proofFile || !PROOF_TYPES.has(proofFile.type)) return setActionError(t("proof.type"));
    const w = petW ? Number(petW) : undefined;
    const h = petH ? Number(petH) : undefined;
    await run(async () => {
      const target = await adminSetPetService.proofUploadTarget(id, { contentType: proofFile.type, fileSizeBytes: proofFile.size });
      const put = await fetch(target.uploadUrl, { method: target.method, headers: target.headers ?? { "Content-Type": proofFile.type }, body: proofFile, credentials: "omit" });
      if (!put.ok) throw new Error(`upload ${put.status}`);
      return adminSetPetService.sendProof(id, target.proofId, { note: proofNote.trim() || undefined, petPrintWidthCm: w, petPrintHeightCm: h });
    });
  }

  async function openDesign() {
    if (!downloading || reason.trim().length < 5) return;
    setBusy(true);
    setActionError(null);
    try {
      const target = await adminSetPetService.download(id, downloading.id, reason.trim());
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

  const fileLabel = (f: AdminSetPetDesignFileDto) => `${f.originalFilename ?? f.mimeType} · ${num(Math.ceil(f.fileSizeBytes / 1024))} KB${f.widthPx && f.heightPx ? ` · ${num(f.widthPx)}×${num(f.heightPx)} px` : ""}`;
  const a = data.actions;
  const address = data.payment.shippingAddress as { recipient?: string | null; phone?: string | null; addressLine?: string | null; city?: string | null; postalCode?: string | null } | null;

  return (
    <div className="flex min-w-0 flex-col gap-4 break-words">
      <Link className="text-metadata underline" href={`/${locale}/admin/commerce/set-pet`}>{t("back")}</Link>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-page-title text-text-primary">{data.number}</h1>
          <p className="text-metadata text-text-secondary">
            {data.member.displayName} · {t("submittedOn", { date: dateTime(data.createdAt) })}
            {data.forPet ? ` · ${t("inMemoryOf", { name: data.forPet.name })}` : ""}
          </p>
        </div>
        <StatusLabel tone={TONE[data.status]}>{t(`status.${data.status}`)}</StatusLabel>
      </header>
      {actionError ? <p role="alert" className="text-metadata text-state-urgent">{actionError}</p> : null}

      {canManage ? (
        <Section title={t("actionsTitle")}>
          <div className="flex flex-wrap gap-2">
            {a.sendProof ? <Button size="sm" onClick={() => setDialog("proof")}>{t(data.status === "PROOF_SENT" ? "proof.replace" : "proof.send")}</Button> : null}
            {a.rejectDesign ? <Button size="sm" variant="secondary" onClick={() => setDialog("reject")}>{t("reject.action")}</Button> : null}
            {a.startProduction ? <Button size="sm" onClick={() => setDialog("IN_PRODUCTION")}>{t("action.IN_PRODUCTION")}</Button> : null}
            {a.ship ? <Button size="sm" onClick={() => setDialog("SHIPPED")}>{t("action.SHIPPED")}</Button> : null}
            {a.cancel ? <Button size="sm" variant="ghost" onClick={() => setDialog("CANCELLED")}>{t(a.printDefectOnly ? "action.defect" : "action.CANCELLED")}</Button> : null}
          </div>
          <p className="text-metadata text-text-secondary">{t(`hint.${data.status}`)}</p>
        </Section>
      ) : null}

      <Section title={t("garments")}>
        <ul className="flex flex-col gap-1">
          {data.items.map((i) => (
            <li key={i.position} className="text-body">
              {tg(i.garment)} · {sizeLabel(i.size)} · {tc(i.colour)}
              {i.pet ? ` · ${i.pet.name}` : i.petName ? ` · ${i.petName} (${t(`species.${i.petSpecies ?? "DOG"}`)})` : ""}
            </li>
          ))}
        </ul>
        {data.notes ? <p className="whitespace-pre-wrap text-body text-text-secondary">{t("memberNotes", { notes: data.notes })}</p> : null}
      </Section>

      <Section title={t("placement")}>
        <p className="text-metadata text-text-secondary">{t("placementHint")}</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {data.placements.map((p) => (
            <li key={p.zone} className="rounded-md border border-border-strong p-3">
              <span className="block text-body font-medium">
                {t(`zone.${p.zone}`)}
                {ZONE_CM[p.zone] ? <span className="text-metadata text-text-secondary"> · {t("cm", { size: ZONE_CM[p.zone]! })}</span> : null}
              </span>
              {p.text ? (
                <span className="block text-metadata text-text-secondary">{t("textPrint", { text: p.text, font: p.font ? tf(p.font) : "", colour: p.textColour ? tc(p.textColour) : "" })}</span>
              ) : p.designFile ? (
                <span className="flex flex-wrap items-center gap-2 text-metadata text-text-secondary">
                  {fileLabel(p.designFile)}
                  {p.scale !== 1 || p.offsetX || p.offsetY ? <span>{t("transform", { zoom: num(p.scale), x: num(p.offsetX), y: num(p.offsetY) })}</span> : null}
                  <Button size="sm" variant="secondary" onClick={() => setDownloading(p.designFile)}>{t("openDesign")}</Button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="text-metadata text-text-secondary">{t("downloadsAudited")}</p>
      </Section>

      <Section title={t("priceTitle")}>
        <ul className="flex flex-col gap-1 text-body">
          {data.price.lines.map((l) => (
            <li key={l.position}>{tg(l.garment)}: {money(l.garmentIrr)}{l.zones.length ? ` + ${l.zones.map((z) => `${t(`zone.${z.zone}`)} ${money(z.irr)}`).join(" + ")}` : ""} = {money(l.lineIrr)}</li>
          ))}
          {data.price.discountIrr ? <li>{t("discountLine", { percent: num(data.price.discountPercent), amount: money(data.price.discountIrr) })}</li> : null}
          <li className="font-medium">{t("itemsTotal", { amount: money(data.price.totalIrr) })}</li>
          {data.payment.totalPaidIrr != null ? (
            <li className="font-medium">
              {t("paidLine", { amount: money(data.payment.totalPaidIrr), shipping: data.payment.shippingIrr != null ? money(data.payment.shippingIrr) : "—", method: data.payment.shippingProvider ? tp(data.payment.shippingProvider) : "—", date: data.payment.paidAt ? dateTime(data.payment.paidAt) : "—" })}
            </li>
          ) : null}
          {data.payment.refundedIrr ? <li>{t("refundedLine", { amount: money(data.payment.refundedIrr) })}</li> : null}
        </ul>
        {address ? <p className="whitespace-pre-wrap text-metadata text-text-secondary">{t("shipTo", { address: [address.recipient, address.phone, address.city, address.addressLine, address.postalCode].filter(Boolean).join("، ") })}</p> : null}
        {data.estimatedReadyAt ? <p className="text-metadata text-text-secondary">{t("readyBy", { date: date(data.estimatedReadyAt) })}</p> : null}
        {data.shippingNote ? <p className="text-metadata text-text-secondary">{t("shippingLine", { note: data.shippingNote })}</p> : null}
      </Section>

      <Section title={t("proof.title")}>
        {data.designRejectReason && data.status === "NEEDS_NEW_DESIGN" ? <p className="text-metadata text-state-urgent">{t("reject.current", { reason: data.designRejectReason })}</p> : null}
        {data.proofs.length ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {data.proofs.map((p) => (
              <li key={p.id} className="flex flex-col gap-1 rounded-md border border-border-subtle p-2">
                {proofUrls[p.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element -- our own checked raster proof, short-lived same-origin link
                  <img src={proofUrls[p.id]} alt={t("proof.alt", { status: t(`proof.status.${p.status}`) })} className="max-h-72 w-full rounded object-contain" />
                ) : null}
                <span className="text-metadata">{t(`proof.status.${p.status}`)}{p.sentAt ? ` · ${dateTime(p.sentAt)}` : ""}{p.uploadedBy ? ` · ${p.uploadedBy}` : ""}</span>
                {p.petPrintWidthCm && p.petPrintHeightCm ? <span className="text-metadata text-text-secondary">{t("proof.petSize", { w: num(p.petPrintWidthCm), h: num(p.petPrintHeightCm) })}</span> : null}
                {p.note ? <span className="whitespace-pre-wrap text-metadata text-text-secondary">{p.note}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-metadata text-text-secondary">{t("proof.none")}</p>
        )}
      </Section>

      {data.cancelled ? <p className="text-metadata text-text-secondary">{t("cancelledLine", { by: t(`actor.${data.cancelled.by ?? "STAFF"}`), reason: data.cancelled.reason ?? "—" })}</p> : null}

      <Section title={t("timeline")}>
        <ol className="flex flex-col gap-2">
          {data.timeline.map((e) => (
            <li key={e.id} className="border-t border-border-subtle pt-2 first:border-t-0 first:pt-0">
              <span className="block text-metadata text-text-secondary">{dateTime(e.at)} · {e.actor === "STAFF" ? e.staffName ?? t("actor.STAFF") : t("actor.MEMBER")}</span>
              <span className="text-body">{e.from ? `${t(`status.${e.from}`)} → ` : ""}{t(`status.${e.to}`)}</span>
              {e.note ? <span className="block whitespace-pre-wrap text-metadata text-text-secondary">{e.note === "EDITED" ? t("edited") : e.note}</span> : null}
            </li>
          ))}
        </ol>
      </Section>

      <Section title={t("adminNote")}>
        <p className="text-metadata text-text-secondary">{t("adminNoteHint")}</p>
        <textarea aria-label={t("adminNote")} value={adminNote} maxLength={2000} rows={3} disabled={!canManage} onChange={(e) => setAdminNote(e.target.value)} className={textarea} />
        {canManage ? <Button variant="secondary" isLoading={busy} onClick={() => void run(async () => adminSetPetService.saveNote(id, adminNote))}>{t("saveNote")}</Button> : null}
      </Section>

      <Dialog open={dialog === "proof"} title={t("proof.send")} onClose={() => close()}>
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void sendProof(); }}>
          <label className="flex flex-col gap-1">
            <span className="text-metadata text-text-secondary">{t("proof.file")}</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setProofFile(e.target.files?.[0] ?? null)} />
          </label>
          {data.items.some((i) => i.garment.startsWith("PET_")) ? (
            <div className="grid grid-cols-2 gap-2">
              <Input label={t("proof.petWidth")} type="number" min={2} max={60} value={petW} onChange={(e) => setPetW(e.target.value)} />
              <Input label={t("proof.petHeight")} type="number" min={2} max={60} value={petH} onChange={(e) => setPetH(e.target.value)} />
            </div>
          ) : null}
          <label className="flex flex-col gap-1">
            <span className="text-metadata text-text-secondary">{t("proof.note")}</span>
            <textarea value={proofNote} maxLength={1000} rows={3} onChange={(e) => setProofNote(e.target.value)} className={textarea} />
          </label>
          <p className="text-metadata text-text-secondary">{t("memberIsNotified")}</p>
          <Button type="submit" isLoading={busy} disabled={!proofFile}>{t("proof.send")}</Button>
        </form>
      </Dialog>

      <Dialog open={dialog === "reject"} title={t("reject.action")} onClose={() => close()}>
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); if (note.trim().length < 3) return setActionError(t("reasonRequired")); void run(async () => adminSetPetService.rejectDesign(id, note.trim())); }}>
          <label className="flex flex-col gap-1">
            <span className="text-metadata text-text-secondary">{t("reject.reason")}</span>
            <textarea value={note} maxLength={1000} rows={3} onChange={(e) => setNote(e.target.value)} className={textarea} />
          </label>
          <p className="text-metadata text-text-secondary">{t("memberIsNotified")}</p>
          <Button type="submit" isLoading={busy}>{t("confirm")}</Button>
        </form>
      </Dialog>

      <Dialog open={dialog === "IN_PRODUCTION" || dialog === "SHIPPED" || dialog === "CANCELLED"} title={dialog && dialog !== "proof" && dialog !== "reject" ? t(dialog === "CANCELLED" && a.printDefectOnly ? "action.defect" : `action.${dialog}`) : ""} onClose={() => close()}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (dialog !== "IN_PRODUCTION" && dialog !== "SHIPPED" && dialog !== "CANCELLED") return;
            if (dialog === "CANCELLED" && note.trim().length < 3) return setActionError(t("reasonRequired"));
            if (dialog === "SHIPPED" && !shippingNote.trim()) return setActionError(t("trackingRequired"));
            if (dialog === "CANCELLED" && a.printDefectOnly && !printDefect) return setActionError(t("defectRequired"));
            void run(async () => adminSetPetService.setStatus(id, { to: dialog, note: note.trim() || undefined, shippingNote: dialog === "SHIPPED" ? shippingNote.trim() : undefined, printDefect: dialog === "CANCELLED" && a.printDefectOnly ? printDefect : undefined }));
          }}
        >
          {dialog === "SHIPPED" ? <Input label={t("shippingNote")} value={shippingNote} maxLength={500} onChange={(e) => setShippingNote(e.target.value)} /> : null}
          <label className="flex flex-col gap-1">
            <span className="text-metadata text-text-secondary">{t(dialog === "CANCELLED" ? "cancelReason" : "statusNote")}</span>
            <textarea value={note} maxLength={1000} rows={3} onChange={(e) => setNote(e.target.value)} className={textarea} />
          </label>
          {dialog === "CANCELLED" && a.printDefectOnly ? (
            <label className="flex items-center gap-2 text-body">
              <input type="checkbox" checked={printDefect} onChange={(e) => setPrintDefect(e.target.checked)} />
              {t("defectConfirm")}
            </label>
          ) : null}
          {dialog === "CANCELLED" && a.refundsOnCancel ? <p className="text-metadata text-text-secondary">{t("refundNote", { amount: money(data.payment.totalPaidIrr ?? 0) })}</p> : null}
          <p className="text-metadata text-text-secondary">{t("memberIsNotified")}</p>
          <Button type="submit" isLoading={busy}>{t("confirm")}</Button>
        </form>
      </Dialog>

      <Dialog open={!!downloading} title={t("openDesign")} onClose={() => !busy && setDownloading(null)}>
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); void openDesign(); }}>
          <p className="text-metadata text-text-secondary">{downloading ? fileLabel(downloading) : ""}</p>
          <Input label={t("downloadReason")} value={reason} minLength={5} maxLength={300} onChange={(e) => setReason(e.target.value)} />
          <Button type="submit" isLoading={busy} disabled={reason.trim().length < 5}>{t("downloadConfirm")}</Button>
        </form>
      </Dialog>
    </div>
  );
}

/** The fixed price table (owner F1/P36/P37): per garment, per print zone (per garment printed), and the set discount. */
export function AdminSetPetPricesView() {
  const t = useTranslations("admin.setPet");
  const tg = useTranslations("setPet.garments");
  const { locale, dateTime } = useFormat();
  const canManage = !!useAdminStore((s) => s.context?.permissions)?.includes("commerce.manage");
  const [data, setData] = useState<AdminSetPetSettingsDto | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState<"forbidden" | "load" | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const fill = (s: AdminSetPetSettingsDto) => {
    const toman = (irr: number | undefined) => (irr ? String(irr / 10) : "");
    setForm({
      ...Object.fromEntries(SET_PET_GARMENTS.map((g) => [`g.${g}`, toman(s.garmentPricesIrr[g])])),
      ...Object.fromEntries(SET_PET_ZONE_KEYS.map((z) => [`z.${z}`, toman(s.zonePricesIrr[z])])),
      discount: String(s.setDiscountPercent),
      days: String(s.productionWorkingDays),
      city: s.workshopCity ?? "",
    });
  };
  const load = useCallback(async () => {
    setError(null);
    try {
      const s = await adminSetPetService.settings();
      setData(s);
      fill(s);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? "forbidden" : "load");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    const irr = (key: string) => {
      const raw = (form[key] ?? "").replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[,٬\s]/g, "");
      const toman = raw ? Number(raw) : 0;
      return Number.isSafeInteger(toman) && toman >= 0 ? toman * 10 : NaN;
    };
    const garmentPricesIrr = Object.fromEntries(SET_PET_GARMENTS.map((g) => [g, irr(`g.${g}`)]));
    const zonePricesIrr = Object.fromEntries(SET_PET_ZONE_KEYS.map((z) => [z, irr(`z.${z}`)]));
    if ([...Object.values(garmentPricesIrr), ...Object.values(zonePricesIrr)].some((v) => Number.isNaN(v))) return setMessage({ tone: "error", text: t("prices.invalid") });
    setBusy(true);
    setMessage(null);
    try {
      const saved = await adminSetPetService.saveSettings({
        garmentPricesIrr, zonePricesIrr,
        setDiscountPercent: Number(form.discount || 0),
        productionWorkingDays: Number(form.days || 5),
        workshopCity: form.city?.trim() || null,
        workshopLatitude: data?.workshopLatitude ?? null,
        workshopLongitude: data?.workshopLongitude ?? null,
      });
      setData(saved);
      fill(saved);
      setMessage({ tone: "ok", text: t("prices.saved") });
    } catch (e) {
      setMessage({ tone: "error", text: apiErrorText(e, locale, t("actionFailed")) });
    } finally {
      setBusy(false);
    }
  }

  if (error === "forbidden") return <EmptyState title={t("forbidden")} description="commerce.view" />;
  if (error === "load") return <ErrorRecovery title={t("loadFailed")} message="" retryLabel={t("retry")} onRetry={() => void load()} />;
  if (!data) return <Skeleton className="h-64 w-full" aria-label={t("loading")} />;
  const field = (key: string, label: string) => (
    <Input key={key} label={label} inputMode="numeric" value={form[key] ?? ""} disabled={!canManage} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
  );

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Link className="text-metadata underline" href={`/${locale}/admin/commerce/set-pet`}>{t("back")}</Link>
      <header className="flex flex-col gap-1">
        <h1 className="text-page-title text-text-primary">{t("prices.title")}</h1>
        <p className="text-metadata text-text-secondary">{t("prices.intro")}</p>
        {data.updatedAt ? <p className="text-metadata text-text-secondary">{t("prices.updated", { date: dateTime(data.updatedAt) })}</p> : null}
      </header>
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <Section title={t("prices.garments")}>
          <h3 className="text-body font-medium">{t("prices.forPeople")}</h3>
          <div className="grid gap-3 sm:grid-cols-3">{SET_PET_GARMENTS.filter((g) => g.startsWith("HUMAN_")).map((g) => field(`g.${g}`, t("prices.toman", { name: tg(g) })))}</div>
          <h3 className="text-body font-medium">{t("prices.forPets")}</h3>
          <div className="grid gap-3 sm:grid-cols-3">{SET_PET_GARMENTS.filter((g) => g.startsWith("PET_")).map((g) => field(`g.${g}`, t("prices.toman", { name: tg(g) })))}</div>
        </Section>
        <Section title={t("prices.zones")}>
          <p className="text-metadata text-text-secondary">{t("prices.zonesHint")}</p>
          <div className="grid gap-3 sm:grid-cols-3">{SET_PET_ZONE_KEYS.map((z) => field(`z.${z}`, t("prices.toman", { name: t(`zone.${z}`) })))}</div>
        </Section>
        <Section title={t("prices.other")}>
          <div className="grid gap-3 sm:grid-cols-3">
            {field("discount", t("prices.discount"))}
            {field("days", t("prices.days"))}
            <Input label={t("prices.city")} value={form.city ?? ""} disabled={!canManage} maxLength={80} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
          </div>
          <p className="text-metadata text-text-secondary">{t("prices.cityHint")}</p>
        </Section>
        {message ? <p role={message.tone === "error" ? "alert" : "status"} className={`text-metadata ${message.tone === "error" ? "text-state-urgent" : "text-text-secondary"}`}>{message.text}</p> : null}
        {canManage ? <Button type="submit" isLoading={busy}>{t("prices.save")}</Button> : null}
      </form>
    </div>
  );
}
