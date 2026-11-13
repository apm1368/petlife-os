"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { RouteLocale } from "@/lib/i18n/config";
import { Button, EmptyState, Skeleton } from "@petlife/ui";
import { careRemindersService, type CareReminder, type ReminderInput } from "@/services/care-reminders.service";
import { petsService } from "@/services/pets.service";
import { CareProfileView } from "./CareProfileView";
import { CARE_KINDS, careTitle } from "./care-labels";
import { LoadFailure } from "@/features/system/LoadFailure";
import { formatCount } from "@/lib/number/format-number";
import { formatDayOrDateTime } from "@/lib/date/tehran";
import { DateField } from "@/features/shared/date-picker/DateField";
import { ApiError } from "@/lib/api/client";
import { isPlanError, PlanRequiredNote } from "@/features/subscription/PlanRequiredNote";
import { TimeSelect } from "@/features/shared/date-picker/TimeSelect";
import { HealthCareFrame } from "@/features/health/HealthCareFrame";

const kinds = CARE_KINDS;
const stateKeys = ["DUE", "OVERDUE", "UPCOMING", "COMPLETED", "SNOOZED", "CANCELLED", "CUSTOM"] as const;
const filterEmptyKeys = { ALL: "all", DUE: "due", OVERDUE: "overdue", UPCOMING: "upcoming", COMPLETED: "completed", SNOOZED: "snoozed", CANCELLED: "cancelled", CUSTOM: "custom" } as const;
/** The agenda: what needs doing first comes first. Cancelled items are only shown through their filter. */
const AGENDA = ["OVERDUE", "DUE", "SNOOZED", "UPCOMING", "COMPLETED"] as const;
const RECENT_COMPLETED = 5;
const TEHRAN = "+03:30"; // Iran has no DST.

