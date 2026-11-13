"use client";
import Link from "next/link";
import {useLocale,useTranslations} from "next-intl";
import { Button, ContextSurface, ExternalLink } from "@petlife/ui";
import {formatCurrency} from "@/lib/currency/format-currency";
import {useInstantFormat} from "@/lib/date/use-instant-format";
import {travelExternalService,type ExternalStay,type ExternalStayContext} from "@/services/travel-external.service";

export function matchingExternalPrice(stay:ExternalStay,context:ExternalStayContext){
 const quote=stay.price;
 if(quote?.state!=="FRESH"||quote.priceIrr===null||quote.priceIrr===undefined||!quote.context||!context.checkIn||!context.checkOut)return null;
 if(quote.expiresAt&&(!Number.isFinite(Date.parse(quote.expiresAt))||Date.parse(quote.expiresAt)<=Date.now()))return null;
 if(quote.context.checkIn!==context.checkIn||quote.context.checkOut!==context.checkOut||(quote.context.guests??2)!==(context.guests??2)||(quote.context.pets??0)!==(context.pets??0))return null;
 return quote;
}
type Locale="fa"|"en"|"de"|"es"|"ar"|"nl";
const RELATIVE_LOCALE:Record<Locale,string>={fa:"fa-IR",en:"en-GB",de:"de-DE",es:"es-ES",ar:"ar",nl:"nl-NL"};

/** "3 hours ago" in the reader's language, for how old a synced fact is. */
export function timeAgo(iso:string,locale:Locale,now=Date.now()){
 const seconds=Math.round((Date.parse(iso)-now)/1000),rtf=new Intl.RelativeTimeFormat(RELATIVE_LOCALE[locale]??"en-GB",{numeric:"auto"});
 const abs=Math.abs(seconds);
 if(abs<3600)return rtf.format(Math.round(seconds/60),"minute");
 if(abs<86400)return rtf.format(Math.round(seconds/3600),"hour");
 return rtf.format(Math.round(seconds/86400),"day");
}

type PetFact="species"|"size"|"indoor"|"fee"|"approval";
/**
 * The five things a pet owner needs before booking. A value is shown only when the source states it; everything else
 * reads "unknown" (Jajiga publishes none of them, only that a stay is pet-friendly).
 */
export function petFacts(policy:Record<string,unknown>|null,t:(key:string,values?:Record<string,string>)=>string,money:(irr:number)=>string):Record<PetFact,string>{
 const p=policy??{},unknown=t("petFacts.unknown");
 const yesNo=(v:unknown)=>v===true?t("petFacts.yes"):v===false?t("petFacts.no"):unknown;
 const dogs=p.dogs,cats=p.cats;
 const species=typeof dogs==="boolean"||typeof cats==="boolean"?`${t("petFacts.dogs")}: ${yesNo(dogs)} · ${t("petFacts.cats")}: ${yesNo(cats)}`:unknown;
 const size=typeof p.sizeLimit==="string"&&p.sizeLimit!=="UNKNOWN"?t("petFacts.upTo",{limit:p.sizeLimit}):unknown;
 const fee=typeof p.extraFeeIrr==="number"?(p.extraFeeIrr===0?t("petFacts.noFee"):money(p.extraFeeIrr)):unknown;
 const approval=p.approvalRequired===true?t("petFacts.approvalNeeded"):p.approvalRequired===false?t("petFacts.approvalNotNeeded"):unknown;
 return {species,size,indoor:yesNo(p.indoor),fee,approval};
}

