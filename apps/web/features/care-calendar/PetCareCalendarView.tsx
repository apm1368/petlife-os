"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { Button, EmptyState, Skeleton } from "@petlife/ui";
import { careTitle } from "@/features/care/care-labels";
import { LoadFailure } from "@/features/system/LoadFailure";
import { formatCount } from "@/lib/number/format-number";
import { careRemindersService } from "@/services/care-reminders.service";
import { careCalendarService } from "@/services/care-calendar.service";
import { calendarMonth, careDayKey } from "./care-calendar-date";
type Event = { id:string; title:string; date:string; status:string; href:string; source:string };
export function PetCareCalendarView({petId, toolbar}:{petId:string; toolbar?: ReactNode}) {
  const locale=useLocale(); const fa=locale==="fa";
  const [anchor,setAnchor]=useState(()=>new Date()); const [mode,setMode]=useState("MONTH"); const [selected,setSelected]=useState<string|null>(null); const [events,setEvents]=useState<Event[]|null>(null); const [error,setError]=useState<unknown>(null);
  const load=useCallback(async()=>{ setError(null); try { const [reminders,bookings]=await Promise.all([careRemindersService.list(petId),careCalendarService.list(petId)]); setEvents([...reminders.map(r=>({id:r.id,title:careTitle(r,locale),date:r.dueAt,status:r.state,href:`/${locale}/pets/${petId}/care/${r.id}`,source:r.source})),...bookings.map(b=>({id:b.id,title:fa ? "رزرو مراقبت" : "Care booking",date:b.startAt,status:b.status,href:`/${locale}/bookings/${b.bookingId}`,source:"BOOKING_DERIVED"}))].sort((a,b)=>a.date.localeCompare(b.date))); } catch(e) {setError(e);} },[petId,locale,fa]);
  useEffect(()=>{void load();},[load]);
  if(error) return <LoadFailure error={error} onRetry={load}/>;
  if(!events) return <Skeleton className="h-72 w-full" aria-label={fa?"در حال بارگذاری":"Loading"}/>;
  const month=calendarMonth(anchor,fa); const label=new Intl.DateTimeFormat(fa?"fa-IR-u-ca-persian":"en-US",{year:"numeric",month:"long",timeZone:"Asia/Tehran"}).format(anchor);
  const monthKeys=new Set(month.dates.map(careDayKey)); const visible=events.filter(e=>selected ? careDayKey(e.date)===selected : monthKeys.has(careDayKey(e.date)));
  const weekdays=fa?["شنبه","یکشنبه","دوشنبه","سه‌شنبه","چهارشنبه","پنجشنبه","جمعه"]:["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  return <div className="flex flex-col gap-5"><header className="section-head"><div><h1>{fa?"تقویم مراقبت":"Care calendar"}</h1><p>{fa?"یادآورها و نوبت‌ها در یک نگاه؛ زمان‌ها به وقت تهران":"Reminders and bookings at a glance; times in Tehran time"}</p></div><Link className="btn-quiet" href={`/${locale}/pets/${petId}/care`}>{fa?"مرکز مراقبت":"Care center"}</Link></header>
    <div className="calendar-toolbar">{toolbar}<div className="calendar-toolbar__month"><Button variant="secondary" size="sm" onClick={()=>{setAnchor(month.previous);setSelected(null);}}>{fa?"ماه قبل":"Previous"}</Button><h2 className="section-title" style={{margin:0}}>{label}</h2><Button variant="secondary" size="sm" onClick={()=>{setAnchor(month.next);setSelected(null);}}>{fa?"ماه بعد":"Next"}</Button></div><div className="calendar-toolbar__views" role="group" aria-label={fa?"نمای تقویم":"Calendar view"}><button type="button" aria-pressed={mode==="MONTH"} onClick={()=>setMode("MONTH")}>{fa?"ماه":"Month"}</button><button type="button" aria-pressed={mode==="AGENDA"} onClick={()=>setMode("AGENDA")}>{fa?"فهرست":"Agenda"}</button></div></div>
    <label className="md:hidden">{fa?"انتخاب روز":"Select day"}<select className="mt-1 block w-full rounded border p-3" value={selected??""} onChange={e=>setSelected(e.target.value||null)}><option value="">{fa?"همه روزهای ماه":"All days this month"}</option>{month.dates.map(d=><option key={careDayKey(d)} value={careDayKey(d)}>{new Intl.DateTimeFormat(fa?"fa-IR-u-ca-persian":"en-US",{day:"numeric",weekday:"long",timeZone:"Asia/Tehran"}).format(d)}</option>)}</select></label>
    {mode==="MONTH"?<div className="hidden grid-cols-7 overflow-hidden rounded-xl border border-border-subtle md:grid">{weekdays.map(d=><div key={d} className="bg-surface-subtle p-3 text-center text-sm">{d}</div>)}{Array.from({length:month.offset},(_,i)=><div key={`empty-${i}`} className="border border-border-subtle"/>)}{month.dates.map(d=>{const key=careDayKey(d);const dayEvents=events.filter(e=>careDayKey(e.date)===key); return <div key={key} className="min-h-28 border border-border-subtle p-2"><button className="mb-2 rounded px-2 py-1 focus-visible:ring-2" onClick={()=>setSelected(key)}>{new Intl.DateTimeFormat(fa?"fa-IR-u-ca-persian":"en-US",{day:"numeric",timeZone:"Asia/Tehran"}).format(d)}</button>{dayEvents.slice(0,3).map(e=><Link key={e.id} href={e.href} className="mb-1 block truncate rounded bg-brand-natural/10 p-1 text-xs text-brand-natural">{e.title}</Link>)}{dayEvents.length>3?<button className="text-xs" onClick={()=>setSelected(key)}>+{formatCount(dayEvents.length-3,locale)}</button>:null}</div>;})}</div>:null}
    {selected?<Button variant="ghost" onClick={()=>setSelected(null)}>{fa?"نمایش کل ماه":"Show whole month"}</Button>:null}
    <section aria-label={fa?"فهرست رویدادها":"Event agenda"} className="divide-y divide-border-subtle">{!visible.length?<EmptyState title={fa?"رویدادی در این بازه ثبت نشده":"No events in this period"}/>:visible.map(e=><Link key={e.id} href={e.href} className="flex flex-wrap justify-between gap-3 py-4"><span className="font-bold text-text-primary">{e.title}</span><time dateTime={e.date} className="text-sm text-text-secondary">{new Intl.DateTimeFormat(fa?"fa-IR-u-ca-persian":"en-US",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Tehran"}).format(new Date(e.date))}</time></Link>)}</section></div>;
}