export function CareCenterView({ petId, itemId }: { petId: string; itemId?: string }) {
  const suggestionsT = useTranslations("careSuggestions");
  const locale = useLocale() as RouteLocale;
  const c = useTranslations("careCenter");
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
  const run = async (id: string, action: string, date?: string) => { setBusy(true); setActionError(null); try { await careRemindersService.act(petId, id, action, date); await load(); } catch { setActionError(c("actionFailed")); } finally { setBusy(false); } };
  // A due date with no time of day (e.g. a vaccine's next due date) reads as a day, never "…، ۳:۳۰" (QA L12).
  const format = (date: string) => formatDayOrDateTime(date, locale);
  if(error) return <LoadFailure error={error} onRetry={load}/>;
  if(!items) return <Skeleton className="h-64 w-full" aria-label={c("loading")}/>;

  const count = (key: string) => key === "ALL" ? items.filter(i => i.state !== "CANCELLED").length : key === "CUSTOM" ? items.filter(i => i.type === "CUSTOM").length : items.filter(i => i.state === key).length;
const rowProps = { petId, locale, canEdit, busy, format, onRun: run, onEdit: (item: CareReminder) => setForm(item), c };

  if (itemId) {
    const item = items[0]!;
    const open = !["COMPLETED","CANCELLED"].includes(item.state);
    return <HealthCareFrame><div className="flex flex-col gap-6">
      <header className="section-head"><div><h1>{careTitle(item, locale)}</h1><p>{petName} · {stateLabel(item.state, c)}</p></div><Link className="btn-quiet" href={`/${locale}/pets/${petId}/care`}>{c("allCare")}</Link></header>
      {actionError ? <p role="alert" className="text-state-urgent">{actionError}</p> : null}
      {form ? <ReminderForm petId={petId} initial={form === "new" ? undefined : form} onClose={() => setForm(null)} onSaved={async () => { setForm(null); await load(); }} /> : null}
      <div className="split-layout">
        <div className="split-main">
          <dl className="care-facts">
            <Meta label={c("type")} value={kindLabel(item.type, locale, c)}/>
            <Meta label={c("due")} value={format(item.dueAt)}/>
            {item.dueAt !== item.originalDueAt ? <Meta label={c("originalDue")} value={format(item.originalDueAt)}/> : null}
            {item.snoozedUntil ? <Meta label={c("remindAt")} value={format(item.snoozedUntil)}/> : null}
            {item.completedAt ? <Meta label={c("completedAt")} value={format(item.completedAt)}/> : null}
            <Meta label={c("recurrence")} value={`${recurrenceLabel(item.recurrence, c)}${item.intervalDays ? ` · ${formatCount(item.intervalDays, locale)}` : ""}`}/>
            <Meta label={c("source")} value={sourceLabel(item.source, c)}/>
            {open ? <Meta label={c("notification")} value={item.notifiedAt ? `${c("sent")} · ${format(item.notifiedAt)}` : c("notSent")}/> : null}
          </dl>
          {related(item) ? <Link className="text-sm font-semibold text-brand-natural" href={`/${locale}/pets/${petId}/${related(item)}`}>{c("relatedRecord")}</Link> : null}
        </div>
        {canEdit && open ? <aside className="split-aside">
          <section className="split-panel flex flex-col gap-3">
            <CareRowActions item={item} {...rowProps}/>
            <div className="flex flex-col gap-3 border-t border-border-subtle pt-3">
              <DateField label={c("chooseDay")} value={atDay} onChange={setAtDay}/>
              <TimeSelect label={c("timeTehran")} value={atTime} onChange={setAtTime}/>
              <div className="flex flex-wrap gap-2">{["SNOOZE","RESCHEDULE"].map(action => <Button key={action} variant="secondary" disabled={busy || !atDay || !atTime} onClick={() => void run(item.id,action,tehranIso(atDay, atTime))}>{action === "SNOOZE" ? c("snooze") : c("reschedule")}</Button>)}</div>
            </div>
          </section>
        </aside> : null}
      </div>
    </div></HealthCareFrame>;
  }

  const sections = filter === "ALL"
    ? AGENDA.map(state => ({ state, rows: items.filter(i => i.state === state).sort(state === "COMPLETED" ? byLatest : bySoonest).slice(0, state === "COMPLETED" ? RECENT_COMPLETED : undefined) })).filter(s => s.rows.length)
    : [{ state: filter, rows: items.filter(item => filter === "CUSTOM" ? item.type === "CUSTOM" : item.state === filter) }].filter(s => s.rows.length);

  return <HealthCareFrame><div className="flex flex-col gap-6">
    <header className="section-head"><div><h1>{c("title")}</h1><p>{c("subtitle", { petName })}</p></div><div className="flex flex-wrap items-center gap-2"><Link className="btn-quiet" href={`/${locale}/pets/${petId}/care/calendar`}>{c("calendar")}</Link><Link className="btn-quiet" href={`/${locale}/pets/${petId}/care-sheet`}>{c("careSheet")}</Link><Link className="btn-quiet" href={`/${locale}/pets/${petId}?view=travel`}>{c("travelReadiness")}</Link>{canEdit ? <Button onClick={() => setForm("new")}>{c("create")}</Button> : null}</div></header>
    <nav aria-label={c("filtersAria")} className="care-filters">{["ALL", ...stateKeys].map(key => <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>{key === "ALL" ? c("filters.all") : stateLabel(key, c)}<span className="care-filters__count">{formatCount(count(key), locale)}</span></button>)}</nav>
    {actionError ? <p role="alert" className="text-state-urgent">{actionError}</p> : null}
    {form ? <ReminderForm petId={petId} initial={form === "new" ? undefined : form} onClose={() => setForm(null)} onSaved={async () => { setForm(null); await load(); }} /> : null}
    {!sections.length ? <EmptyState title={emptyTitle(filter, c)} description={c("empty.body")} actionLabel={canEdit ? c("create") : undefined} onAction={canEdit ? () => setForm("new") : undefined}/> : sections.map(({ state, rows }) => (
      <section key={state} className="care-agenda" aria-labelledby={`care-${state}`}>
        <h2 id={`care-${state}`} className="care-agenda__head" data-state={state}>{state === "COMPLETED" && filter === "ALL" ? c("recentlyCompleted") : stateLabel(state, c)}<span>{formatCount(rows.length, locale)}</span></h2>
        <ul className="care-rows">{rows.map(item => <CareRow key={item.id} item={item} {...rowProps}/>)}</ul>
      </section>
    ))}
    <Link className="inline-flex min-h-11 items-center self-start underline" href={`/${locale}/pets/${petId}/care/suggestions`}>{suggestionsT("title")}</Link>
    <details className="border-t border-border-subtle pt-5"><summary className="flex min-h-11 cursor-pointer items-center text-section-title">{c("dailyInstructions")}</summary><div className="mt-5"><CareProfileView petId={petId}/></div></details>
  </div></HealthCareFrame>;
}

