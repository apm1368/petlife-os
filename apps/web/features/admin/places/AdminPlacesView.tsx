"use client";

import { useCallback, useEffect, useState } from "react";
import { DemoRecordTag } from "../DemoRecordTag";
import { useLocale } from "next-intl";
import { Button, EmptyState, ErrorRecovery, Input, Skeleton } from "@petlife/ui";
import type { PetFriendlyPlaceDto } from "@petlife/types";
import { ApiError } from "@/lib/api/client";
import { formatDay } from "@/lib/date/jalali";
import { adminPlacesService, placesService } from "@/services/places.service";
import { useAdminStore } from "@/stores/admin-store";
import { EmptyRow, Panel, PanelTitle, TableWrap, Tag, Td, Th } from "../console-ui";
import { copyFor } from "@/features/admin/admin-copy";

const REASON: Record<string, [string, string]> = { CLOSED_PERMANENTLY: ["بسته شده", "Closed"], NOT_PET_FRIENDLY: ["دیگر حیوان نمی‌پذیرد", "No longer pet-friendly"], WRONG_LOCATION: ["مکان نادرست", "Wrong location"], WRONG_DETAILS: ["اطلاعات نادرست", "Wrong details"], CLAIMED_BY_SOMEONE_ELSE: ["ادعای مالکیت نادرست (تحویل از درخواست‌های مالکیت)", "Wrong business claim (release it under Business claims)"], OTHER: ["سایر", "Other"] };

