"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { Button, EmptyState, Skeleton } from "@petlife/ui";
import { careRemindersService, type CareReminder, type ReminderInput } from "@/services/care-reminders.service";
import { petsService } from "@/services/pets.service";
import { CareProfileView } from "./CareProfileView";
import { CARE_KINDS, careTitle } from "./care-labels";
import { LoadFailure } from "@/features/system/LoadFailure";
import { apiErrorText } from "@/lib/errors/api-error-text";
import { formatCount } from "@/lib/number/format-number";
import { DateField } from "@/features/shared/date-picker/DateField";
import { ApiError } from "@/lib/api/client";
import { isPlanError, PlanRequiredNote } from "@/features/subscription/PlanRequiredNote";
import { TimeSelect } from "@/features/shared/date-picker/TimeSelect";

const kinds = CARE_KINDS;
const repeat: Record<string, [string, string]> = { ONCE:["یک‌بار","Once"], DAILY:["روزانه","Daily"], WEEKLY:["هفتگی","Weekly"], MONTHLY:["ماهانه","Monthly"], YEARLY:["سالانه","Yearly"], CUSTOM:["فاصله دلخواه (روز)","Custom interval (days)"] };
const states: Record<string, [string,string]> = { DUE:["به‌زودی","Due soon"], OVERDUE:["عقب‌افتاده","Overdue"], UPCOMING:["آینده","Upcoming"], COMPLETED:["انجام‌شده","Completed"], SNOOZED:["یادآوری به تعویق افتاده","Snoozed"], CANCELLED:["لغوشده","Cancelled"], CUSTOM:["شخصی","Custom"] };
const sources: Record<string,[string,string]> = { USER_CREATED:["صاحب حیوان","Owner"], PROVIDER_CREATED:["ارائه‌دهنده","Provider"], MEDICAL_RECORD_DERIVED:["پرونده پزشکی","Medical record"], BOOKING_DERIVED:["رزرو","Booking"], SYSTEM_SCHEDULED:["سیستم","System"] };
/** The agenda: what needs doing first comes first. Cancelled items are only shown through their filter. */
const AGENDA = ["OVERDUE", "DUE", "SNOOZED", "UPCOMING", "COMPLETED"] as const;
const RECENT_COMPLETED = 5;
const TEHRAN = "+03:30"; // Iran has no DST.

