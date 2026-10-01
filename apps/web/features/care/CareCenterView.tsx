"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { Button, ContextSurface, EmptyState, Skeleton } from "@petlife/ui";
import { careRemindersService, type CareReminder, type ReminderInput } from "@/services/care-reminders.service";
import { petsService } from "@/services/pets.service";
import { CareProfileView } from "./CareProfileView";
import { CARE_KINDS, careTitle } from "./care-labels";
import { LoadFailure } from "@/features/system/LoadFailure";

const kinds = CARE_KINDS;
const repeat: Record<string, [string, string]> = { ONCE:["یک‌بار","Once"], DAILY:["روزانه","Daily"], WEEKLY:["هفتگی","Weekly"], MONTHLY:["ماهانه","Monthly"], YEARLY:["سالانه","Yearly"], CUSTOM:["فاصله دلخواه (روز)","Custom interval (days)"] };
const states: Record<string, [string,string]> = { DUE:["به‌زودی","Due soon"], OVERDUE:["عقب‌افتاده","Overdue"], UPCOMING:["آینده","Upcoming"], COMPLETED:["انجام‌شده","Completed"], SNOOZED:["یادآوری به تعویق افتاده","Snoozed"], CANCELLED:["لغوشده","Cancelled"], CUSTOM:["شخصی","Custom"] };
const sources: Record<string,[string,string]> = { USER_CREATED:["صاحب حیوان","Owner"], PROVIDER_CREATED:["ارائه‌دهنده","Provider"], MEDICAL_RECORD_DERIVED:["پرونده پزشکی","Medical record"], BOOKING_DERIVED:["رزرو","Booking"], SYSTEM_SCHEDULED:["سیستم","System"] };
export function CareCenterView({ petId, itemId }: { petId: string; itemId?: string }) {
  const locale = useLocale(); const fa = locale === "fa"; const ix = fa ? 0 : 1;
  const [items, setItems] = useState<CareReminder[] | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [petName, setPetName] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filter, setFilter] = useState("DUE");
  const [form, setForm] = useState<CareReminder | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [at, setAt] = useState("");
  const load = useCallback(async () => {
    setError(null);
    try { const [data, access, pet] = await Promise.all([itemId ? careRemindersService.get(petId, itemId).then(item => [item]) : careRemindersService.list(petId), petsService.getMyAccess(petId), petsService.getById(petId)]); setItems(data); setCanEdit(access.canEditCareProfile); setPetName(pet.name); }
    catch (e) { setError(e); }
  }, [petId, itemId]);
  useEffect(() => { void load(); }, [load]);
  const run = async (id: string, action: string, date?: string) => { setBusy(true); setActionError(null); try { await careRemindersService.act(petId, id, action, date); await load(); } catch { setActionError(fa ? "انجام نشد. دوباره تلاش کنید." : "That didn't work. Please try again."); } finally { setBusy(false); } };
  const format = (date: string) => new Intl.DateTimeFormat(fa ? "fa-IR-u-ca-persian" : "en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Tehran" }).format(new Date(date));
  if(error) return <LoadFailure error={error} onRetry={load}/>;
  if(!items) return <Skeleton className="h-64 w-full" aria-label={fa ? "در حال بارگذاری" : "Loading"}/>;
  const visible = itemId ? items : items.filter(item => filter === "CUSTOM" ? item.type === "CUSTOM" : item.state === filter);
  return <div className="flex flex-col gap-6">
    <header className="section-head"><div><h1>{fa ? "مرکز مراقبت" : "Care center"}</h1><p>{fa ? "یادآورها و پیگیری‌ها؛ زمان‌ها به وقت تهران" : "Reminders and follow-ups; times shown in Tehran time"}</p></div><div className="flex flex-wrap items-center gap-2"><Link className="btn-quiet" href={`/${locale}/pets/${petId}/care/calendar`}>{fa ? "تقویم" : "Calendar"}</Link><Link className="btn-quiet" href={`/${locale}/pets/${petId}?view=travel`}>{fa ? "آمادگی سفر" : "Travel readiness"}</Link>{canEdit ? <Button onClick={() => setForm("new")}>{fa ? "یادآور جدید" : "Create reminder"}</Button> : null}</div></header>
    {itemId ? <Link href={`/${locale}/pets/${petId}/care`}>{fa ? "بازگشت به مراقبت‌ها" : "Back to care"}</Link> : <nav aria-label={fa ? "فیلتر مراقبت" : "Care filters"} className="flex flex-wrap gap-2">{Object.entries(states).map(([key, label]) => <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)} className="rounded-full border border-border-subtle px-4 py-2 text-sm aria-pressed:bg-brand-natural aria-pressed:text-white">{label[ix]}</button>)}</nav>}
    {actionError ? <p role="alert" className="text-state-urgent">{actionError}</p> : null}
    {form ? <ReminderForm petId={petId} initial={form === "new" ? undefined : form} onClose={() => setForm(null)} onSaved={async () => { setForm(null); await load(); }} /> : null}
    {!visible.length ? <EmptyState title={emptyCopy(filter, fa).title} description={emptyCopy(filter, fa).body} actionLabel={canEdit && !itemId ? (fa ? "یادآور جدید" : "Create reminder") : undefined} onAction={canEdit && !itemId ? () => setForm("new") : undefined}/> : visible.map(item => <ContextSurface key={item.id} className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-between gap-3"><Link className="text-section-title text-text-primary" href={`/${locale}/pets/${petId}/care/${item.id}`}>{careTitle(item, locale)}</Link><span>{states[item.state]?.[ix] ?? item.state}</span></div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2"><Meta label={fa ? "حیوان" : "Pet"} value={petName}/><Meta label={fa ? "نوع" : "Type"} value={kinds[item.type]?.[ix] ?? item.type}/><Meta label={fa ? "زمان" : "Due"} value={format(item.dueAt)}/><Meta label={fa ? "منبع" : "Source"} value={sources[item.source]?.[ix] ?? item.source}/><Meta label={fa ? "تکرار" : "Recurrence"} value={`${repeat[item.recurrence]?.[ix] ?? item.recurrence}${item.intervalDays ? ` · ${item.intervalDays}` : ""}`}/>{item.dueAt !== item.originalDueAt ? <Meta label={fa ? "زمان اصلی" : "Original due date"} value={format(item.originalDueAt)}/> : null}{item.snoozedUntil ? <Meta label={fa ? "یادآوری در" : "Remind at"} value={format(item.snoozedUntil)}/> : null}{item.completedAt ? <Meta label={fa ? "انجام شده در" : "Completed at"} value={format(item.completedAt)}/> : null}{!["COMPLETED","CANCELLED"].includes(item.state) ? <Meta label={fa ? "اعلان" : "Notification"} value={item.notifiedAt ? `${fa ? "ارسال شد" : "Sent"} · ${format(item.notifiedAt)}` : (fa ? "هنوز ارسال نشده" : "Not sent yet")}/> : null}</dl>
      {related(item) ? <Link className="text-sm text-brand-natural" href={`/${locale}/pets/${petId}/${related(item)}`}>{fa ? "مشاهده سابقه مرتبط" : "View related record"}</Link> : null}
      {canEdit && !["COMPLETED","CANCELLED"].includes(item.state) ? <div className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => void run(item.id,"COMPLETE")}>{fa ? "انجام شد" : "Complete"}</Button>{item.source === "USER_CREATED" ? <Button variant="secondary" disabled={busy} onClick={() => setForm(item)}>{fa ? "ویرایش" : "Edit"}</Button> : null}<Button variant="secondary" disabled={busy} onClick={() => void run(item.id,"SNOOZE",laterToday())}>{fa ? "بعداً امروز" : "Later today"}</Button><Button variant="secondary" disabled={busy} onClick={() => void run(item.id,"SNOOZE",tomorrowMorning())}>{fa ? "فردا" : "Tomorrow"}</Button><Button variant="ghost" disabled={busy} onClick={() => void run(item.id,"CANCEL")}>{fa ? "لغو" : "Cancel"}</Button></div> : null}
      {itemId && canEdit && !["COMPLETED","CANCELLED"].includes(item.state) ? <div className="flex flex-wrap items-end gap-3"><label className="text-sm">{fa ? "زمان دلخواه (منطقه زمانی دستگاه)" : "Custom time (device timezone)"}<input className="mt-1 block rounded border p-2 text-text-primary" type="datetime-local" value={at} onChange={e => setAt(e.target.value)}/></label>{["SNOOZE","RESCHEDULE"].map(action => <Button key={action} variant="secondary" disabled={busy || !at} onClick={() => void run(item.id,action,new Date(at).toISOString())}>{action === "SNOOZE" ? (fa ? "تعویق اعلان" : "Snooze") : (fa ? "تغییر زمان یادآوری" : "Reschedule")}</Button>)}</div> : null}
    </ContextSurface>)}
    {!itemId ? <details className="border-t border-border-subtle pt-5"><summary className="cursor-pointer text-section-title">{fa ? "دستورالعمل مراقبت روزمره" : "Daily care instructions"}</summary><div className="mt-5"><CareProfileView petId={petId}/></div></details> : null}
  </div>;
}
/** Empty state per filter: what is empty, why, and (for editors) the next step via the action button. */
function emptyCopy(filter: string, fa: boolean): { title: string; body: string } {
  const why = fa ? "یادآورها از واکسن‌ها، داروها و نوبت‌ها ساخته می‌شوند؛ یادآور شخصی هم می‌توانید بسازید." : "Reminders come from vaccines, medications and bookings — you can also add your own.";
  const t: Record<string, [string, string]> = { DUE: ["یادآور نزدیکی ندارید", "Nothing is due soon"], OVERDUE: ["هیچ مراقبتی عقب نیفتاده است", "Nothing is overdue"], UPCOMING: ["یادآور آینده‌ای ثبت نشده", "No upcoming reminders"], COMPLETED: ["هنوز مراقبتی انجام‌شده ثبت نشده", "No completed care yet"], SNOOZED: ["یادآور به تعویق افتاده‌ای ندارید", "No snoozed reminders"], CANCELLED: ["یادآور لغوشده‌ای ندارید", "No cancelled reminders"], CUSTOM: ["یادآور شخصی ندارید", "No personal reminders"] };
  return { title: (t[filter] ?? t.UPCOMING!)[fa ? 0 : 1], body: why };
}
/** Related record for source-derived care; provider care plans live in the canonical care profile. */
function related(item: CareReminder): string | null {
  if (item.source === "MEDICAL_RECORD_DERIVED" && item.type === "VACCINATION") return "health/vaccination";
  if (item.parentId) return `care/${item.parentId}`;
  return null;
}
/** Three hours from now, capped at 22:00 Tehran time the same day, and never sooner than one hour. */
function laterToday(): string {
  const now = Date.now();
  const tehran = new Date(now + 3.5 * 3600000);
  const tenPm = Date.UTC(tehran.getUTCFullYear(), tehran.getUTCMonth(), tehran.getUTCDate(), 22, 0) - 3.5 * 3600000;
  return new Date(Math.max(now + 3600000, Math.min(now + 3 * 3600000, tenPm))).toISOString();
}
/** 09:00 Tehran time on the next Tehran calendar day (Iran has no DST: UTC+03:30). */
function tomorrowMorning(): string {
  const tehran = new Date(Date.now() + 3.5 * 3600000);
  return new Date(Date.UTC(tehran.getUTCFullYear(), tehran.getUTCMonth(), tehran.getUTCDate() + 1, 9, 0) - 3.5 * 3600000).toISOString();
}
function Meta({label,value}:{label:string;value:string}) { return <div><dt className="text-text-secondary">{label}</dt><dd className="mt-1 text-text-primary">{value}</dd></div>; }
function ReminderForm({petId,initial,onClose,onSaved}:{petId:string;initial?:CareReminder;onClose:()=>void;onSaved:()=>Promise<void>}) {
  const fa = useLocale() === "fa"; const ix = fa ? 0 : 1;
  const localDate = initial ? new Date(new Date(initial.dueAt).getTime()-new Date(initial.dueAt).getTimezoneOffset()*60000).toISOString().slice(0,16) : "";
  const [title,setTitle] = useState(initial?.title ?? ""); const [kind,setKind] = useState(initial?.type ?? "CUSTOM"); const [date,setDate] = useState(localDate); const [recurrence,setRecurrence] = useState(initial?.recurrence ?? "ONCE"); const [interval,setIntervalDays] = useState(initial?.intervalDays ?? 1); const [busy,setBusy] = useState(false); const [error,setError] = useState<string | null>(null);
  async function submit(e: FormEvent) { e.preventDefault(); setBusy(true); setError(null); try { const input: ReminderInput = {title,type:kind,dueAt:new Date(date).toISOString(),recurrence,...(recurrence === "CUSTOM" ? {intervalDays:interval} : {})}; if(initial) await careRemindersService.edit(petId,initial.id,input); else await careRemindersService.create(petId,input); await onSaved(); } catch(e) { setError(e instanceof Error ? e.message : "Unable to save"); } finally { setBusy(false); } }
  return <ContextSurface><form onSubmit={e => void submit(e)} className="grid gap-4 sm:grid-cols-2"><label>{fa ? "عنوان" : "Title"}<input className="mt-1 block w-full rounded border p-2" value={title} maxLength={200} required onChange={e => setTitle(e.target.value)}/></label><label>{fa ? "نوع" : "Type"}<select className="mt-1 block w-full rounded border p-2" value={kind} onChange={e => setKind(e.target.value)}>{Object.entries(kinds).map(([key,label]) => <option key={key} value={key}>{label[ix]}</option>)}</select></label><label>{fa ? "زمان (منطقه زمانی دستگاه)" : "Time (device timezone)"}<input className="mt-1 block w-full rounded border p-2" type="datetime-local" required value={date} onChange={e => setDate(e.target.value)}/></label><label>{fa ? "تکرار با انتخاب شما" : "Recurrence you choose"}<select className="mt-1 block w-full rounded border p-2" value={recurrence} onChange={e => setRecurrence(e.target.value)}>{Object.entries(repeat).map(([key,label]) => <option key={key} value={key}>{label[ix]}</option>)}</select></label>{recurrence === "CUSTOM" ? <label>{fa ? "فاصله به روز" : "Interval in days"}<input className="mt-1 block w-full rounded border p-2" type="number" min={1} max={3650} required value={interval} onChange={e => setIntervalDays(Number(e.target.value))}/></label> : null}<p className="text-sm text-text-secondary sm:col-span-2">{fa ? "تکرار ماهانه و سالانه بر پایه تقویم میلادی است. زمان درمان را از دستور دامپزشک وارد کنید." : "Monthly and yearly recurrence follows Gregorian dates. Enter medical timing from your veterinarian's instructions."}</p>{error ? <p role="alert" className="text-state-urgent sm:col-span-2">{error}</p> : null}<div className="flex gap-3"><Button type="submit" disabled={busy}>{fa ? "ذخیره" : "Save"}</Button><Button type="button" variant="ghost" onClick={onClose}>{fa ? "بستن" : "Close"}</Button></div></form></ContextSurface>;
}
