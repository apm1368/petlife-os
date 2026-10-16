"use client";
import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, EmptyState, Input } from "@petlife/ui";
import type { AdminSearchResultDto } from "@petlife/types";
import { adminService } from "@/services/admin.service";
import { useAdminStore } from "@/stores/admin-store";
import Link from "@/features/navigation/localized-link";
import { formatCurrency } from "@/lib/currency/format-currency";
export function AdminOperationalSearch(){
 const t=useTranslations("rollout.adminSearch"); const locale=useLocale() as "fa"|"en";const context=useAdminStore(s=>s.context);const generation=useRef(0);
 const [query,setQuery]=useState("");const [result,setResult]=useState<AdminSearchResultDto|null>(null);const [busy,setBusy]=useState(false);const [failed,setFailed]=useState(false);
 if(!context?.permissions.includes("customer.view"))return null;
 return <section className="approved-admin__panel"><form className="flex flex-wrap items-end gap-3" role="search" onSubmit={async e=>{e.preventDefault();if(query.trim().length<2)return;const id=++generation.current;setBusy(true);setFailed(false);setResult(null);try{const data=await adminService.search(query.trim());if(id===generation.current)setResult(data);}catch{if(id===generation.current)setFailed(true);}finally{if(id===generation.current)setBusy(false);}}}><Input label={t("title")} value={query} minLength={2} required onChange={e=>setQuery(e.target.value)} className="min-w-0 flex-1"/><Button type="submit" isLoading={busy}>{t("search")}</Button></form>{failed?<p role="alert" className="mt-4">{t("failed")}</p>:null}{result?<div className="mt-5 flex flex-col gap-4">{result.customers.map(item=><Link key={item.id} href={`/admin/customers/${item.id}`}><b>{item.displayName}</b><span className="ms-3"><bdi dir="ltr">{item.emailMasked??item.phoneMasked}</bdi></span></Link>)}{context.permissions.includes("commerce.view")?result.orders.map(item=><Link key={item.id} href={`/admin/commerce/orders/${item.id}`}>{t("order")} · <bdi dir="ltr">{item.id.slice(-8)}</bdi> · {formatCurrency(item.totalAmount,locale)}</Link>):null}{context.permissions.includes("support.view")?result.supportCases.map(item=><Link key={item.id} href={`/admin/support/${item.id}`}>{item.subject}</Link>):null}{!result.customers.length&&(!context.permissions.includes("commerce.view")||!result.orders.length)&&(!context.permissions.includes("support.view")||!result.supportCases.length)?<EmptyState title={t("empty")}/>:null}</div>:null}</section>;
}
