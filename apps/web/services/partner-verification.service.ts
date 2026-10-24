import {apiFetch} from "@/lib/api/client";
import type { PartnerVerificationProfileDto, PartnerVerificationProfileInput } from "@petlife/types";
export const verificationStatuses=["NOT_STARTED","SUBMITTED","UNDER_REVIEW","NEEDS_INFORMATION","REJECTED","VERIFIED","SUSPENDED"] as const;
export type VerificationStatus=typeof verificationStatuses[number];
export type PartnerSubject="PROVIDER"|"SELLER";
export const verificationDocumentKinds=["NATIONAL_ID_CARD","BUSINESS_LICENSE","ENAMAD","LICENSE","IDENTITY","BUSINESS_REGISTRATION","BANK_INFO","OTHER"] as const;
export type VerificationDocumentKind=typeof verificationDocumentKinds[number];
export interface VerificationDocument {id:string;kind:VerificationDocumentKind;status:"PENDING"|"ACCEPTED"|"REJECTED"|"EXPIRED";mimeType:string;fileSizeBytes:number;expiresAt:string|null;expiryState:"NO_EXPIRY"|"EXPIRED"|"EXPIRING_SOON"|"VALID";reviewNote:string|null;rejectionReason:string|null;submittedAt:string;createdAt:string;reviewedAt:string|null;reviewedByAdminId:string|null}
export interface VerificationPolicy {version:string;mode:"MANUAL_DOCUMENT_REVIEW";officialLookup:"NOT_CONNECTED";requiredDocumentKinds:VerificationDocumentKind[];missingForSubmission:VerificationDocumentKind[];missingForApproval:VerificationDocumentKind[]}
export interface VerificationState {policy?:VerificationPolicy;status:VerificationStatus;lifecycle:"NOT_SUBMITTED"|"PENDING"|"UNDER_REVIEW"|"RESUBMISSION_REQUESTED"|"APPROVED"|"REJECTED"|"EXPIRED"|"SUSPENDED"|"EVIDENCE_INCOMPLETE";submittedAt:string|null;note:string|null;canSubmit:boolean;documents:VerificationDocument[]}
export interface VerificationDetail extends VerificationState {subjectType:PartnerSubject;id:string;name:string;kind:string;allowedTransitions:VerificationStatus[];profile?:PartnerVerificationProfileDto|null}
export interface VerificationQueueItem {subjectType:PartnerSubject;id:string;name:string;kind:string;status:VerificationStatus;submittedAt:string|null;waitingHours:number|null;documents:{pending:number;accepted:number;rejected:number;expired:number}}
export interface VerificationUpload {uploadUrl:string;headers?:Record<string,string>;key:string}
const admin="/admin/verification";
function portal(sellerId?:string){return sellerId?`/seller-organizations/${encodeURIComponent(sellerId)}/verification`:"/provider/verification"}
export const partnerVerificationService={
 profile:(sellerId?:string,signal?:AbortSignal)=>apiFetch<PartnerVerificationProfileDto|null>(`${portal(sellerId)}/profile`,{signal}),
 saveProfile:(body:PartnerVerificationProfileInput,sellerId?:string)=>apiFetch<PartnerVerificationProfileDto>(`${portal(sellerId)}/profile`,{method:"POST",body}),
 queue:(query:URLSearchParams,signal?:AbortSignal)=>apiFetch<VerificationQueueItem[]>(`${admin}/queue?${query}`,{signal}),
 detail:(subject:PartnerSubject,id:string,signal?:AbortSignal)=>apiFetch<VerificationDetail>(`${admin}/${subject}/${encodeURIComponent(id)}`,{signal}),
 transition:(subject:PartnerSubject,id:string,to:VerificationStatus,reason:string)=>apiFetch<{id:string;verificationStatus:VerificationStatus}>(`${admin}/${subject}/${encodeURIComponent(id)}/transition`,{method:"POST",body:{to,reason}}),
 review:(documentId:string,body:{decision:"ACCEPTED"|"REJECTED";note?:string;expiresAt?:string})=>apiFetch<VerificationDocument>(`${admin}/documents/${encodeURIComponent(documentId)}/review`,{method:"POST",body}),
 download:(documentId:string,reason:string)=>apiFetch<{documentId:string;downloadUrl:string;expiresInSeconds:number}>(`${admin}/documents/${encodeURIComponent(documentId)}/download`,{method:"POST",body:{reason}}),
 status:(sellerId?:string,signal?:AbortSignal)=>apiFetch<VerificationState>(portal(sellerId),{signal}),
 upload:(contentType:string,fileSizeBytes:number,sellerId?:string)=>apiFetch<VerificationUpload>(`${portal(sellerId)}/uploads`,{method:"POST",body:{contentType,fileSizeBytes}}),
 register:(body:{objectKey:string;kind:VerificationDocumentKind;contentType:string;fileSizeBytes:number;expiresAt?:string},sellerId?:string)=>apiFetch<VerificationState>(`${portal(sellerId)}/documents`,{method:"POST",body}),
 submit:(sellerId?:string)=>apiFetch<VerificationState>(`${portal(sellerId)}/submit`,{method:"POST"}),
};
