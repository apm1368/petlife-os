"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {useLocale,useTranslations} from "next-intl";
import {Button,ContextSurface,Input} from "@petlife/ui";
import type {MarketplaceSettlementStatementDto} from "@petlife/types";
import {adminFinanceService} from "@/services/admin-finance.service";
import {useAdminStore} from "@/stores/admin-store";
import {formatCurrency} from "@/lib/currency/format-currency";

export function AdminMarketplaceStatementsView({statementId}:{statementId?:string}){
 const t=useTranslations("marketplaceStatements"),locale=useLocale() as "fa"|"en";
 const context=useAdminStore(s=>s.context),allowed=!!context?.permissions.includes("sellerFinance.view");
 const [rows,setRows]=useState<MarketplaceSettlementStatementDto[]>([]),[loading,setLoading]=useState(true),[failed,setFailed]=useState(false),[retry,setRetry]=useState(0),[q,setQ]=useState("");
 useEffect(()=>{if(!allowed)return;const controller=new AbortController();setRows([]);setFailed(false);setLoading(true);
 const request=statementId?adminFinanceService.getMarketplaceStatement(statementId,controller.signal).then(row=>[row]):adminFinanceService.listMarketplaceStatements(undefined,controller.signal);
 request.then(data=>{if(!controller.signal.aborted)setRows(data)}).catch(()=>{if(!controller.signal.aborted)setFailed(true)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});return()=>controller.abort();},[statementId,allowed,retry]);
 const date=(value:string)=>new Intl.DateTimeFormat(locale==="fa"?"fa-IR":"en-US",{dateStyle:"medium"}).format(new Date(value));
 const money=(value:number,currency:string)=>currency==="IRR"?formatCurrency(value,locale):`${new Intl.NumberFormat(locale,{maximumFractionDigits:2}).format(value)} ${currency}`;
 if(!context)return <p role="status">{t("loading")}</p>;
 if(!allowed)return <p>{t("forbidden")}</p>;
 const filtered=rows.filter(row=>`${row.id} ${t(`providers.${row.provider}`)} ${row.importedByAdmin.displayName??""}`.toLowerCase().includes(q.trim().toLowerCase()));
 return <div className="space-y-5"><header><h1 className="text-page-title">{t(statementId?"detailTitle":"title")}</h1><p>{t("intro")}</p></header>
 <nav className="flex flex-wrap gap-4">{statementId&&<Link className="underline" href={`/${locale}/admin/marketplace-statements`}>{t("back")}</Link>}<Link className="underline" href={`/${locale}/admin/reconciliation`}>{t("reconciliation")}</Link></nav>
 {!statementId&&<Input label={t("search")} value={q} onChange={e=>setQ(e.target.value)}/>}
 {failed?<ContextSurface><p role="alert">{t("failed")}</p><Button onClick={()=>setRetry(v=>v+1)}>{t("retry")}</Button></ContextSurface>:loading?<p role="status">{t("loading")}</p>:filtered.length===0?<p>{t("empty")}</p>:filtered.map(row=><ContextSurface key={row.id} className="space-y-4">
 <div className="flex flex-wrap justify-between gap-3"><h2 className="text-section-title">{t(`providers.${row.provider}`)}</h2><bdi>{money(row.totalAmount,row.currency)}</bdi></div><p>{date(row.periodStart)} — {date(row.periodEnd)}</p><p>{t("source",{source:t(`sources.${row.source}`)})}</p><p>{t("importedBy",{name:row.importedByAdmin.displayName??t("unnamed"),date:date(row.createdAt)})}</p>
 {statementId?<><p>{t("reference")} <bdi dir="ltr" className="break-all">{row.id}</bdi></p>{row.lines.length===0?<p>{t("emptyLines")}</p>:<div className="overflow-x-auto" role="region" aria-label={t("lines")} tabIndex={0}><table className="w-full text-start"><caption className="text-start font-medium">{t("lines")}</caption><thead><tr>{["order","amount","fee","confidence","description"].map(key=><th key={key} className="p-3 text-start">{t(`columns.${key}`)}</th>)}</tr></thead><tbody>{row.lines.map(line=><tr key={line.id} className="border-t border-border-subtle"><td className="p-3"><bdi dir="ltr">{line.externalOrderId}</bdi></td><td className="p-3 whitespace-nowrap"><bdi>{money(line.amount,row.currency)}</bdi></td><td className="p-3 whitespace-nowrap">{line.feeAmount===null?t("notProvided"):<bdi>{money(line.feeAmount,row.currency)}</bdi>}</td><td className="p-3">{t(`confidence.${line.feeConfidence}`)}</td><td className="p-3">{line.description??t("notProvided")}</td></tr>)}</tbody></table></div>}</>:<Link className="underline" href={`/${locale}/admin/marketplace-statements/${row.id}`}>{t("open")}</Link>}
 </ContextSurface>)}
 </div>
}