/** MAP/PLACES admin: user reports queue first, then the directory with verification and listing toggles (both audited). */
export function AdminPlacesView() {
  const lang = useLocale() as "fa" | "en" | "de" | "es" | "ar" | "nl";
  const { tr } = copyFor(lang);
  const context = useAdminStore((state) => state.context);
  const adminStatus = useAdminStore((state) => state.status);
  const canRead = adminStatus === "ready" && context?.isAdmin === true && context.permissions.includes("places.view");
  const canManage = canRead && context?.permissions.includes("places.manage") === true;
  const [reports, setReports] = useState<Awaited<ReturnType<typeof placesService.adminReports>> | null>(null);
  const [places, setPlaces] = useState<PetFriendlyPlaceDto[] | null>(null);
  const [city, setCity] = useState("");
  const [error, setError] = useState<"forbidden" | "error" | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [editingPlaceId, setEditingPlaceId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [savingPlaceId, setSavingPlaceId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!canRead) return;
    setError(null);
    try {
      const [r, p] = await Promise.all([placesService.adminReports(), adminPlacesService.list({ city: city.trim() || undefined })]);
      setReports(r);
      setPlaces(p.items);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 403 ? "forbidden" : "error");
    }
  }, [canRead, city]);
  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    const current = useAdminStore.getState();
    if (current.status !== "ready" || current.context?.isAdmin !== true || !current.context.permissions.includes("places.view") || !current.context.permissions.includes("places.manage")) return false;
    setMsg(null);
    try {
      await fn();
      await load();
      return true;
    } catch (e) {
      setMsg(e instanceof ApiError && e.status === 403 ? (tr("دسترسی places.manage لازم است.", "places.manage permission required.")) : tr("انجام نشد؛ اطلاعات واردشده محفوظ است.", "Failed; your changes are still here."));
      return false;
    }
  };

  const beginRename = (place: PetFriendlyPlaceDto) => {
    if (!canManage) return;
    setEditingPlaceId(place.id);
    setNameDraft(place.name);
    setMsg(null);
  };

  const saveName = async (placeId: string) => {
    const name = nameDraft.trim();
    if (!name || name.length > 200) {
      setMsg(tr("نام مکان باید بین ۱ تا ۲۰۰ نویسه باشد.", "Place name must be between 1 and 200 characters."));
      return;
    }
    setSavingPlaceId(placeId);
    const saved = await act(() => adminPlacesService.update(placeId, { name }));
    setSavingPlaceId(null);
    if (saved) {
      setEditingPlaceId(null);
      setNameDraft("");
    }
  };

  if (adminStatus === "idle" || adminStatus === "loading") return <Skeleton className="h-64" />;
  if (!canRead) return <EmptyState title={tr("دسترسی places.view لازم است", "places.view permission required")} />;
  if (error === "forbidden") return <EmptyState title={tr("دسترسی places.view لازم است", "places.view permission required")} />;
  if (error) return <ErrorRecovery title={tr("بارگیری نشد", "Could not load")} message="" retryLabel={tr("تلاش دوباره", "Retry")} onRetry={load} />;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-page-title">{tr("مکان‌های دوستدار حیوانات", "Pet-friendly places")}</h1>
      {msg ? <p role="alert" className="text-sm text-state-urgent">{msg}</p> : null}
      <Panel>
        <PanelTitle title={tr("گزارش‌های کاربران", "User reports")} hint={tr("گزارش‌های باز؛ هر اقدام در گزارش رویدادها ثبت می‌شود.", "Open reports; every action is audited.")} />
        {!reports ? <Skeleton className="h-24" /> : reports.length === 0 ? <p className="text-sm text-text-secondary">{tr("گزارش بازی نیست.", "No open reports.")}</p> : (
          <ul className="flex flex-col gap-2">{reports.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 rounded-md border border-border-subtle p-3 text-sm">
              <p><span className="font-bold">{r.place.name}</span> · {r.place.city} · <Tag tone="attention">{REASON[r.reason] ? tr(...REASON[r.reason]!) : r.reason}</Tag> · {formatDay(r.createdAt.slice(0, 10), lang)}</p>
              {r.details ? <p>{r.details}</p> : null}
              {canManage ? <div className="flex flex-wrap items-end gap-2">
                <Input label={tr("یادداشت (اختیاری)", "Note (optional)")} value={notes[r.id] ?? ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} />
                <Button size="sm" onClick={() => void act(() => placesService.adminResolveReport(r.id, "RESOLVED", notes[r.id]?.trim() || undefined))}>{tr("رسیدگی شد", "Resolved")}</Button>
                <Button size="sm" variant="ghost" onClick={() => void act(() => placesService.adminResolveReport(r.id, "DISMISSED", notes[r.id]?.trim() || undefined))}>{tr("رد گزارش", "Dismiss")}</Button>
                <Button size="sm" variant="danger" onClick={() => void act(() => adminPlacesService.setListed(r.place.id, false))}>{tr("حذف از فهرست عمومی", "Unlist place")}</Button>
              </div> : null}
            </li>
          ))}</ul>
        )}
      </Panel>
      <Panel>
        <PanelTitle title={tr("فهرست مکان‌ها", "Directory")} action={<Input label={tr("شهر", "City")} value={city} onChange={(e) => setCity(e.target.value)} />} />
        {!places ? <Skeleton className="h-40" /> : (
          <TableWrap>
            <table className="w-full">
              <thead><tr><Th>{tr("نام", "Name")}</Th><Th>{tr("شهر", "City")}</Th><Th>{tr("وضعیت", "Status")}</Th><Th>{tr("عمومی", "Public")}</Th><Th>{tr("اقدام", "Actions")}</Th></tr></thead>
              <tbody>{places.length === 0 ? <EmptyRow colSpan={5} label={tr("مکانی نیست", "No places")} /> : places.map((p) => (
                <tr key={p.id}>
                  <Td>{editingPlaceId === p.id ? <Input label={tr("نام مکان", "Place name")} value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} /> : <>{p.name}<DemoRecordTag isDemoRecord={p.isDemoRecord} /></>}</Td><Td>{p.city}</Td>
                  <Td><Tag tone={p.status === "VERIFIED" ? "success" : p.status === "SUSPENDED" ? "urgent" : "neutral"}>{p.status}</Tag>{p.source === "OSM" ? <> <Tag tone="brand">OSM</Tag></> : null}</Td>
                  <Td>{p.isPubliclyListed ? "✓" : "—"}</Td>
                  <Td>{canManage ? <div className="flex flex-wrap gap-1">
                    {editingPlaceId === p.id ? <>
                      <Button size="sm" disabled={savingPlaceId === p.id} onClick={() => void saveName(p.id)}>{tr("ذخیرهٔ نام", "Save name")}</Button>
                      <Button size="sm" variant="ghost" disabled={savingPlaceId === p.id} onClick={() => { setEditingPlaceId(null); setNameDraft(""); setMsg(null); }}>{tr("انصراف", "Cancel")}</Button>
                    </> : <Button size="sm" variant="ghost" onClick={() => beginRename(p)}>{tr("ویرایش نام", "Edit name")}</Button>}
                    {/* An OpenStreetMap import is verified only through a business claim (claims tab). */}
                    {p.status !== "VERIFIED" && !(p.source === "OSM" && !p.claimed) ? <Button size="sm" variant="ghost" onClick={() => void act(() => adminPlacesService.setVerification(p.id, "VERIFIED"))}>{tr("تأیید", "Verify")}</Button> : null}
                    {p.status !== "SUSPENDED" ? <Button size="sm" variant="ghost" onClick={() => void act(() => adminPlacesService.setVerification(p.id, "SUSPENDED"))}>{tr("تعلیق", "Suspend")}</Button> : null}
                    <Button size="sm" variant="ghost" onClick={() => void act(() => adminPlacesService.setListed(p.id, !p.isPubliclyListed))}>{p.isPubliclyListed ? (tr("خروج از فهرست", "Unlist")) : tr("نمایش عمومی", "List")}</Button>
                  </div> : <span className="text-sm text-text-secondary">—</span>}</Td>
                </tr>
              ))}</tbody>
            </table>
          </TableWrap>
        )}
      </Panel>
    </div>
  );
}
