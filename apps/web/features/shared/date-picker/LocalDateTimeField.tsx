"use client";
import {useLocale,useTranslations} from "next-intl";
import {Button,Select} from "@petlife/ui";
import {DateField} from "./DateField";

/** Local wall time with a localized calendar and exact minutes; the API value remains YYYY-MM-DDTHH:mm. */
export function LocalDateTimeField({label,value,onChange,className}:{label:string;value:string;onChange:(value:string)=>void;className?:string}){
 const locale=useLocale(),t=useTranslations("localDateTime");
 const [day="",rawClock="09:00"]=value.split("T");
 const [hour="09",minute="00"]=rawClock.slice(0,5).split(":");
 const digits=new Intl.NumberFormat(locale==="fa"?"fa-IR":"en-US",{minimumIntegerDigits:2});
 const options=(count:number)=>Array.from({length:count},(_,index)=>({value:String(index).padStart(2,"0"),label:digits.format(index)}));
 return <fieldset className={`min-w-0 space-y-2 ${className??""}`}><legend>{label}</legend><DateField label={t("date")} min="1900-01-01" value={day} onChange={selected=>onChange(selected?`${selected}T${hour}:${minute}`:"")}/><div className="grid grid-cols-2 gap-3"><Select label={t("hour")} value={hour} disabled={!day} onChange={e=>onChange(`${day}T${e.target.value}:${minute}`)} options={options(24)}/><Select label={t("minute")} value={minute} disabled={!day} onChange={e=>onChange(`${day}T${hour}:${e.target.value}`)} options={options(60)}/></div>{!day&&<p className="text-text-secondary">{t("chooseDate")}</p>}{value&&<Button type="button" variant="secondary" onClick={()=>onChange("")}>{t("clear")}</Button>}</fieldset>
}
