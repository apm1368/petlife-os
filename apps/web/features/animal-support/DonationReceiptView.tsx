"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { EmptyState, ErrorRecovery, Skeleton, StatusLabel } from "@petlife/ui";
import { ApiError } from "@/lib/api/client";
import { formatCurrency } from "@/lib/currency/format-currency";
import { formatDay } from "@/lib/date/jalali";
import { animalSupportService, type DonationReceiptDto } from "@/services/animal-support.service";

/** DONATION PATTERN — the donor's private receipt. Nobody else can open it. */
export function DonationReceiptView({ donationIntentId }: { donationIntentId: string }) {
  const lang = useLocale() as "fa" | "en";
  const fa = lang === "fa";
  const [r, setR] = useState<DonationReceiptDto | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "notFound" | "error">("loading");
  useEffect(() => {
    animalSupportService.getReceipt(donationIntentId).then((x) => { setR(x); setState("ready"); }).catch((e) => setState(e instanceof ApiError && e.status === 404 ? "notFound" : "error"));
  }, [donationIntentId]);
  if (state === "loading") return <Skeleton className="h-48 w-full" />;
  if (state === "notFound") return <EmptyState title={fa ? "این رسید پیدا نشد" : "Receipt not found"} />;
  if (state === "error" || !r) return <ErrorRecovery title={fa ? "بارگیری نشد" : "Could not load"} message="" retryLabel={fa ? "تلاش دوباره" : "Try again"} onRetry={() => location.reload()} />;
  const statusLabel: Record<string, [string, string]> = { SUCCEEDED: ["دریافت شد", "Received"], FAILED: ["ناموفق", "Failed"], PENDING: ["در انتظار", "Pending"], REFUNDED: ["بازپرداخت شد", "Refunded"] };
  const row = (label: string, value: React.ReactNode) => <div className="flex justify-between gap-3 border-b border-border-subtle py-2 text-sm"><dt className="text-text-secondary">{label}</dt><dd className="text-end">{value}</dd></div>;
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Link href={`/${lang}/donations`} className="text-metadata text-text-secondary hover:underline">{fa ? "کمک‌های مالی من" : "My donations"}</Link>
      <h1 className="text-page-title">{fa ? "رسید کمک مالی" : "Donation receipt"}</h1>
      <StatusLabel tone={r.status === "SUCCEEDED" ? "success" : r.status === "FAILED" ? "higherConcern" : "neutral"}>{(statusLabel[r.status] ?? [r.status, r.status])[fa ? 0 : 1]}</StatusLabel>
      <dl>
        {row(fa ? "شماره" : "Reference", <span dir="ltr" className="font-mono">{r.reference}</span>)}
        {row(fa ? "مبلغ" : "Amount", <span className="tabular-nums">{formatCurrency(r.amountIrr, lang)}</span>)}
        {row(fa ? "سازمان" : "Organization", r.organization.name)}
        {row(fa ? "کارزار" : "Campaign", <Link className="underline" href={`/${lang}/animal-support/campaigns/${r.campaign.id}`}>{r.campaign.title}</Link>)}
        {r.supportNeed ? row(fa ? "برای" : "For", <Link className="underline" href={`/${lang}/animal-support/needs/${r.supportNeed.id}`}>{r.supportNeed.title}</Link>) : null}
        {row(fa ? "نوع" : "Type", r.fundType === "RESTRICTED" ? (fa ? "محدود به هدف کارزار" : "Restricted to the campaign's purpose") : fa ? "عمومی" : "General")}
        {row(fa ? "تاریخ" : "Date", formatDay((r.succeededAt ?? r.createdAt).slice(0, 10), lang))}
        {row(fa ? "نمایش عمومی" : "Shown publicly as", r.showDonorPublicly ? r.publicDisplayName : fa ? "ناشناس" : "Anonymous")}
        {r.refundedAt ? row(fa ? "بازپرداخت" : "Refunded", formatDay(r.refundedAt.slice(0, 10), lang)) : null}
      </dl>
      <p className="text-metadata text-text-secondary">{fa ? "این رسید فقط برای شما قابل مشاهده است." : "Only you can see this receipt."}</p>
    </div>
  );
}
