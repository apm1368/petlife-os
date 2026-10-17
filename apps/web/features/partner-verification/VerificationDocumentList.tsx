"use client";
import type {ReactNode} from "react";
import {useLocale,useTranslations} from "next-intl";
import {ContextSurface} from "@petlife/ui";
import type {VerificationDocument} from "@/services/partner-verification.service";
export function VerificationDocumentList({documents,actions}:{documents:VerificationDocument[];actions?:(document:VerificationDocument)=>ReactNode}){
 const t=useTranslations("partnerVerification"),locale=useLocale(),date=(v:string)=>new Intl.DateTimeFormat(locale==="fa"?"fa-IR":"en-US",{dateStyle:"medium",timeStyle:"short"}).format(new Date(v));
 return <section className="space-y-3"><h2 className="text-section-title">{t("documents")}</h2>{documents.length===0&&<p>{t("emptyDocuments")}</p>}{documents.map(doc=><ContextSurface key={doc.id} className="space-y-2"><h3 className="font-medium">{t(`documentKinds.${doc.kind}`)} · {t(`documentStatuses.${doc.status}`)}</h3><p>{t(`expiry.${doc.expiryState}`)}</p>{doc.expiresAt&&<p>{t("expires",{date:date(doc.expiresAt)})}</p>}<p>{t("uploaded",{date:date(doc.submittedAt)})}</p><p>{t("fileSize",{size:new Intl.NumberFormat(locale,{maximumFractionDigits:1}).format(doc.fileSizeBytes/1024)})}</p>{doc.reviewNote&&<p>{doc.reviewNote}</p>}{doc.reviewedAt&&<p>{t("reviewed",{date:date(doc.reviewedAt)})}</p>}{actions?.(doc)}</ContextSurface>)}</section>
}
