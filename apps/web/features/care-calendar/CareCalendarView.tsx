"use client";
import { useState } from "react";
import { useLocale } from "next-intl";
import Link from "next/link";
import { usePetStore } from "@/stores/pet-store";
import { PetCareCalendarView } from "./PetCareCalendarView";
import type { RouteLocale } from "@/lib/i18n/config";
const copy = {
  fa: { pet: "حیوان", choose: "برای مشاهده تقویم، حیوان خانگی را انتخاب کنید." },
  en: { pet: "Pet", choose: "Choose a pet to view its calendar." },
  de: { pet: "Haustier", choose: "Wähle ein Haustier aus, um den Kalender zu sehen." },
  es: { pet: "Mascota", choose: "Elige una mascota para ver su calendario." },
  ar: { pet: "الحيوان الأليف", choose: "اختر حيوانًا أليفًا لعرض تقويمه." },
  nl: { pet: "Huisdier", choose: "Kies een huisdier om de kalender te bekijken." },
} as const;
export function CareCalendarView(){
  const locale=useLocale() as RouteLocale,c=copy[locale];const pets=usePetStore(s=>s.pets),active=usePetStore(s=>s.activePetId);const [selected,setSelected]=useState<string|null>(null);
  const petId=selected??active??pets[0]?.id;
  const picker = pets.length > 1 ? <label className="calendar-toolbar__pet"><span>{c.pet}</span><select value={petId??""} onChange={e=>setSelected(e.target.value)}>{pets.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label> : null;
  return petId?<PetCareCalendarView key={petId} petId={petId} toolbar={picker}/>:<Link href={`/${locale}/pets`}>{c.choose}</Link>;
}