export function CareCenterView({ petId, itemId }: { petId: string; itemId?: string }) {
  const locale = useLocale(); const fa = locale === "fa"; const ix = fa ? 0 : 1;
  const [items, setItems] = useState<CareReminder[] | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [petName, setPetName] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filter, setFilter] = useState("ALL");
  const [form, setForm] = useState<CareReminder | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const [atDay, setAtDay] = useState("");
  const [atTime, setAtTime] = useState("09:00");
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

  const count = (key: string) => key === "ALL" ? items.filter(i => i.state !== "CANCELLED").length : key === "CUSTOM" ? items.filter(i => i.type === "CUSTOM").length : items.filter(i => i.state === key).length;
  const rowProps = { petId, locale, fa, ix, petName, canEdit, busy, format, onRun: run, onEdit: (item: CareReminder) => setForm(item) };

  if (itemId) {
    const item = items[0]!;
    const open = !["COMPLETED","CANCELLED"].includes(item.state);
    return <div className="flex flex-col gap-6">
      <header className="section-head"><div><h1>{careTitle(item, locale)}</h1><p>{petName} · {states[item.state]?.[ix] ?? item.state}</p></div><Link className="btn-quiet" href={`/${locale}/pets/${petId}/care`}>{fa ? "همهٔ مراقبت‌ها" : "All care"}</Link></header>
      {actionError ? <p role="alert" className="text-state-urgent">{actionError}</p> : null}
      {form ? <ReminderForm petId={petId} initial={form === "new" ? undefined : form} onClose={() => setForm(null)} onSaved={async () => { setForm(null); await load(); }} /> : null}
      <div className="split-layout">
        <div className="split-main">
          <dl className="care-facts">
            <Meta label={fa ? "نوع" : "Type"} value={kinds[item.type]?.[ix] ?? item.type}/>
            <Meta label={fa ? "زمان" : "Due"} value={format(item.dueAt)}/>
            {item.dueAt !== item.originalDueAt ? <Meta label={fa ? "زمان اصلی" : "Original due date"} value={format(item.originalDueAt)}/> : null}
            {item.snoozedUntil ? <Meta label={fa ? "یادآوری در" : "Remind at"} value={format(item.snoozedUntil)}/> : null}
            {item.completedAt ? <Meta label={fa ? "انجام شده در" : "Completed at"} value={format(item.completedAt)}/> : null}
            <Meta label={fa ? "تکرار" : "Recurrence"} value={`${repeat[item.recurrence]?.[ix] ?? item.recurrence}${item.intervalDays ? ` · ${formatCount(item.intervalDays, locale)}` : ""}`}/>
            <Meta label={fa ? "منبع" : "Source"} value={sources[item.source]?.[ix] ?? item.source}/>
            {open ? <Meta label={fa ? "اعلان" : "Notification"} value={item.notifiedAt ? `${fa ? "ارسال شد" : "Sent"} · ${format(item.notifiedAt)}` : (fa ? "هنوز ارسال نشده" : "Not sent yet")}/> : null}
          </dl>
          {related(item) ? <Link className="text-sm font-semibold text-brand-natural" href={`/${locale}/pets/${petId}/${related(item)}`}>{fa ? "مشاهده سابقه مرتبط" : "View related record"}</Link> : null}
        </div>
        {canEdit && open ? <aside className="split-aside">
          <section className="split-panel flex flex-col gap-3">
            <CareRowActions item={item} {...rowProps}/>
            <div className="flex flex-col gap-3 border-t border-border-subtle pt-3">
              <DateField label={fa ? "روز دلخواه" : "Choose a day"} value={atDay} onChange={setAtDay}/>
              <TimeSelect label={fa ? "ساعت (به وقت تهران)" : "Time (Tehran time)"} value={atTime} onChange={setAtTime}/>
              <div className="flex flex-wrap gap-2">{["SNOOZE","RESCHEDULE"].map(action => <Button key={action} variant="secondary" disabled={busy || !atDay || !atTime} onClick={() => void run(item.id,action,tehranIso(atDay, atTime))}>{action === "SNOOZE" ? (fa ? "تعویق اعلان" : "Snooze") : (fa ? "تغییر زمان یادآوری" : "Reschedule")}</Button>)}</div>
            </div>
          </section>
        </aside> : null}
      </div>
    </div>;
  }

  const sections = filter === "ALL"
    ? AGENDA.map(state => ({ state, rows: items.filter(i => i.state === state).sort(state === "COMPLETED" ? byLatest : bySoonest).slice(0, state === "COMPLETED" ? RECENT_COMPLETED : undefined) })).filter(s => s.rows.length)
    : [{ state: filter, rows: items.filter(item => filter === "CUSTOM" ? item.type === "CUSTOM" : item.state === filter) }].filter(s => s.rows.length);

  return <div className="flex flex-col gap-6">
    <header className="section-head"><div><h1>{fa ? "مرکز مراقبت" : "Care center"}</h1><p>{fa ? `یادآورها و پیگیری‌های ${petName}؛ زمان‌ها به وقت تهران` : `${petName}'s reminders and follow-ups; times shown in Tehran time`}</p></div><div className="flex flex-wrap items-center gap-2"><Link className="btn-quiet" href={`/${locale}/pets/${petId}/care/calendar`}>{fa ? "تقویم" : "Calendar"}</Link><Link className="btn-quiet" href={`/${locale}/pets/${petId}?view=travel`}>{fa ? "آمادگی سفر" : "Travel readiness"}</Link>{canEdit ? <Button onClick={() => setForm("new")}>{fa ? "یادآور جدید" : "Create reminder"}</Button> : null}</div></header>
    <nav aria-label={fa ? "فیلتر مراقبت" : "Care filters"} className="care-filters">{[["ALL", ["همه", "All"] as [string, string]] as const, ...Object.entries(states)].map(([key, label]) => <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>{label[ix]}<span className="care-filters__count">{formatCount(count(key), locale)}</span></button>)}</nav>
    {actionError ? <p role="alert" className="text-state-urgent">{actionError}</p> : null}
    {form ? <ReminderForm petId={petId} initial={form === "new" ? undefined : form} onClose={() => setForm(null)} onSaved={async () => { setForm(null); await load(); }} /> : null}
    {!sections.length ? <EmptyState title={emptyCopy(filter, fa).title} description={emptyCopy(filter, fa).body} actionLabel={canEdit ? (fa ? "یادآور جدید" : "Create reminder") : undefined} onAction={canEdit ? () => setForm("new") : undefined}/> : sections.map(({ state, rows }) => (
      <section key={state} className="care-agenda" aria-labelledby={`care-${state}`}>
        <h2 id={`care-${state}`} className="care-agenda__head" data-state={state}>{state === "COMPLETED" && filter === "ALL" ? (fa ? "اخیراً انجام‌شده" : "Recently completed") : states[state]?.[ix] ?? state}<span>{formatCount(rows.length, locale)}</span></h2>
        <ul className="care-rows">{rows.map(item => <CareRow key={item.id} item={item} {...rowProps}/>)}</ul>
      </section>
    ))}
    <details className="border-t border-border-subtle pt-5"><summary className="cursor-pointer text-section-title">{fa ? "دستورالعمل مراقبت روزمره" : "Daily care instructions"}</summary><div className="mt-5"><CareProfileView petId={petId}/></div></details>
  </div>;
}

