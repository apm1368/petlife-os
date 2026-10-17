"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, Input, Select } from "@petlife/ui";
import { TravelMode, type TripDto } from "@petlife/types";
import { travelService } from "@/services/travel.service";
import { usePetAccess } from "@/hooks/use-pet-access";
import { DateField } from "@/features/shared/date-picker/DateField";
export function TripEditor({petId,trip,onSaved}:{petId:string;trip:TripDto;onSaved:()=>Promise<void>}) {
 const t=useTranslations("rollout.trip"); const travelT=useTranslations("travel");const {access}=usePetAccess(petId);
 const [origin,setOrigin]=useState(trip.originCity??"");const [destination,setDestination]=useState(trip.destinationCity??"");const [notes,setNotes]=useState(trip.notes??"");const [mode,setMode]=useState(trip.travelMode??TravelMode.OTHER);const [depart,setDepart]=useState(trip.departAt.slice(0,10));const [back,setBack]=useState(trip.returnAt?.slice(0,10)??"");const [busy,setBusy]=useState(false);const [failed,setFailed]=useState(false);
 if(!access?.canEditIdentity||trip.status==="COMPLETED"||trip.status==="CANCELLED")return null;
 return <ContextSurface><details><summary>{t("title")}</summary><form className="mt-4 flex flex-col gap-4" onSubmit={async e=>{e.preventDefault();if(!depart||back&&back<depart)return;setBusy(true);setFailed(false);try{await travelService.update(petId,trip.id,{originCity:origin.trim()||undefined,destinationCity:destination.trim()||undefined,notes:notes.trim()||undefined,travelMode:mode,departAt:new Date(`${depart}T12:00:00+03:30`).toISOString(),returnAt:back?new Date(`${back}T12:00:00+03:30`).toISOString():undefined});await onSaved();}catch{setFailed(true);}finally{setBusy(false);}}}><Input label={t("origin")} value={origin} onChange={e=>setOrigin(e.target.value)}/><Input label={t("destination")} value={destination} onChange={e=>setDestination(e.target.value)}/><DateField label={t("depart")} value={depart} onChange={setDepart}/><DateField label={t("return")} value={back} onChange={setBack} min={depart}/><Select label={t("mode")} value={mode} onChange={e=>setMode(e.target.value as TravelMode)} options={Object.values(TravelMode).map(value=>({value,label:travelT(`travelMode.${value}`)}))}/><label className="flex flex-col gap-2">{t("notes")}<textarea rows={3} maxLength={4000} value={notes} onChange={e=>setNotes(e.target.value)} className="rounded border border-border-subtle bg-surface-elevated p-3"/></label><Button type="submit" isLoading={busy} disabled={!depart||!!back&&back<depart}>{t("save")}</Button>{failed?<p role="alert">{t("failed")}</p>:null}</form></details></ContextSurface>;
}
