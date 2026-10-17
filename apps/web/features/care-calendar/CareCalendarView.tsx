"use client";
import { useState } from "react";
import { useLocale } from "next-intl";
import Link from "next/link";
import { usePetStore } from "@/stores/pet-store";
import { PetCareCalendarView } from "./PetCareCalendarView";
export function CareCalendarView(){
  const locale=useLocale(),fa=locale==="fa";const pets=usePetStore(s=>s.pets),active=usePetStore(s=>s.activePetId);const [selected,setSelected]=useState<string|null>(null);
  const petId=selected??active??pets[0]?.id;
  const picker = pets.length > 1 ? <label className="calendar-toolbar__pet"><span>{fa?"حیوان":"Pet"}</span><select value={petId??""} onChange={e=>setSelected(e.target.value)}>{pets.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label> : null;
  return petId?<PetCareCalendarView key={petId} petId={petId} toolbar={picker}/>:<Link href={`/${locale}/pets`}>{fa?"برای مشاهده تقویم، حیوان خانگی را انتخاب کنید.":"Choose a pet to view its calendar."}</Link>;
}