type CareCenterTranslator = ReturnType<typeof useTranslations<"careCenter">>;
type RowProps = { item: CareReminder; petId: string; locale: RouteLocale; canEdit: boolean; busy: boolean; format: (d: string) => string; onRun: (id: string, action: string, at?: string) => void; onEdit: (item: CareReminder) => void; c: CareCenterTranslator };

/** One care item: what, when, why (type and source), its state, and the next action. */
function CareRow(props: RowProps) {
  const { item, petId, locale, format, c } = props;
  const open = !["COMPLETED","CANCELLED"].includes(item.state);
  const when = item.state === "COMPLETED" && item.completedAt ? `${c("done")} · ${format(item.completedAt)}` : item.state === "SNOOZED" && item.snoozedUntil ? `${c("reminds")} ${format(item.snoozedUntil)}` : format(item.dueAt);
  const book = bookingLink(item.type);
  return <li className="care-row" data-state={item.state}>
    <div className="care-row__main">
      <Link className="care-row__title" href={`/${locale}/pets/${petId}/care/${item.id}`}>{careTitle(item, locale)}</Link>
      <span className="care-row__when">{when}</span>
      <span className="care-row__meta">{kindLabel(item.type, locale, c)} · {sourceLabel(item.source, c)}{item.recurrence !== "ONCE" ? ` · ${recurrenceLabel(item.recurrence, c)}` : ""}</span>
    </div>
    <div className="care-row__side">
      {book && open ? <Link className="care-row__book" href={`/${locale}/${book}`}>{c("bookVisit")}</Link> : null}
      {open && props.canEdit ? <div className="care-row__actions">
        {/* The two everyday actions; edit, later-today and cancel live on the item's own page. */}
        <Button size="sm" disabled={props.busy} onClick={() => props.onRun(item.id, "COMPLETE")}>{c("complete")}</Button>
        <Button size="sm" variant="secondary" disabled={props.busy} onClick={() => props.onRun(item.id, "SNOOZE", tomorrowMorning())}>{c("tomorrow")}</Button>
      </div> : null}
    </div>
  </li>;
}

