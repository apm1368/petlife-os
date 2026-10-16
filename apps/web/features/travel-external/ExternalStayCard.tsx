"use client";
import Link from "next/link";
import {useLocale,useTranslations} from "next-intl";
import {Button,ContextSurface} from "@petlife/ui";
import {formatCurrency} from "@/lib/currency/format-currency";
import {travelExternalService,type ExternalStay,type ExternalStayContext} from "@/services/travel-external.service";

export function matchingExternalPrice(stay:ExternalStay,context:ExternalStayContext){
 const quote=stay.price;
 if(quote?.state!=="FRESH"||quote.priceIrr===null||quote.priceIrr===undefined||!quote.context||!context.checkIn||!context.checkOut)return null;
 if(quote.expiresAt&&(!Number.isFinite(Date.parse(quote.expiresAt))||Date.parse(quote.expiresAt)<=Date.now()))return null;
 if(quote.context.checkIn!==context.checkIn||quote.context.checkOut!==context.checkOut||(quote.context.guests??2)!==(context.guests??2)||(quote.context.pets??0)!==(context.pets??0))return null;
 return quote;
}
export function ExternalStayCard({stay,context={},saved,onFavorite,busy=false,available=true,detail=false,extra}:{stay:ExternalStay;context?:ExternalStayContext;saved?:boolean;onFavorite?:()=>void;busy?:boolean;available?:boolean;detail?:boolean;extra?:React.ReactNode}){
 const t=useTranslations("externalTravel"),locale=useLocale() as "fa"|"en";
 const price=matchingExternalPrice(stay,context),query=new URLSearchParams();for(const[key,value]of Object.entries(context)){if(value!==undefined)query.set(key,String(value))}
 const suffix=query.toString()?`?${query}`:"";
 const date=(value:string)=>new Intl.DateTimeFormat(locale==="fa"?"fa-IR":"en-US",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value));
 const money=(amount:number,currency:string)=>currency==="IRR"?formatCurrency(amount,locale):`${new Intl.NumberFormat(locale).format(amount)} ${currency}`;
 return <ContextSurface className="min-w-0 space-y-3"><header><p className="text-text-secondary">{locale==="fa"?stay.source.nameFa:stay.source.nameEn} · {t("externalSource")}</p><h2 className="text-section-title break-words">{stay.title??t("unnamed")}</h2><p>{[stay.city,stay.area].filter(Boolean).join(" · ")}</p></header>
 <p className="font-medium">{t(`policy.${stay.pet.policyStatus}`)}</p>{stay.pet.summary&&<p>{stay.pet.summary}</p>}{stay.status==="STALE"&&<p>{t("staleListing")}</p>}
 {price?<div className="space-y-1"><p className="text-section-title"><bdi>{money(price.priceIrr!,price.currency??"IRR")}</bdi></p><p>{t(`basis.${price.priceBasis==="PER_NIGHT"?"PER_NIGHT":price.priceBasis==="TOTAL_STAY"?"TOTAL_STAY":"UNKNOWN"}`)}</p>{price.observedAt&&<p>{t("observed",{date:date(price.observedAt)})}</p>}{price.freshness==="AGING"&&<p>{t("agingPrice")}</p>}<p>{t(`availability.${price.availability?.state==="SOURCE_REPORTED_AVAILABLE"?"SOURCE_REPORTED_AVAILABLE":price.availability?.state==="SOURCE_REPORTED_UNAVAILABLE"?"SOURCE_REPORTED_UNAVAILABLE":"UNKNOWN"}`)}</p></div>:<p>{t((stay.price?.state==="STALE"||!!stay.price?.expiresAt&&Date.parse(stay.price.expiresAt)<=Date.now())?"stalePrice":context.checkIn&&context.checkOut?"noPrice":"datesRequired")}</p>}
 {!price&&stay.fromPrice&&["FRESH","AGING"].includes(stay.fromPrice.freshness)&&<p>{t("fromPrice",{amount:money(stay.fromPrice.priceIrr,stay.fromPrice.currency),date:date(stay.fromPrice.observedAt)})}</p>}
 <p className="text-text-secondary">{t("lastSeen",{date:date(stay.lastSeenAt)})}</p>
 {detail&&<><p>{stay.descriptionSummary}</p>{stay.addressText&&<p>{stay.addressText}</p>}{stay.capacity!==null&&<p>{t("capacity",{count:new Intl.NumberFormat(locale).format(stay.capacity)})}</p>}{stay.pet.evidenceText&&<section><h3 className="font-medium">{t("evidence")}</h3><p>{stay.pet.evidenceText}</p>{stay.pet.evidenceObservedAt&&<p>{t("observed",{date:date(stay.pet.evidenceObservedAt)})}</p>}</section>}</>}
 {!available?<p>{t("unavailable")}</p>:<div className="flex flex-wrap gap-3">{!detail&&<Link className="underline" href={`/${locale}/travel/external/${stay.id}${suffix}`}>{t("details")}</Link>}<a className="underline" href={travelExternalService.outboundUrl(stay.id,context)} target="_blank" rel="noreferrer noopener">{t("viewSource")}</a></div>}
 {onFavorite&&<Button variant="secondary" disabled={busy} onClick={onFavorite}>{t(saved?"unsave":"save")}</Button>}{extra}
 </ContextSurface>
}