type RowProps = { item: CareReminder; petId: string; locale: string; fa: boolean; ix: number; petName: string; canEdit: boolean; busy: boolean; format: (d: string) => string; onRun: (id: string, action: string, at?: string) => void; onEdit: (item: CareReminder) => void };

/** One care item: what, when, why (type and source), its state, and the next action. */
function CareRow(props: RowProps) {
  const { item, petId, locale, fa, ix, format } = props;
  const open = !["COMPLETED","CANCELLED"].includes(item.state);
  const when = item.state === "COMPLETED" && item.completedAt ? `${fa ? "انجام شد" : "Done"} · ${format(item.completedAt)}` : item.state === "SNOOZED" && item.snoozedUntil ? `${fa ? "یادآوری در" : "Reminds"} ${format(item.snoozedUntil)}` : format(item.dueAt);
  const book = bookingLink(item.type);
  return <li className="care-row" data-state={item.state}>
    <div className="care-row__main">
      <Link className="care-row__title" href={`/${locale}/pets/${petId}/care/${item.id}`}>{careTitle(item, locale)}</Link>
      <span className="care-row__when">{when}</span>
      <span className="care-row__meta">{kinds[item.type]?.[ix] ?? item.type} · {sources[item.source]?.[ix] ?? item.source}{item.recurrence !== "ONCE" ? ` · ${repeat[item.recurrence]?.[ix] ?? item.recurrence}` : ""}</span>
    </div>
    <div className="care-row__side">
      {book && open ? <Link className="care-row__book" href={`/${locale}/${book}`}>{fa ? "رزرو نوبت" : "Book a visit"}</Link> : null}
      {open && props.canEdit ? <div className="care-row__actions">
        {/* The two everyday actions; edit, later-today and cancel live on the item's own page. */}
        <Button size="sm" disabled={props.busy} onClick={() => props.onRun(item.id, "COMPLETE")}>{fa ? "انجام شد" : "Complete"}</Button>
        <Button size="sm" variant="secondary" disabled={props.busy} onClick={() => props.onRun(item.id, "SNOOZE", tomorrowMorning())}>{fa ? "فردا" : "Tomorrow"}</Button>
      </div> : null}
    </div>
  </li>;
}

