"use client";
import {useEffect,useRef,useState} from "react";
import Link from "next/link";
import {useLocale,useTranslations} from "next-intl";
import {Button,ContextSurface,Dialog} from "@petlife/ui";
import {InsuranceVerificationStatus,type InsuranceProductDto} from "@petlife/types";
import {useAdminStore} from "@/stores/admin-store";
import {adminInsuranceService,type InsuranceProductInput} from "@/services/admin-insurance.service";
import {InsuranceProductForm,insuranceNumericFields} from "./InsuranceProductForm";
import {formatCurrency} from "@/lib/currency/format-currency";
export function AdminInsuranceProducts({providerId}:{providerId:string}){return <InsuranceProductsContent key={providerId} providerId={providerId}/>}
function InsuranceProductsContent({providerId}:{providerId:string}){
 const t=useTranslations("adminInsuranceProducts"),statusT=useTranslations("insurance.verificationStatus"),locale=useLocale() as "fa"|"en";
 const context=useAdminStore(s=>s.context),view=!!context?.permissions.includes("insurance.view"),manage=!!context?.permissions.includes("insurance.manage");
 const [page,setPage]=useState(1),[rows,setRows]=useState<InsuranceProductDto[]>([]),[total,setTotal]=useState(0),[country,setCountry]=useState(""),[providerName,setProviderName]=useState("");
 const [loading,setLoading]=useState(true),[failed,setFailed]=useState(false),[revision,setRevision]=useState(0),[busy,setBusy]=useState(false),[saveFailed,setSaveFailed]=useState(false),[saved,setSaved]=useState(false),[editing,setEditing]=useState<InsuranceProductDto|null>(null),[creating,setCreating]=useState(false);
 const [action,setAction]=useState<{product:InsuranceProductDto;status?:InsuranceVerificationStatus}|null>(null);
 const alive=useRef(true);useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 useEffect(()=>{if(!view)return;const controller=new AbortController();setLoading(true);setFailed(false);Promise.all([adminInsuranceService.provider(providerId,controller.signal),adminInsuranceService.products(providerId,page,controller.signal)]).then(([provider,result])=>{if(!controller.signal.aborted){setCountry(provider.country);setProviderName(provider.name);setRows(result.items);setTotal(result.total)}}).catch(()=>{if(!controller.signal.aborted)setFailed(true)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});return()=>controller.abort()},[providerId,page,view,revision]);
 async function mutate(task:()=>Promise<void>){if(!manage||busy)return false;setBusy(true);setSaveFailed(false);setSaved(false);try{await task();if(alive.current){setSaved(true);setAction(null)}return true}catch{if(alive.current)setSaveFailed(true);return false}finally{if(alive.current)setBusy(false)}}
 async function edit(id:string){if(!manage||busy)return;setBusy(true);setSaveFailed(false);setSaved(false);try{const product=await adminInsuranceService.product(id);if(alive.current){setEditing(product);setCreating(false)}}catch{if(alive.current)setSaveFailed(true)}finally{if(alive.current)setBusy(false)}}
 async function save(body:InsuranceProductInput){return mutate(async()=>{if(editing){const update={name:body.name,speciesEligibility:body.speciesEligibility,coverageTypes:body.coverageTypes,coverageSummary:body.coverageSummary,exclusions:body.exclusions,termsSource:body.termsSource,termsUrl:body.termsUrl,...Object.fromEntries(insuranceNumericFields.filter(key=>body[key]!==undefined).map(key=>[key,body[key]]))};await adminInsuranceService.updateProduct(editing.id,update)}else await adminInsuranceService.createProduct(providerId,body);if(alive.current){setEditing(null);setCreating(false);setRevision(v=>v+1)}})}
 async function confirm(){if(!action)return;await mutate(async()=>{if(action.status)await adminInsuranceService.verifyProduct(action.product.id,action.status);else await adminInsuranceService.listProduct(action.product.id,!action.product.isPubliclyListed);if(alive.current)setRevision(v=>v+1)})}
 if(!context)return <p role="status">{t("loading")}</p>;if(!view)return <p>{t("forbidden")}</p>;
 return <div className="space-y-5"><header><h1 className="text-page-title">{t("title")}</h1><p>{providerName}</p></header><Link className="underline" href={`/${locale}/admin/insurance/providers/${providerId}`}>{t("back")}</Link>
 {saved&&<p role="status">{t("saved")}</p>}{saveFailed&&!action&&<p role="alert">{t("saveFailed")}</p>}
 {failed?<div><p role="alert">{t("loadFailed")}</p><Button onClick={()=>setRevision(v=>v+1)}>{t("retry")}</Button></div>:loading?<p role="status">{t("loading")}</p>:<>
 {manage&&<Button variant="secondary" disabled={busy} onClick={()=>{setEditing(null);setCreating(v=>!v);setSaveFailed(false)}}>{t("create")}</Button>}
 {manage&&(editing||creating)&&<ContextSurface><h2 className="text-section-title">{t(editing?"edit":"create")}</h2><InsuranceProductForm key={editing?.id??"new"} product={editing??undefined} country={country} busy={busy} onSave={save}/></ContextSurface>}
 {rows.length===0?<p>{t("empty")}</p>:rows.map(product=><ContextSurface key={product.id} className="space-y-3"><h2 className="text-section-title">{product.name}</h2><p>{statusT(product.status)} · {t(product.isPubliclyListed?"listed":"unlisted")}</p><p>{product.coverageSummary}</p><h3 className="font-medium">{t("exclusions")}</h3>{product.exclusions.length===0?<p>{t("noExclusions")}</p>:<ul>{product.exclusions.map((item,index)=><li key={index}>{item}</li>)}</ul>}{product.premiumMinIrr!==null&&<p>{t("premiumFrom",{amount:formatCurrency(product.premiumMinIrr,locale)})}</p>}
 {manage&&<div className="flex flex-wrap gap-2"><Button disabled={busy} variant="secondary" onClick={()=>void edit(product.id)}>{t("edit")}</Button>{Object.values(InsuranceVerificationStatus).filter(status=>status!==product.status).map(status=><Button key={status} disabled={busy} variant="secondary" onClick={()=>{setSaveFailed(false);setAction({product,status})}}>{t("setStatus",{status:statusT(status)})}</Button>)}<Button disabled={busy} variant="secondary" onClick={()=>{setSaveFailed(false);setAction({product})}}>{t(product.isPubliclyListed?"hide":"publish")}</Button></div>}
 </ContextSurface>)}<div className="flex gap-3"><Button disabled={page===1} onClick={()=>setPage(v=>v-1)}>{t("previous")}</Button><span>{new Intl.NumberFormat(locale).format(page)}</span><Button disabled={page*20>=total} onClick={()=>setPage(v=>v+1)}>{t("next")}</Button></div>
 </>}
 <Dialog open={action!==null} title={t("confirmTitle")} onClose={()=>{if(!busy)setAction(null)}}><p>{t("confirmBody",{name:action?.product.name??""})}</p>{action?.status&&<p>{statusT(action.status)}</p>}{saveFailed&&<p role="alert">{t("saveFailed")}</p>}<div className="mt-4 flex gap-3"><Button disabled={busy} onClick={()=>void confirm()}>{t("confirm")}</Button><Button disabled={busy} variant="secondary" onClick={()=>setAction(null)}>{t("cancel")}</Button></div></Dialog>
 </div>
}
