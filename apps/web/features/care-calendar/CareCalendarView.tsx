"use client";
import { useState } from "react";
import { useLocale } from "next-intl";
import Link from "next/link";
import { usePetStore } from "@/stores/pet-store";
import { PetCareCalendarView } from "./PetCareCalendarView";
export function CareCalendarView(){
  const locale=useLocale(),fa=locale==="fa";const pets=usePetStore(s=>s.pets),active=usePetStore(s=>s.activePetId);const [selected,setSelected]=useState<string|null>(null);
  const petId=selected??active??pets[0]?.id;
  return <div className="flex flex-col gap-5"><label className="max-w-sm text-sm">{fa?"حیوان خانگی":"Pet"}<select className="mt-2 block w-full rounded border p-3" value={petId??""} onChange={e=>setSelected(e.target.value)}>{pets.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>{petId?<PetCareCalendarView key={petId} petId={petId}/>:<Link href={`/${locale}/pets`}>{fa?"برای مشاهده تقویم، حیوان خانگی را انتخاب کنید.":"Choose a pet to view its calendar."}</Link>}</div>;
}