function CareRowActions({ item, fa, busy, onRun, onEdit }: RowProps) {
  return <div className="care-row__actions">
    <Button size="sm" disabled={busy} onClick={() => onRun(item.id, "COMPLETE")}>{fa ? "انجام شد" : "Complete"}</Button>
    {item.source === "USER_CREATED" ? <Button size="sm" variant="secondary" disabled={busy} onClick={() => onEdit(item)}>{fa ? "ویرایش" : "Edit"}</Button> : null}
    <Button size="sm" variant="secondary" disabled={busy} onClick={() => onRun(item.id, "SNOOZE", laterToday())}>{fa ? "بعداً امروز" : "Later today"}</Button>
    <Button size="sm" variant="secondary" disabled={busy} onClick={() => onRun(item.id, "SNOOZE", tomorrowMorning())}>{fa ? "فردا" : "Tomorrow"}</Button>
    <Button size="sm" variant="ghost" disabled={busy} onClick={() => onRun(item.id, "CANCEL")}>{fa ? "لغو" : "Cancel"}</Button>
  </div>;
}

const bySoonest = (a: CareReminder, b: CareReminder) => (a.snoozedUntil ?? a.dueAt).localeCompare(b.snoozedUntil ?? b.dueAt);
const byLatest = (a: CareReminder, b: CareReminder) => (b.completedAt ?? b.dueAt).localeCompare(a.completedAt ?? a.dueAt);

/** Care that is done at a provider links to the existing booking routes — no recommendation is implied. */
function bookingLink(type: string): string | null {
  if (["VET_VISIT", "VACCINATION", "DENTAL", "LAB_TEST", "IMAGING", "FOLLOW_UP"].includes(type)) return "vet/find";
  if (type === "GROOMING") return "services";
  return null;
}

/** An ISO instant for a day + "HH:MM" read in Tehran time. */
function tehranIso(day: string, time: string): string {
  return new Date(`${day}T${time}:00${TEHRAN}`).toISOString();
}
/** Splits an instant into its Tehran-time day and "HH:MM" (half-hour slots for the time select). */
function tehranParts(iso: string): { day: string; time: string } {
  const t = new Date(new Date(iso).getTime() + 3.5 * 3600000);
  const minutes = t.getUTCMinutes() < 30 ? "00" : "30";
  return { day: t.toISOString().slice(0, 10), time: `${String(t.getUTCHours()).padStart(2, "0")}:${minutes}` };
}

