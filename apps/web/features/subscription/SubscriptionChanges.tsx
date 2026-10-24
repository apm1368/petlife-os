"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, Skeleton } from "@petlife/ui";
import type { SubscriptionChangeDto } from "@petlife/types";
import { subscriptionService } from "@/services/subscription.service";
import { useInstantFormat } from "@/lib/date/use-instant-format";
export function SubscriptionChanges({householdId}:{householdId:string}) {
 const t=useTranslations("rollout.subscriptionHistory");const locale=useLocale();const fmt=useInstantFormat();const [items,setItems]=useState<SubscriptionChangeDto[]|null>(null);const [busy,setBusy]=useState(false);const [failed,setFailed]=useState(false);
 async function load(){setBusy(true);setFailed(false);try{setItems(await subscriptionService.getChanges(householdId));}catch{setFailed(true);}finally{setBusy(false);}}
 return <ContextSurface><details onToggle={e=>{if(e.currentTarget.open&&!items&&!busy)void load();}}><summary>{t("title")}</summary><div className="mt-4 flex flex-col gap-4">{failed?<div role="alert"><p>{t("failed")}</p><Button onClick={()=>void load()}>{t("retry")}</Button></div>:null}{busy&&!items?<Skeleton className="h-24 w-full"/>:null}{items?.length===0?<EmptyState title={t("empty")}/>:null}{items?.map(item=><article key={item.id} className="border-t border-border-subtle py-4"><h3 className="font-bold">{t(`types.${item.type}`)}</h3><time className="text-metadata">{fmt.dateTime(item.createdAt)}</time>{item.toPlan?<p>{locale==="fa"?item.toPlan.nameFa:item.toPlan.nameEn}</p>:null}{item.effectiveAt?<p>{t("effective",{date:fmt.dateTime(item.effectiveAt)})}</p>:null}{item.note?<p>{item.note}</p>:null}</article>)}</div></details></ContextSurface>;
}