export function ExternalStayCard({stay,context={},saved,onFavorite,busy=false,available=true,detail=false,extra}:{stay:ExternalStay;context?:ExternalStayContext;saved?:boolean;onFavorite?:()=>void;busy?:boolean;available?:boolean;detail?:boolean;extra?:React.ReactNode}){
 const t=useTranslations("externalTravel"),locale=useLocale() as Locale,fmt=useInstantFormat();
 // "Verified" is only ever said when opetlife staff checked it; a source's own marker is reported as the source's claim.
 const verifiedByUs=stay.pet.authority==="ADMIN_CONFIRMED";
 const facts=petFacts(stay.pet.policy,(key,values)=>t(key as never,values as never),amount=>formatCurrency(amount,locale));
 const price=matchingExternalPrice(stay,context),query=new URLSearchParams();for(const[key,value]of Object.entries(context)){if(value!==undefined)query.set(key,String(value))}
 const suffix=query.toString()?`?${query}`:"";
 const date=(value:string)=>fmt.dateTime(value);
 const money=(amount:number,currency:string)=>currency==="IRR"?formatCurrency(amount,locale):`${new Intl.NumberFormat(locale).format(amount)} ${currency}`;
 return <ContextSurface className="min-w-0 space-y-3"><header><p className="text-metadata text-text-secondary">{t("browser.hint")}</p><h2 className="text-section-title break-words">{stay.title??t("unnamed")}</h2><p>{[stay.city,stay.area].filter(Boolean).join(" · ")}</p></header>
 <p className="font-medium">{stay.pet.policyStatus==="CONFIRMED_ALLOWED"?(verifiedByUs?t("petVerifiedByOpetlife"):t("petPerListing")):t(`policy.${stay.pet.policyStatus}`)}</p>{stay.pet.summary&&<p>{stay.pet.summary}</p>}
 {stay.pet.policyStatus!=="CONFIRMED_NOT_ALLOWED"&&<dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-sm" aria-label={t("petFacts.title")}>{(["species","size","indoor","fee","approval"] as const).map(key=><div key={key} className="contents"><dt className="text-text-secondary">{t(`petFacts.${key}`)}</dt><dd>{facts[key]}</dd></div>)}</dl>}{stay.status==="STALE"&&<p>{t("staleListing")}</p>}
 {price?<div className="space-y-1"><p className="text-section-title"><bdi>{money(price.priceIrr!,price.currency??"IRR")}</bdi></p><p>{t(`basis.${price.priceBasis==="PER_NIGHT"?"PER_NIGHT":price.priceBasis==="TOTAL_STAY"?"TOTAL_STAY":"UNKNOWN"}`)}</p>{price.observedAt&&<p>{t("observed",{date:date(price.observedAt)})}</p>}{price.freshness==="AGING"&&<p>{t("agingPrice")}</p>}<p>{t(`availability.${price.availability?.state==="SOURCE_REPORTED_AVAILABLE"?"SOURCE_REPORTED_AVAILABLE":price.availability?.state==="SOURCE_REPORTED_UNAVAILABLE"?"SOURCE_REPORTED_UNAVAILABLE":"UNKNOWN"}`)}</p></div>:<p>{t((stay.price?.state==="STALE"||!!stay.price?.expiresAt&&Date.parse(stay.price.expiresAt)<=Date.now())?"stalePrice":context.checkIn&&context.checkOut?"noPrice":"datesRequired")}</p>}
 {!price&&stay.fromPrice&&["FRESH","AGING"].includes(stay.fromPrice.freshness)&&<div><p className="font-medium"><bdi>{t("startingPrice",{amount:money(stay.fromPrice.priceIrr,stay.fromPrice.currency)})}</bdi>{stay.fromPrice.priceBasis==="PER_NIGHT"?` · ${t("basis.PER_NIGHT")}`:""}</p><p className="text-text-secondary">{t("updatedAgo",{ago:timeAgo(stay.lastSuccessfulSyncAt??stay.fromPrice.observedAt,locale)})}</p></div>}
 {detail&&<><p className="text-text-secondary">{t("lastSeen",{date:date(stay.lastSeenAt)})}</p>{stay.lastSuccessfulSyncAt&&<p className="text-text-secondary">{t("lastSuccessfulSync",{date:date(stay.lastSuccessfulSyncAt)})}</p>}</>}
 {!price&&<p className="text-text-secondary">{t(`availability.${stay.availabilityStatus==="SOURCE_REPORTED_AVAILABLE"?"SOURCE_REPORTED_AVAILABLE":stay.availabilityStatus==="SOURCE_REPORTED_UNAVAILABLE"?"SOURCE_REPORTED_UNAVAILABLE":"UNKNOWN"}`)}</p>}
 {detail&&<>{stay.addressText&&<p>{stay.addressText}</p>}{stay.capacity!==null&&<p>{t("capacity",{count:new Intl.NumberFormat(locale).format(stay.capacity)})}</p>}{stay.pet.evidenceText&&<section><h3 className="font-medium">{t("evidence")}</h3><p>{stay.pet.evidenceType==="SOURCE_FILTER"&&stay.source.sourceType!=="MANUAL_ENTRY"?t("evidenceListingFilter"):stay.pet.evidenceText}</p>{stay.pet.evidenceObservedAt&&<p>{t("observed",{date:date(stay.pet.evidenceObservedAt)})}</p>}</section>}</>}
 {!available?<p>{t("unavailable")}</p>:<div className="flex flex-wrap gap-3">{!detail&&<Link className="underline" href={`/${locale}/travel/external/${stay.id}${suffix}`}>{t("details")}</Link>}<a className="inline-flex min-h-11 items-center gap-2 rounded-full bg-brand-solid px-5 font-bold text-on-brand" href={travelExternalService.outboundUrl(stay.id,context)} target="_blank" rel="noopener nofollow">{t("viewStay")}<ExternalLink size={16} aria-hidden="true"/><span className="sr-only"> {t("opensNewTab")}</span></a></div>}
 {onFavorite&&<Button variant="secondary" disabled={busy} onClick={onFavorite}>{t(saved?"unsave":"save")}</Button>}{extra}
 </ContextSurface>
}
