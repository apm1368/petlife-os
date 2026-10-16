"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, Input } from "@petlife/ui";
import { householdsService } from "@/services/households.service";
export function HouseholdNameEditor({id,name,onSaved}:{id:string;name:string;onSaved:()=>Promise<void>}) {
 const t=useTranslations("rollout.household");const [value,setValue]=useState(name);const [busy,setBusy]=useState(false);const [failed,setFailed]=useState(false);
 return <ContextSurface><details><summary>{t("title")}</summary><form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={async e=>{e.preventDefault();if(!value.trim()||busy)return;setBusy(true);setFailed(false);try{await householdsService.update(id,{name:value.trim()});await onSaved();}catch{setFailed(true);}finally{setBusy(false);}}}><Input label={t("name")} required maxLength={200} value={value} onChange={e=>setValue(e.target.value)}/><Button type="submit" isLoading={busy} disabled={!value.trim()||value.trim()===name}>{t("save")}</Button>{failed?<p role="alert">{t("failed")}</p>:null}</form></details></ContextSurface>;
}