/** Empty state per filter: what is empty, why, and (for editors) the next step via the action button. */
function emptyCopy(filter: string, fa: boolean): { title: string; body: string } {
  const why = fa ? "یادآورها از واکسن‌ها، داروها و نوبت‌ها ساخته می‌شوند؛ یادآور شخصی هم می‌توانید بسازید." : "Reminders come from vaccines, medications and bookings — you can also add your own.";
  const t: Record<string, [string, string]> = { ALL: ["هنوز مراقبتی ثبت نشده", "No care items yet"], DUE: ["یادآور نزدیکی ندارید", "Nothing is due soon"], OVERDUE: ["هیچ مراقبتی عقب نیفتاده است", "Nothing is overdue"], UPCOMING: ["یادآور آینده‌ای ثبت نشده", "No upcoming reminders"], COMPLETED: ["هنوز مراقبتی انجام‌شده ثبت نشده", "No completed care yet"], SNOOZED: ["یادآور به تعویق افتاده‌ای ندارید", "No snoozed reminders"], CANCELLED: ["یادآور لغوشده‌ای ندارید", "No cancelled reminders"], CUSTOM: ["یادآور شخصی ندارید", "No personal reminders"] };
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
function Meta({label,value}:{label:string;value:string}) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }
function ReminderForm({petId,initial,onClose,onSaved}:{petId:string;initial?:CareReminder;onClose:()=>void;onSaved:()=>Promise<void>}) {
  const fa = useLocale() === "fa"; const ix = fa ? 0 : 1;
  const start = initial ? tehranParts(initial.dueAt) : { day: "", time: "09:00" };
  const [title,setTitle] = useState(initial?.title ?? ""); const [kind,setKind] = useState(initial?.type ?? "CUSTOM"); const [day,setDay] = useState(start.day); const [time,setTime] = useState(start.time); const [recurrence,setRecurrence] = useState(initial?.recurrence ?? "ONCE"); const [interval,setIntervalDays] = useState(initial?.intervalDays ?? 1); const [busy,setBusy] = useState(false); const [error,setError] = useState<string | null>(null); const [planError,setPlanError] = useState<ApiError | null>(null);
  async function submit(e: FormEvent) { e.preventDefault(); if (!day || !time) { setError(fa ? "روز و ساعت را انتخاب کنید." : "Choose a day and a time."); return; } setBusy(true); setError(null); setPlanError(null); try { const input: ReminderInput = {title,type:kind,dueAt:tehranIso(day, time),recurrence,...(recurrence === "CUSTOM" ? {intervalDays:interval} : {})}; if(initial) await careRemindersService.edit(petId,initial.id,input); else await careRemindersService.create(petId,input); await onSaved(); } catch(e) { if (isPlanError(e)) setPlanError(e); else setError(apiErrorText(e, undefined, fa ? "ذخیره نشد. دوباره تلاش کنید." : "Unable to save")); } finally { setBusy(false); } }
  return <section className="split-panel"><form onSubmit={e => void submit(e)} className="grid gap-4 sm:grid-cols-2"><label>{fa ? "عنوان" : "Title"}<input className="mt-1 block w-full rounded border p-2" value={title} maxLength={200} required onChange={e => setTitle(e.target.value)}/></label><label>{fa ? "نوع" : "Type"}<select className="mt-1 block w-full rounded border p-2" value={kind} onChange={e => setKind(e.target.value)}>{Object.entries(kinds).map(([key,label]) => <option key={key} value={key}>{label[ix]}</option>)}</select></label><DateField label={fa ? "روز" : "Day"} value={day} onChange={setDay}/><TimeSelect label={fa ? "ساعت (به وقت تهران)" : "Time (Tehran time)"} value={time} onChange={setTime}/><label>{fa ? "تکرار با انتخاب شما" : "Recurrence you choose"}<select className="mt-1 block w-full rounded border p-2" value={recurrence} onChange={e => setRecurrence(e.target.value)}>{Object.entries(repeat).map(([key,label]) => <option key={key} value={key}>{label[ix]}</option>)}</select></label>{recurrence === "CUSTOM" ? <label>{fa ? "فاصله به روز" : "Interval in days"}<input className="mt-1 block w-full rounded border p-2" type="number" min={1} max={3650} required value={interval} onChange={e => setIntervalDays(Number(e.target.value))}/></label> : null}<p className="text-sm text-text-secondary sm:col-span-2">{fa ? "تکرار ماهانه و سالانه بر پایه تقویم میلادی است. زمان درمان را از دستور دامپزشک وارد کنید." : "Monthly and yearly recurrence follows Gregorian dates. Enter medical timing from your veterinarian's instructions."}</p>{error ? <p role="alert" className="text-state-urgent sm:col-span-2">{error}</p> : null}{planError ? <PlanRequiredNote error={planError} /> : null}<div className="flex gap-3"><Button type="submit" disabled={busy}>{fa ? "ذخیره" : "Save"}</Button><Button type="button" variant="ghost" onClick={onClose}>{fa ? "بستن" : "Close"}</Button></div></form></section>;
}