function CareRowActions({ item, busy, onRun, onEdit, c }: RowProps) {
  // Cancelling removes the reminder from the agenda and stops its notifications — confirm in place first.
  const [confirmCancel, setConfirmCancel] = useState(false);
  if (confirmCancel) return <div className="care-row__actions" role="group" aria-label={c("confirmCancel")}>
    <p className="text-sm text-text-secondary">{c("cancelWarning")}</p>
    <Button size="sm" variant="danger" disabled={busy} onClick={() => { setConfirmCancel(false); onRun(item.id, "CANCEL"); }}>{c("cancelYes")}</Button>
    <Button size="sm" variant="secondary" disabled={busy} onClick={() => setConfirmCancel(false)}>{c("cancelKeep")}</Button>
  </div>;
  return <div className="care-row__actions">
    <Button size="sm" disabled={busy} onClick={() => onRun(item.id, "COMPLETE")}>{c("complete")}</Button>
    {item.source === "USER_CREATED" ? <Button size="sm" variant="secondary" disabled={busy} onClick={() => onEdit(item)}>{c("edit")}</Button> : null}
    <Button size="sm" variant="secondary" disabled={busy} onClick={() => onRun(item.id, "SNOOZE", laterToday())}>{c("laterToday")}</Button>
    <Button size="sm" variant="secondary" disabled={busy} onClick={() => onRun(item.id, "SNOOZE", tomorrowMorning())}>{c("tomorrow")}</Button>
    <Button size="sm" variant="ghost" disabled={busy} onClick={() => setConfirmCancel(true)}>{c("cancel")}</Button>
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
function emptyTitle(filter: string, t: CareCenterTranslator): string {
  const key = filterEmptyKeys[filter as keyof typeof filterEmptyKeys] ?? "upcoming";
  return t(`empty.${key}.title`);
}
function stateLabel(state: string, t: CareCenterTranslator): string { return stateKeys.includes(state as typeof stateKeys[number]) ? t(`states.${state as typeof stateKeys[number]}`) : t("unknownState"); }
function kindLabel(type: string, locale: RouteLocale, t: CareCenterTranslator): string { return kinds[type]?.[({ fa: 0, en: 1, de: 2, es: 3, ar: 4, nl: 5 } as const)[locale]] ?? t("unknownType"); }
function recurrenceLabel(recurrence: string, t: CareCenterTranslator): string {
  const known = ["ONCE", "DAILY", "WEEKLY", "MONTHLY", "YEARLY", "CUSTOM"] as const;
  return known.includes(recurrence as typeof known[number]) ? t(`recurrenceOptions.${recurrence as typeof known[number]}`) : t("unknownRecurrence");
}
function sourceLabel(source: string, t: CareCenterTranslator): string {
  const known = ["USER_CREATED", "PROVIDER_CREATED", "MEDICAL_RECORD_DERIVED", "BOOKING_DERIVED", "SYSTEM_SCHEDULED"] as const;
  return known.includes(source as typeof known[number]) ? t(`sources.${source as typeof known[number]}`) : t("unknownSource");
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
  const locale = useLocale() as RouteLocale; const c = useTranslations("careCenter");
  const start = initial ? tehranParts(initial.dueAt) : { day: "", time: "09:00" };
  const [title,setTitle] = useState(initial?.title ?? ""); const [kind,setKind] = useState(initial?.type ?? "CUSTOM"); const [day,setDay] = useState(start.day); const [time,setTime] = useState(start.time); const [recurrence,setRecurrence] = useState(initial?.recurrence ?? "ONCE"); const [interval,setIntervalDays] = useState(initial?.intervalDays ?? 1); const [busy,setBusy] = useState(false); const [error,setError] = useState<string | null>(null); const [planError,setPlanError] = useState<ApiError | null>(null);
  async function submit(e: FormEvent) { e.preventDefault(); if (!day || !time) { setError(c("chooseDayAndTime")); return; } setBusy(true); setError(null); setPlanError(null); try { const input: ReminderInput = {title,type:kind,dueAt:tehranIso(day, time),recurrence,...(recurrence === "CUSTOM" ? {intervalDays:interval} : {})}; if(initial) await careRemindersService.edit(petId,initial.id,input); else await careRemindersService.create(petId,input); await onSaved(); } catch(e) { if (isPlanError(e)) setPlanError(e); else setError(c("saveFailed")); } finally { setBusy(false); } }
  return <section className="split-panel"><form onSubmit={e => void submit(e)} className="grid gap-4 sm:grid-cols-2"><label>{c("form.title")}<input className="mt-1 block w-full rounded border p-2" value={title} maxLength={200} required onChange={e => setTitle(e.target.value)}/></label><label>{c("type")}<select className="mt-1 block w-full rounded border p-2" value={kind} onChange={e => setKind(e.target.value)}>{Object.keys(kinds).map(key => <option key={key} value={key}>{kindLabel(key, locale, c)}</option>)}</select></label><DateField label={c("day")} value={day} onChange={setDay}/><TimeSelect label={c("timeTehran")} value={time} onChange={setTime}/><label>{c("form.recurrence")}<select className="mt-1 block w-full rounded border p-2" value={recurrence} onChange={e => setRecurrence(e.target.value)}>{["ONCE","DAILY","WEEKLY","MONTHLY","YEARLY","CUSTOM"].map(key => <option key={key} value={key}>{recurrenceLabel(key, c)}</option>)}</select></label>{recurrence === "CUSTOM" ? <label>{c("form.intervalDays")}<input className="mt-1 block w-full rounded border p-2" type="number" min={1} max={3650} required value={interval} onChange={e => setIntervalDays(Number(e.target.value))}/></label> : null}<p className="text-sm text-text-secondary sm:col-span-2">{c("form.recurrenceNote")}</p>{error ? <p role="alert" className="text-state-urgent sm:col-span-2">{error}</p> : null}{planError ? <PlanRequiredNote error={planError} /> : null}<div className="flex gap-3"><Button type="submit" disabled={busy}>{busy ? c("saving") : c("save")}</Button><Button type="button" variant="ghost" disabled={busy} onClick={onClose}>{c("close")}</Button></div></form></section>;
}
