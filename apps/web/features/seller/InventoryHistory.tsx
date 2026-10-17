"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, EmptyState, Skeleton } from "@petlife/ui";
import type { InventoryMovementDto } from "@petlife/types";
import { sellerOsService } from "@/services/seller-os.service";
import { formatCount } from "@/lib/number/format-number";
import { useInstantFormat } from "@/lib/date/use-instant-format";
export function InventoryHistory({ sellerId, inventoryId }: { sellerId: string; inventoryId: string }) {
 const t=useTranslations("rollout.inventory"); const locale=useLocale() as "fa"|"en"; const fmt=useInstantFormat();
 const [open,setOpen]=useState(false);const [items,setItems]=useState<InventoryMovementDto[]|null>(null);const [page,setPage]=useState(0);const [total,setTotal]=useState(0);const [failed,setFailed]=useState(false);const [busy,setBusy]=useState(false);
 async function load(next:number){setBusy(true);setFailed(false);try{const result=await sellerOsService.getInventoryHistory(sellerId,inventoryId,next);setItems(prev=>next===1?result.items:[...(prev??[]),...result.items]);setTotal(result.total);setPage(next);}catch{setFailed(true);}finally{setBusy(false);}}
 return <div><Button variant="ghost" size="sm" onClick={()=>{setOpen(!open);if(!open&&!items)void load(1);}} aria-expanded={open}>{t("title")}</Button>{open?<div className="mt-3 flex flex-col gap-3">{failed?<div role="alert"><p>{t("failed")}</p><Button variant="secondary" onClick={()=>void load(page+1)}>{t("retry")}</Button></div>:null}{!items&&busy?<Skeleton className="h-24 w-full"/>:null}{items?.length===0?<EmptyState title={t("empty")}/>:null}{items?.map(item=><article key={item.id} className="flex flex-wrap justify-between gap-3 border-t border-border-subtle py-3"><div><time>{fmt.dateTime(item.createdAt)}</time><p>{item.actorDisplayName??t("system")}</p>{item.reason?<p className="text-metadata">{item.reason}</p>:null}</div><div><span>{t("before")}: {formatCount(item.quantityBefore,locale)}</span><span> ← {t("after")}: {formatCount(item.quantityAfter,locale)}</span></div></article>)}{items&&items.length<total?<Button variant="secondary" isLoading={busy} onClick={()=>void load(page+1)}>{t("more")}</Button>:null}</div>:null}</div>;
}
