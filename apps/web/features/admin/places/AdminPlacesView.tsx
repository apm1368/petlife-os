"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { Button, EmptyState, ErrorRecovery, Input, Skeleton } from "@petlife/ui";
import type { PetFriendlyPlaceDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { formatDay } from "@/lib/date/jalali";
import { adminPlacesService, placesService } from "@/services/places.service";
import { EmptyRow, Panel, PanelTitle, TableWrap, Tag, Td, Th } from "../console-ui";

const REASON: Record<string, [string, string]> = { CLOSED_PERMANENTLY: ["بسته شده", "Closed"], NOT_PET_FRIENDLY: ["دیگر حیوان نمی‌پذیرد", "No longer pet-friendly"], WRONG_LOCATION: ["مکان نادرست", "Wrong location"], WRONG_DETAILS: ["اطلاعات نادرست", "Wrong details"], OTHER: ["سایر", "Other"] };

/** MAP/PLACES admin: user reports queue first, then the directory with verification and listing toggles (both audited). */
export function AdminPlacesView() {
  const lang = useLocale() as "fa" | "en";
  const fa = lang === "fa";
  const [reports, setReports] = useState<Awaited<ReturnType<typeof placesService.adminReports>> | null>(null);
  const [places, setPlaces] = useState<PetFriendlyPlaceDto[] | null>(null);
  const [city, setCity] = useState("");
  const [error, setError] = useState<"forbidden" | "error" | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [r, p] = await Promise.all([placesService.adminReports(), adminPlacesService.list({ city: city.trim() || undefined })]);
      setReports(r);
      setPlaces(p.items);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? "forbidden" : "error");
    }
  }, [city]);
  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    setMsg(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setMsg(e instanceof ApiError && e.status === 403 ? (fa ? "دسترسی places.manage لازم است." : "places.manage permission required.") : fa ? "انجام نشد." : "Failed.");
    }
  };

  if (error === "forbidden") return <EmptyState title={fa ? "دسترسی places.view لازم است" : "places.view permission required"} />;
  if (error) return <ErrorRecovery title={fa ? "بارگیری نشد" : "Could not load"} message="" retryLabel={fa ? "تلاش دوباره" : "Retry"} onRetry={load} />;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-page-title">{fa ? "مکان‌های دوستدار حیوانات" : "Pet-friendly places"}</h1>
      {msg ? <p role="alert" className="text-sm text-state-urgent">{msg}</p> : null}
      <Panel>
        <PanelTitle title={fa ? "گزارش‌های کاربران" : "User reports"} hint={fa ? "گزارش‌های باز؛ هر اقدام در گزارش رویدادها ثبت می‌شود." : "Open reports; every action is audited."} />
        {!reports ? <Skeleton className="h-24" /> : reports.length === 0 ? <p className="text-sm text-text-secondary">{fa ? "گزارش بازی نیست." : "No open reports."}</p> : (
          <ul className="flex flex-col gap-2">{reports.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 rounded-md border border-border-subtle p-3 text-sm">
              <p><span className="font-bold">{r.place.name}</span> · {r.place.city} · <Tag tone="attention">{REASON[r.reason]?.[fa ? 0 : 1] ?? r.reason}</Tag> · {formatDay(r.createdAt.slice(0, 10), lang)}</p>
              {r.details ? <p>{r.details}</p> : null}
              <div className="flex flex-wrap items-end gap-2">
                <Input label={fa ? "یادداشت (اختیاری)" : "Note (optional)"} value={notes[r.id] ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
                <Button size="sm" onClick={() => void act(() => placesService.adminResolveReport(r.id, "RESOLVED", notes[r.id]?.trim() || undefined))}>{fa ? "رسیدگی شد" : "Resolved"}</Button>
                <Button size="sm" variant="ghost" onClick={() => void act(() => placesService.adminResolveReport(r.id, "DISMISSED", notes[r.id]?.trim() || undefined))}>{fa ? "رد گزارش" : "Dismiss"}</Button>
                <Button size="sm" variant="danger" onClick={() => void act(() => adminPlacesService.setListed(r.place.id, false))}>{fa ? "حذف از فهرست عمومی" : "Unlist place"}</Button>
              </div>
            </li>
          ))}</ul>
        )}
      </Panel>
      <Panel>
        <PanelTitle title={fa ? "فهرست مکان‌ها" : "Directory"} action={<Input label={fa ? "شهر" : "City"} value={city} onChange={(e) => setCity(e.target.value)} />} />
        {!places ? <Skeleton className="h-40" /> : (
          <TableWrap>
            <table className="w-full">
              <thead><tr><Th>{fa ? "نام" : "Name"}</Th><Th>{fa ? "شهر" : "City"}</Th><Th>{fa ? "وضعیت" : "Status"}</Th><Th>{fa ? "عمومی" : "Public"}</Th><Th>{fa ? "اقدام" : "Actions"}</Th></tr></thead>
              <tbody>{places.length === 0 ? <EmptyRow colSpan={5} label={fa ? "مکانی نیست" : "No places"} /> : places.map((p) => (
                <tr key={p.id}>
                  <Td>{p.name}</Td><Td>{p.city}</Td>
                  <Td><Tag tone={p.status === "VERIFIED" ? "success" : p.status === "SUSPENDED" ? "urgent" : "neutral"}>{p.status}</Tag></Td>
                  <Td>{p.isPubliclyListed ? "✓" : "—"}</Td>
                  <Td><div className="flex flex-wrap gap-1">
                    {p.status !== "VERIFIED" ? <Button size="sm" variant="ghost" onClick={() => void act(() => adminPlacesService.setVerification(p.id, "VERIFIED"))}>{fa ? "تأیید" : "Verify"}</Button> : null}
                    {p.status !== "SUSPENDED" ? <Button size="sm" variant="ghost" onClick={() => void act(() => adminPlacesService.setVerification(p.id, "SUSPENDED"))}>{fa ? "تعلیق" : "Suspend"}</Button> : null}
                    <Button size="sm" variant="ghost" onClick={() => void act(() => adminPlacesService.setListed(p.id, !p.isPubliclyListed))}>{p.isPubliclyListed ? (fa ? "خروج از فهرست" : "Unlist") : fa ? "نمایش عمومی" : "List"}</Button>
                  </div></Td>
                </tr>
              ))}</tbody>
            </table>
          </TableWrap>
        )}
      </Panel>
    </div>
  );
}
