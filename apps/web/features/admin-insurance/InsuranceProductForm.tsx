"use client";
import {useState} from "react";
import {useTranslations} from "next-intl";
import {Button,Input} from "@petlife/ui";
import {InsuranceCoverageType,PetSpecies,type InsuranceProductDto} from "@petlife/types";
import type {InsuranceNumericField,InsuranceProductInput} from "@/services/admin-insurance.service";
export const insuranceNumericFields=["minAgeMonths","maxAgeMonths","waitingPeriodDays","deductibleAmountIrr","annualLimitIrr","coinsurancePercent","premiumMinIrr","premiumMaxIrr"] as const;
export function InsuranceProductForm({product,country,busy,onSave}:{product?:InsuranceProductDto;country:string;busy:boolean;onSave:(body:InsuranceProductInput)=>Promise<boolean>}){
 const t=useTranslations("adminInsuranceProducts"),coverageT=useTranslations("insurance.coverageType");
 const [name,setName]=useState(product?.name??""),[summary,setSummary]=useState(product?.coverageSummary??""),[exclusions,setExclusions]=useState(product?.exclusions.join("\n")??""),[terms,setTerms]=useState(product?.termsSource??""),[url,setUrl]=useState(product?.termsUrl??"");
 const [species,setSpecies]=useState<PetSpecies[]>(product?.speciesEligibility??[]),[coverage,setCoverage]=useState<InsuranceCoverageType[]>(product?.coverageTypes??[]);
 const [numbers,setNumbers]=useState<Record<InsuranceNumericField,string>>(()=>Object.fromEntries(insuranceNumericFields.map(key=>[key,product?.[key]===null||product?.[key]===undefined?"":String(product[key])])) as Record<InsuranceNumericField,string>);
 const [invalid,setInvalid]=useState(false),[clearUnsupported,setClearUnsupported]=useState(false);
 async function save(){
  setInvalid(false);setClearUnsupported(false);
  const numeric:Partial<Record<InsuranceNumericField,number>>={};
  for(const key of insuranceNumericFields){if(numbers[key]===""){if(product?.[key]!==null&&product?.[key]!==undefined){setClearUnsupported(true);return}continue}const value=Number(numbers[key]);if(!Number.isSafeInteger(value)||value<0||(key==="coinsurancePercent"&&value>100)){setInvalid(true);return}numeric[key]=value}
  if((numeric.minAgeMonths!==undefined&&numeric.maxAgeMonths!==undefined&&numeric.minAgeMonths>numeric.maxAgeMonths)||(numeric.premiumMinIrr!==undefined&&numeric.premiumMaxIrr!==undefined&&numeric.premiumMinIrr>numeric.premiumMaxIrr)||!name.trim()||!summary.trim()){setInvalid(true);return}
  const excluded=exclusions.split("\n").map(value=>value.trim()).filter(Boolean);if(excluded.length>100){setInvalid(true);return}
  await onSave({name:name.trim(),country,speciesEligibility:species,coverageTypes:coverage,coverageSummary:summary.trim(),exclusions:excluded,termsSource:terms.trim(),termsUrl:url.trim(),...numeric});
 }
 return <form className="space-y-4" aria-label={t(product?"edit":"create")} onSubmit={e=>{e.preventDefault();void save()}}>
 {invalid&&<p role="alert">{t("invalid")}</p>}{clearUnsupported&&<p role="alert">{t("clearUnsupported")}</p>}
 <Input label={t("name")} required maxLength={200} value={name} onChange={e=>setName(e.target.value)}/>
 <fieldset className="space-y-2"><legend>{t("species")}</legend><div className="flex flex-wrap gap-4">{Object.values(PetSpecies).map(value=><label key={value} className="flex items-center gap-2"><input type="checkbox" checked={species.includes(value)} onChange={e=>setSpecies(old=>e.target.checked?[...old,value]:old.filter(item=>item!==value))}/>{t(`speciesLabels.${value}`)}</label>)}</div></fieldset>
 <fieldset className="space-y-2"><legend>{t("coverage")}</legend><div className="flex flex-wrap gap-4">{Object.values(InsuranceCoverageType).map(value=><label key={value} className="flex items-center gap-2"><input type="checkbox" checked={coverage.includes(value)} onChange={e=>setCoverage(old=>e.target.checked?[...old,value]:old.filter(item=>item!==value))}/>{coverageT(value)}</label>)}</div></fieldset>
 <label className="block">{t("summary")}<textarea className="block w-full" required maxLength={4000} value={summary} onChange={e=>setSummary(e.target.value)}/></label>
 <label className="block">{t("exclusions")}<textarea className="block w-full" value={exclusions} onChange={e=>setExclusions(e.target.value)}/></label><p className="text-text-secondary">{t("exclusionsHelp")}</p>
 <div className="grid gap-3 md:grid-cols-2">{insuranceNumericFields.map(key=><Input key={key} type="number" label={t(`fields.${key}`)} min={0} step={1} max={key==="coinsurancePercent"?100:Number.MAX_SAFE_INTEGER} value={numbers[key]} onChange={e=>setNumbers(old=>({...old,[key]:e.target.value}))}/>)}</div>
 <Input label={t("termsSource")} maxLength={300} value={terms} onChange={e=>setTerms(e.target.value)}/><Input type="url" dir="ltr" label={t("termsUrl")} maxLength={500} value={url} onChange={e=>setUrl(e.target.value)}/>
 <Button type="submit" disabled={busy||!name.trim()||!summary.trim()}>{t("save")}</Button>
 </form>
}
