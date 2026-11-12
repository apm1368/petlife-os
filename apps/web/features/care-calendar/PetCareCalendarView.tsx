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
import { HealthCareFrame } from "@/features/health/HealthCareFrame";
import type { RouteLocale } from "@/lib/i18n/config";
type Event = { id:string; title:string; date:string; status:string; href:string; source:string };
const copy = {
  fa: { title:"تقویم مراقبت", description:"یادآورها و نوبت‌ها در یک نگاه؛ زمان‌ها به وقت تهران", careCenter:"مرکز مراقبت", previous:"ماه قبل", next:"ماه بعد", view:"نمای تقویم", month:"ماه", agenda:"فهرست", selectDay:"انتخاب روز", allDays:"همه روزهای ماه", showMonth:"نمایش کل ماه", events:"فهرست رویدادها", empty:"رویدادی در این بازه ثبت نشده", pet:"حیوان", choosePet:"برای مشاهده تقویم، حیوان خانگی را انتخاب کنید.", booking:"رزرو مراقبت", loading:"در حال بارگذاری", weekdays:["شنبه","یکشنبه","دوشنبه","سه‌شنبه","چهارشنبه","پنجشنبه","جمعه"] },
  en: { title:"Care calendar", description:"Reminders and bookings at a glance; times in Tehran time", careCenter:"Care center", previous:"Previous", next:"Next", view:"Calendar view", month:"Month", agenda:"Agenda", selectDay:"Select day", allDays:"All days this month", showMonth:"Show whole month", events:"Event agenda", empty:"No events in this period", pet:"Pet", choosePet:"Choose a pet to view its calendar.", booking:"Care booking", loading:"Loading", weekdays:["Sun","Mon","Tue","Wed","Thu","Fri","Sat"] },
  de: { title:"Pflegekalender", description:"Erinnerungen und Termine auf einen Blick; Zeiten in der Zeitzone Teheran", careCenter:"Pflegebereich", previous:"Vorheriger Monat", next:"Nächster Monat", view:"Kalenderansicht", month:"Monat", agenda:"Agenda", selectDay:"Tag auswählen", allDays:"Alle Tage dieses Monats", showMonth:"Ganzen Monat anzeigen", events:"Terminübersicht", empty:"Keine Ereignisse in diesem Zeitraum", pet:"Haustier", choosePet:"Wähle ein Haustier aus, um den Kalender zu sehen.", booking:"Pflegetermin", loading:"Wird geladen", weekdays:["So","Mo","Di","Mi","Do","Fr","Sa"] },
  es: { title:"Calendario de cuidados", description:"Recordatorios y citas de un vistazo; horas en la zona horaria de Teherán", careCenter:"Centro de cuidados", previous:"Mes anterior", next:"Mes siguiente", view:"Vista del calendario", month:"Mes", agenda:"Agenda", selectDay:"Seleccionar día", allDays:"Todos los días de este mes", showMonth:"Mostrar el mes completo", events:"Agenda de eventos", empty:"No hay eventos en este periodo", pet:"Mascota", choosePet:"Elige una mascota para ver su calendario.", booking:"Cita de cuidados", loading:"Cargando", weekdays:["dom","lun","mar","mié","jue","vie","sáb"] },
  ar: {
    title: "تقويم الرعاية",
    description: "التذكيرات والحجوزات في لمحة؛ الأوقات بتوقيت طهران",
    careCenter: "مركز الرعاية",
    previous: "السابق",
    next: "التالي",
    view: "عرض التقويم",
    month: "الشهر",
    agenda: "القائمة",
    selectDay: "اختر اليوم",
    allDays: "كل أيام هذا الشهر",
    showMonth: "عرض الشهر كاملًا",
    events: "قائمة الأحداث",
    empty: "لا أحداث في هذه الفترة",
    pet: "الحيوان الأليف",
    choosePet: "اختر حيوانًا أليفًا لعرض تقويمه.",
    booking: "حجز رعاية",
    loading: "جارٍ التحميل",
    weekdays: ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"]
  },
  nl: {
    title: "Zorgkalender",
    description: "Reminders en boekingen in één oogopslag; tijden in Teheraanse tijd",
    careCenter: "Zorgcentrum",
    previous: "Vorige",
    next: "Volgende",
    view: "Kalenderweergave",
    month: "Maand",
    agenda: "Lijst",
    selectDay: "Dag kiezen",
    allDays: "Alle dagen van deze maand",
    showMonth: "Hele maand tonen",
    events: "Lijst met gebeurtenissen",
    empty: "Geen gebeurtenissen in deze periode",
    pet: "Huisdier",
    choosePet: "Kies een huisdier om de kalender te bekijken.",
    booking: "Zorgboeking",
    loading: "Laden",
    weekdays: ["zo", "ma", "di", "wo", "do", "vr", "za"]
  },
} as const;
const intlLocale: Record<RouteLocale, string> = { fa:"fa-IR-u-ca-persian", en:"en-US", de:"de-DE", es:"es-ES", ar: "ar", nl: "nl-NL" };
export function PetCareCalendarView({petId, toolbar}:{petId:string; toolbar?: ReactNode}) {
  const locale=useLocale() as RouteLocale; const fa=locale==="fa"; const c=copy[locale];
  const [anchor,setAnchor]=useState(()=>new Date()); const [mode,setMode]=useState("MONTH"); const [selected,setSelected]=useState<string|null>(null); const [events,setEvents]=useState<Event[]|null>(null); const [error,setError]=useState<unknown>(null);
  const load=useCallback(async()=>{ setError(null); try { const [reminders,bookings]=await Promise.all([careRemindersService.list(petId),careCalendarService.list(petId)]); setEvents([...reminders.map(r=>({id:r.id,title:careTitle(r,locale),date:r.dueAt,status:r.state,href:`/${locale}/pets/${petId}/care/${r.id}`,source:r.source})),...bookings.map(b=>({id:b.id,title:c.booking,date:b.startAt,status:b.status,href:`/${locale}/bookings/${b.bookingId}`,source:"BOOKING_DERIVED"}))].sort((a,b)=>a.date.localeCompare(b.date))); } catch(e) {setError(e);} },[petId,locale,c.booking]);
  useEffect(()=>{void load();},[load]);
  if(error) return <LoadFailure error={error} onRetry={load}/>;
  if(!events) return <Skeleton className="h-72 w-full" aria-label={c.loading}/>;
  const month=calendarMonth(anchor,fa); const label=new Intl.DateTimeFormat(intlLocale[locale],{year:"numeric",month:"long",timeZone:"Asia/Tehran"}).format(anchor);
  const monthKeys=new Set(month.dates.map(careDayKey)); const visible=events.filter(e=>selected ? careDayKey(e.date)===selected : monthKeys.has(careDayKey(e.date)));
  const todayKey=careDayKey(new Date());
  const weekdays=c.weekdays;
  return <HealthCareFrame><div className="flex flex-col gap-5"><header className="section-head"><div><h1>{c.title}</h1><p>{c.description}</p></div><Link className="btn-quiet" href={`/${locale}/pets/${petId}/care`}>{c.careCenter}</Link></header>
    <div className="calendar-toolbar">{toolbar}<div className="calendar-toolbar__month"><Button variant="secondary" size="sm" onClick={()=>{setAnchor(month.previous);setSelected(null);}}>{c.previous}</Button><h2 className="section-title" style={{margin:0}}>{label}</h2><Button variant="secondary" size="sm" onClick={()=>{setAnchor(month.next);setSelected(null);}}>{c.next}</Button></div><div className="calendar-toolbar__views" role="group" aria-label={c.view}><button type="button" aria-pressed={mode==="MONTH"} onClick={()=>setMode("MONTH")}>{c.month}</button><button type="button" aria-pressed={mode==="AGENDA"} onClick={()=>setMode("AGENDA")}>{c.agenda}</button></div></div>
    <label className="md:hidden">{c.selectDay}<select className="mt-1 block w-full rounded border p-3" value={selected??""} onChange={e=>setSelected(e.target.value||null)}><option value="">{c.allDays}</option>{month.dates.map(d=><option key={careDayKey(d)} value={careDayKey(d)}>{new Intl.DateTimeFormat(intlLocale[locale],{day:"numeric",weekday:"long",timeZone:"Asia/Tehran"}).format(d)}</option>)}</select></label>
    {mode==="MONTH"?<div className="hidden grid-cols-7 overflow-hidden rounded-xl border border-border-subtle md:grid">{weekdays.map(d=><div key={d} className="bg-surface-subtle p-3 text-center text-sm">{d}</div>)}{Array.from({length:month.offset},(_,i)=><div key={`empty-${i}`} className="border border-border-subtle"/>)}{month.dates.map(d=>{const key=careDayKey(d);const dayEvents=events.filter(e=>careDayKey(e.date)===key); return <div key={key} className="cal-day" data-today={key===todayKey||undefined} data-selected={key===selected||undefined}><button className="cal-day__num" aria-current={key===todayKey?"date":undefined} onClick={()=>setSelected(key)}>{new Intl.DateTimeFormat(intlLocale[locale],{day:"numeric",timeZone:"Asia/Tehran"}).format(d)}</button>{dayEvents.slice(0,3).map(e=><Link key={e.id} href={e.href} className="cal-chip" data-status={e.status} data-source={e.source}>{e.title}</Link>)}{dayEvents.length>3?<button className="cal-more" onClick={()=>setSelected(key)}>+{formatCount(dayEvents.length-3,locale)}</button>:null}</div>;})}</div>:null}
    {selected?<Button variant="ghost" onClick={()=>setSelected(null)}>{c.showMonth}</Button>:null}
    <section aria-label={c.events} className="divide-y divide-border-subtle">{!visible.length?<EmptyState title={c.empty}/>:visible.map(e=><Link key={e.id} href={e.href} className="cal-agenda-row" data-status={e.status} data-source={e.source}><span className="font-bold text-text-primary">{e.title}</span><time dateTime={e.date} className="text-sm text-text-secondary">{new Intl.DateTimeFormat(intlLocale[locale],{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Tehran"}).format(new Date(e.date))}</time></Link>)}</section></div></HealthCareFrame>;
}
