"use client";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, ContextSurface, EmptyState, Input, Select } from "@petlife/ui";
import type { ProductSummaryDto } from "@petlife/types";
import { commerceService } from "@/services/commerce.service";
import { sellerOsService } from "@/services/seller-os.service";
import { useSellerStore } from "@/stores/seller-store";
/** Picks an existing canonical catalog variant; never creates a duplicate product. */
export function CreateSellerOffer({sellerId,onSaved}:{sellerId:string;onSaved:()=>Promise<void>}) {
 const t=useTranslations("rollout.sellerOffer");const active=useSellerStore(s=>s.context?.active);const request=useRef(0);
 const [query,setQuery]=useState("");const [products,setProducts]=useState<ProductSummaryDto[]|null>(null);const [variant,setVariant]=useState("");const [price,setPrice]=useState("");const [stock,setStock]=useState("0");const [busy,setBusy]=useState(false);const [failed,setFailed]=useState(false);const [saved,setSaved]=useState(false);
 if(!active||!["OWNER","ADMIN","CATALOG_MANAGER"].includes(active.role))return null;
 async function search(e:React.FormEvent){e.preventDefault();const n=++request.current;setBusy(true);setFailed(false);try{const result=await commerceService.searchProducts({search:query.trim(),pageSize:30});if(n===request.current){setProducts(result.items);setVariant("");}}catch{if(n===request.current)setFailed(true);}finally{if(n===request.current)setBusy(false);}}
 async function save(e:React.FormEvent){e.preventDefault();if(!variant||!Number.isSafeInteger(Number(price))||Number(price)<=0||!Number.isSafeInteger(Number(stock))||Number(stock)<0)return;setBusy(true);setFailed(false);setSaved(false);try{await sellerOsService.createOffer(sellerId,{productVariantId:variant,priceAmount:Number(price),initialOnHand:Number(stock)});setPrice("");setVariant("");setSaved(true);await onSaved();}catch{setFailed(true);}finally{setBusy(false);}}
 return <ContextSurface><details><summary className="cursor-pointer font-bold">{t("title")}</summary><div className="mt-4 flex flex-col gap-4"><form className="flex flex-wrap items-end gap-3" onSubmit={search}><Input label={t("search")} value={query} onChange={e=>setQuery(e.target.value)} required/><Button type="submit" isLoading={busy}>{t("find")}</Button></form>{products?.length===0?<EmptyState title={t("empty")}/>:null}{products?.length?<form className="flex flex-wrap items-end gap-3" onSubmit={save}><Select label={t("variant")} value={variant} onChange={e=>setVariant(e.target.value)} options={[{value:"",label:t("choose")},...products.filter(p=>p.variantId).map(p=>({value:p.variantId!,label:[p.title,p.variantTitle].filter(Boolean).join(" · ")}))]}/><Input label={t("price")} type="number" min={1} step={1} value={price} onChange={e=>setPrice(e.target.value)} required/><Input label={t("stock")} type="number" min={0} step={1} value={stock} onChange={e=>setStock(e.target.value)} required/><Button type="submit" disabled={!variant||busy}>{t("save")}</Button></form>:null}{failed?<p role="alert">{t("failed")}</p>:null}{saved?<p role="status">{t("saved")}</p>:null}</div></details></ContextSurface>;
}
