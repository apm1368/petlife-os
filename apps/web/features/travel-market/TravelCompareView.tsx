"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { EmptyState, Skeleton, StatusLabel } from "@petlife/ui";
import type { TravelSearchResultItemDto } from "@petlife/types";
import { localizeDigits } from "@/lib/date/jalali";
import { travelMarketService } from "@/services/travel-marketplace.service";
import { listingTypeLabel, MATCH_LABEL, matchTone, money, ratingText } from "./labels";

/** Side-by-side on desktop, stacked cards on phones; the same facts, never recomputed client-side. */
export function TravelCompareView() {
  const lang = useLocale() as "fa" | "en";
  const fa = lang === "fa";
  const params = useSearchParams();
  const ids = (params.get("ids") ?? "").split(",").filter(Boolean).slice(0, 3);
  const checkIn = params.get("checkIn") ?? undefined;
  const checkOut = params.get("checkOut") ?? undefined;
  const [items, setItems] = useState<TravelSearchResultItemDto[] | null>(null);
  useEffect(() => {
    if (ids.length < 2) return setItems([]);
    travelMarketService.compare(ids, checkIn, checkOut).then(setItems).catch(() => setItems([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.toString()]);
  const NS = fa ? "اعلام نشده" : "Not specified";
  const rows: { label: string; value: (i: TravelSearchResultItemDto) => React.ReactNode }[] = [
    { label: fa ? "نوع" : "Type", value: (i) => listingTypeLabel(i.type, lang) },
    { label: fa ? "شهر" : "City", value: (i) => i.city },
    { label: fa ? "امتیاز" : "Rating", value: (i) => ratingText(i.rating.average, i.rating.count, lang) },
    { label: fa ? "قیمت کل اقامت" : "Stay total", value: (i) => (i.stay ? money(i.stay.totalIrr, lang) : i.fromNightlyIrr !== null ? (fa ? `از ${money(i.fromNightlyIrr, lang)} / شب` : `from ${money(i.fromNightlyIrr, lang)} / night`) : "—") },
    { label: fa ? "سگ" : "Dogs", value: (i) => (!i.petPolicySummary.stated ? NS : i.petPolicySummary.dogsAllowed ? "✓" : "✗") },
    { label: fa ? "گربه" : "Cats", value: (i) => (!i.petPolicySummary.stated ? NS : i.petPolicySummary.catsAllowed ? "✓" : "✗") },
    { label: fa ? "حداکثر وزن" : "Max weight", value: (i) => (i.petPolicySummary.maxWeightKg === null ? NS : fa ? `${localizeDigits(i.petPolicySummary.maxWeightKg, "fa")} کیلو` : `${i.petPolicySummary.maxWeightKg} kg`) },
    { label: fa ? "هزینهٔ حیوان" : "Pet fee", value: (i) => (i.petPolicySummary.petFeeIrr === null ? NS : i.petPolicySummary.petFeeIrr === 0 ? (fa ? "رایگان" : "Free") : money(i.petPolicySummary.petFeeIrr, lang)) },
    { label: fa ? "لغو رایگان" : "Free cancellation", value: (i) => (i.freeCancellationAvailable ? "✓" : "✗") },
    { label: fa ? "نوع رزرو" : "Booking", value: (i) => (i.bookingMode === "REQUEST_TO_BOOK" ? (fa ? "با تأیید اقامتگاه" : "Request") : fa ? "فوری" : "Instant") },
    { label: fa ? "تطابق با حیوان" : "Pet match", value: (i) => (i.petMatch ? <StatusLabel tone={matchTone(i.petMatch)}>{MATCH_LABEL[i.petMatch][fa ? 0 : 1]}</StatusLabel> : "—") },
  ];
  const href = (id: string) => `/${lang}/travel/stays/${id}${checkIn && checkOut ? `?checkIn=${checkIn}&checkOut=${checkOut}` : ""}`;
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6">
      <h1 className="text-page-title text-text-primary">{fa ? "مقایسهٔ اقامتگاه‌ها" : "Compare stays"}</h1>
      {items === null ? <Skeleton className="h-80" /> : items.length < 2 ? <EmptyState title={fa ? "حداقل دو اقامتگاه برای مقایسه لازم است" : "Pick at least two stays to compare"} /> : (
        <>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">{fa ? "مقایسه" : "Comparison"}</caption>
              <thead><tr><th scope="col" className="w-40" />{items.map((i) => <th key={i.id} scope="col" className="p-2 text-start align-bottom"><Link href={href(i.id)} className="font-bold hover:underline">{i.title}</Link></th>)}</tr></thead>
              <tbody>{rows.map((r) => <tr key={r.label} className="border-t border-border-subtle"><th scope="row" className="p-2 text-start font-normal text-text-secondary">{r.label}</th>{items.map((i) => <td key={i.id} className="p-2">{r.value(i)}</td>)}</tr>)}</tbody>
            </table>
          </div>
          <ul className="flex flex-col gap-4 md:hidden">
            {items.map((i) => (
              <li key={i.id} className="rounded-lg border border-border-subtle p-4">
                <Link href={href(i.id)} className="font-bold hover:underline">{i.title}</Link>
                <dl className="mt-2 flex flex-col gap-1 text-sm">{rows.map((r) => <div key={r.label} className="flex justify-between gap-3"><dt className="text-text-secondary">{r.label}</dt><dd className="text-end">{r.value(i)}</dd></div>)}</dl>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
