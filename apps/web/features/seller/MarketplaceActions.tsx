"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Select } from "@petlife/ui";
import type { MarketplaceChannelAccountDto, SellerOsOfferDto } from "@petlife/types";
import { useSellerStore } from "@/stores/seller-store";
import { sellerOsService } from "@/services/seller-os.service";
const SYNC_FIELDS=["syncEnabled","inventorySyncEnabled","priceSyncEnabled","orderSyncEnabled"] as const;
export function ChannelSettings({sellerId,channel,onSaved}:{sellerId:string;channel:MarketplaceChannelAccountDto;onSaved:()=>Promise<void>}) {
 const t=useTranslations("rollout.marketplace"); const role=useSellerStore(s=>s.context?.active?.role);const [draft,setDraft]=useState({syncEnabled:channel.syncEnabled,inventorySyncEnabled:channel.inventorySyncEnabled,priceSyncEnabled:channel.priceSyncEnabled,orderSyncEnabled:channel.orderSyncEnabled});const [busy,setBusy]=useState(false);const [failed,setFailed]=useState(false);
 if(!role||!["OWNER","ADMIN"].includes(role))return null;
 const supported=(key:typeof SYNC_FIELDS[number])=>key==="syncEnabled"||key==="inventorySyncEnabled"&&channel.capabilities.supportsInventoryPush||key==="priceSyncEnabled"&&channel.capabilities.supportsPricePush||key==="orderSyncEnabled"&&channel.capabilities.supportsOrderPull;
 return <details><summary>{t("settings")}</summary><form className="mt-4 flex flex-col gap-3" onSubmit={async e=>{e.preventDefault();setBusy(true);setFailed(false);try{await sellerOsService.updateChannel(sellerId,channel.id,draft);await onSaved();}catch{setFailed(true);}finally{setBusy(false);}}}>{SYNC_FIELDS.filter(supported).map(key=><label key={key} className="flex items-center gap-2"><input type="checkbox" checked={draft[key]} onChange={e=>setDraft({...draft,[key]:e.target.checked})}/>{t(key)}</label>)}<Button type="submit" isLoading={busy}>{t("save")}</Button>{failed?<p role="alert">{t("failed")}</p>:null}</form></details>;
}
export function CreateMarketplaceListing({sellerId,channels,onSaved}:{sellerId:string;channels:MarketplaceChannelAccountDto[];onSaved:()=>Promise<void>}) {
 const t=useTranslations("rollout.marketplace");const role=useSellerStore(s=>s.context?.active?.role);const [offers,setOffers]=useState<SellerOsOfferDto[]|null>(null);const [offer,setOffer]=useState("");const [channel,setChannel]=useState("");const [busy,setBusy]=useState(false);const [failed,setFailed]=useState(false);
 if(!role||!["OWNER","ADMIN","CATALOG_MANAGER"].includes(role)||!channels.some(c=>c.capabilities.supportsListingPublish))return null;
 async function load(){if(offers)return;setBusy(true);setFailed(false);try{setOffers((await sellerOsService.listOffers(sellerId,{pageSize:100})).items);}catch{setFailed(true);}finally{setBusy(false);}}
 return <details onToggle={e=>{if(e.currentTarget.open)void load();}}><summary>{t("create")}</summary><form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={async e=>{e.preventDefault();if(!offer||!channel)return;setBusy(true);setFailed(false);try{await sellerOsService.createMarketplaceListing(sellerId,{marketplaceChannelAccountId:channel,sellerOfferId:offer});setOffer("");await onSaved();}catch{setFailed(true);}finally{setBusy(false);}}}><Select label={t("channel")} value={channel} onChange={e=>setChannel(e.target.value)} options={[{value:"",label:t("choose")},...channels.filter(c=>c.capabilities.supportsListingPublish).map(c=>({value:c.id,label:c.displayName??c.provider}))]}/><Select label={t("offer")} value={offer} onChange={e=>setOffer(e.target.value)} options={[{value:"",label:t("choose")},...(offers??[]).map(o=>({value:o.id,label:[o.productTitle,o.variantTitle].filter(Boolean).join(" · ")}))]}/><Button type="submit" isLoading={busy} disabled={!offer||!channel}>{t("create")}</Button>{failed?<div role="alert"><p>{t("failed")}</p><Button variant="ghost" onClick={()=>void load()}>{t("retry")}</Button></div>:null}</form></details>;
}
