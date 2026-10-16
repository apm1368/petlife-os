import {apiFetch} from "@/lib/api/client";
export const stayStatuses=["DISCOVERED","ACTIVE","STALE","SOURCE_REMOVED","HIDDEN"] as const;
export const publishStates=["DRAFT","PUBLISHED","REJECTED"] as const;
export const policyStatuses=["CONFIRMED_ALLOWED","CONFIRMED_NOT_ALLOWED","UNKNOWN","AMBIGUOUS"] as const;
export const overrideFields=["title","city","area","stayType","petPolicySummary","descriptionSummary"] as const;
export type PolicyStatus=typeof policyStatuses[number];
export type OverrideField=typeof overrideFields[number];
export interface AdminStay {id:string;source:string;title:string;city:string;status:typeof stayStatuses[number];publishState:typeof publishStates[number];petPolicy:{sourceObservation:PolicyStatus;adminConfirmed:PolicyStatus|null;effective:PolicyStatus};lastCheckedAt:string;canonicalAccommodationId:string|null;hasOverrides:boolean}
export interface StayInspection {
 normalized:{id:string;title:string;city:string;province:string|null;area:string|null;addressText:string|null;stayType:string|null;capacity:number|null;descriptionSummary:string|null;status:AdminStay["status"];publishState:AdminStay["publishState"]};
 source:{code:string;sourceUrl:string;lastCheckedAt:string;lastSuccessfulSyncAt:string|null};
 lifecycle:{firstSeenAt:string|null;lastSeenAt:string|null;lastChangedAt:string|null;missedRuns:number};
 petEvidence:{type:string;text:string|null;observedAt:string|null;summary:string|null};
 petPolicy:AdminStay["petPolicy"]&{adminNote:string|null;adminReviewedAt:string|null};
 overrides:Partial<Record<OverrideField,{sourceValue:unknown;overrideValue:string;adminUserId:string;at:string}>>;
 priceHistory:{id:string;checkIn:string|null;checkOut:string|null;guests:number|null;priceIrr:number|null;oldPriceIrr:number|null;discountPercent:number|null;currency:string;priceBasis:"TOTAL_STAY"|"PER_NIGHT";availability:"UNKNOWN"|"SOURCE_REPORTED_AVAILABLE"|"SOURCE_REPORTED_UNAVAILABLE";observedAt:string;expiresAt:string;freshness:string}[];
 petEvidenceHistory:{id:string;status:PolicyStatus;authority:string;evidenceText:string|null;observedAt:string;lastConfirmedAt:string}[];
 changes:{kind:string;field:string|null;oldValue:unknown;newValue:unknown;at:string}[];
 canonicalAccommodationId:string|null;publishBlockers:string[];engagement:{outboundClicks:number;favorites:number;tripAttachments:number};
}
export interface ManualStay {sourceCode:string;sourceUrl:string;title:string;city:string;petEvidenceType:"SOURCE_FILTER"|"SOURCE_AMENITY"|"SOURCE_POLICY_TEXT";petEvidenceText:string}
export interface PriceObservation {checkIn:string;checkOut:string;guests:number;pets?:number;priceIrr?:number;oldPriceIrr?:number;discountPercent?:number;priceBasis:"TOTAL_STAY"|"PER_NIGHT";availability:"UNKNOWN"|"SOURCE_REPORTED_AVAILABLE"|"SOURCE_REPORTED_UNAVAILABLE";observedAt:string}
export interface MatchCandidate {id:string;stayAId:string;stayBId:string;score:number;status:"PENDING"|"APPROVED"|"REJECTED";reviewedAt:string|null}
const root="/admin/travel/external";
export const adminExternalListingsService={
 list:(query:URLSearchParams,signal?:AbortSignal)=>apiFetch<{items:AdminStay[];total:number;page:number;pageSize:number}>(`${root}/listings?${query}`,{signal}),
 inspect:(id:string,signal?:AbortSignal)=>apiFetch<StayInspection>(`${root}/listings/${encodeURIComponent(id)}`,{signal}),
 manual:(body:ManualStay)=>apiFetch<{result:string;stayId:string}>(`${root}/listings`,{method:"POST",body}),
 visibility:(id:string,action:"hide"|"unhide"|"publish"|"unpublish",reason:string)=>apiFetch<StayInspection>(`${root}/listings/${encodeURIComponent(id)}/visibility`,{method:"POST",body:{action,reason}}),
 policy:(id:string,status:PolicyStatus|null,note:string)=>apiFetch<unknown>(`${root}/listings/${encodeURIComponent(id)}/pet-policy`,{method:"POST",body:{status,note}}),
 override:(id:string,field:OverrideField,value:string|null)=>apiFetch<unknown>(`${root}/listings/${encodeURIComponent(id)}/override`,{method:"POST",body:{field,value}}),
 price:(id:string,body:PriceObservation)=>apiFetch<unknown>(`${root}/listings/${encodeURIComponent(id)}/prices`,{method:"POST",body}),
 retry:(id:string)=>apiFetch<{id:string;status:string}>(`${root}/listings/${encodeURIComponent(id)}/retry`,{method:"POST"}),
 matches:(status:MatchCandidate["status"],signal?:AbortSignal)=>apiFetch<MatchCandidate[]>(`${root}/matches?status=${status}`,{signal}),
 review:(id:string,approve:boolean)=>apiFetch<{id:string;status:MatchCandidate["status"]}>(`${root}/matches/${encodeURIComponent(id)}/${approve?"approve":"reject"}`,{method:"POST"}),
 canonical:(id:string,signal?:AbortSignal)=>apiFetch<{id:string;title:string;city:string;listings:{id:string;source:string;title:string;status:AdminStay["status"];publishState:AdminStay["publishState"];petPolicy:PolicyStatus}[]}>(`${root}/canonical/${encodeURIComponent(id)}`,{signal}),
};
