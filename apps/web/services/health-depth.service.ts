import {apiFetch} from "@/lib/api/client";
export const healthFeedTypes=["VISIT","CONDITION","ALLERGY","VACCINATION","MEDICATION","LAB","IMAGING","WEIGHT","DOCUMENT","OTHER"] as const;
export const healthSources=["OWNER","CLINIC","VET","IMPORT","SYSTEM"] as const;
export type HealthShareSection="ALLERGIES"|"MEDICATIONS"|"CONDITIONS"|"VACCINATION";
export interface HealthFeedItem {id:string;type:typeof healthFeedTypes[number];recordType:string;recordId:string;occurredAt:string;recordedAt:string|null;source:typeof healthSources[number];author:{providerUserId:string|null;displayTitle:string|null;userId:string|null};organization:{id:string;name:string|null}|null;summary:string;deepLink:string|null}
export interface HealthSnapshot {
 petId:string;activeConditions:{id:string;name:string;since:string|null}[];activeMedications:{id:string;name:string;dosage:string|null;unit:string|null;frequency:string|null;startedAt:string|null}[];allergies:{id:string;name:string;severity:string;reaction:string|null}[];
 latestWeight:{value:number;unit:string|null;recordedAt:string|null;source:"CLINIC"|"OWNER"}|null;vaccinationStatus:string|null;upcomingVaccinations:{kind:string;id:string;title:string|null;dueAt:string}[];
 recentVisits:{id:string;startedAt:string;status:string;reason:string|null;organization:{id:string;name:string}}[];
 recentLabs:{id:string;testName:string;value:string|null;unit:string|null;flag:string|null;resultDate:string|null;status:string}[];
 recentImaging:{id:string;studyType:string;bodyRegion:string|null;performedAt:string}[];documentsCount:number;
}
export interface HealthShare {id:string;state:"ACTIVE"|"EXPIRED"|"REVOKED";label:string|null;sections:HealthShareSection[];labResultIds:string[];clinicalVisitIds:string[];imagingStudyIds:string[];tokenHint:string;expiresAt:string;revokedAt:string|null;createdAt:string;accessCount:number;lastAccessedAt:string|null}
export interface HealthShareInput {sections:HealthShareSection[];labResultIds?:string[];clinicalVisitIds?:string[];imagingStudyIds?:string[];expiresInHours:number;label?:string}
export interface PublicHealthShare {
 label:string|null;expiresAt:string;pet:{name:string;species:string;breed:string|null;sex:string;birthDate:string|null;approximateAgeMonths:number|null};
 allergies?:{name:string;severity:string;reaction:string|null}[];activeMedications?:{name:string;dosage:string|null;unit:string|null;frequency:string|null}[];activeConditions?:string[];vaccination?:{status:string;lastKnownDate:string|null;nextDueDate:string|null};
 labs:{testName:string;value:string|null;unit:string|null;referenceRangeLow:string|null;referenceRangeHigh:string|null;flag:string|null;resultDate:string|null}[];
 visits:{startedAt:string;reason:string|null;assessment:string|null;plan:string|null;organization:string}[];
 imaging:{studyType:string;bodyRegion:string|null;report:string|null;performedAt:string|null}[];
}
export interface CareSuggestion {id:string;petId:string;title:string;type:string;notes:string|null;suggestedDueAt:string;recurrence:string|null;intervalDays:number|null;status:"PENDING"|"ACCEPTED"|"DISMISSED";source:{kind:"VISIT"|"BOOKING";id:string|null};careReminderId:string|null;decidedAt:string|null;createdAt:string;organization?:{id:string;name:string}|null}
export interface CareSuggestionInput {title:string;type:string;suggestedDueAt:string;recurrence?:string;intervalDays?:number;notes?:string}
export const healthDepthService={
 snapshot:(petId:string,signal?:AbortSignal)=>apiFetch<HealthSnapshot>(`/pets/${petId}/health/snapshot`,{signal}),
 feed:(petId:string,input:{type?:string;source?:string;from?:string;to?:string;cursor?:string},signal?:AbortSignal)=>{const q=new URLSearchParams({limit:"20"});if(input.type)q.set("types",input.type);if(input.source)q.set("sources",input.source);if(input.from)q.set("from",input.from);if(input.to)q.set("to",input.to);if(input.cursor)q.set("cursor",input.cursor);return apiFetch<{items:HealthFeedItem[];nextCursor:string|null}>(`/pets/${petId}/health/feed?${q}`,{signal})},
 shares:(petId:string,signal?:AbortSignal)=>apiFetch<HealthShare[]>(`/pets/${petId}/health-shares`,{signal}),
 createShare:(petId:string,body:HealthShareInput)=>apiFetch<HealthShare&{token:string;publicPath:string}>(`/pets/${petId}/health-shares`,{method:"POST",body}),
 shareLog:(petId:string,id:string,signal?:AbortSignal)=>apiFetch<{accessedAt:string;userAgent:string|null}[]>(`/pets/${petId}/health-shares/${id}/access-log`,{signal}),
 revokeShare:(petId:string,id:string)=>apiFetch<{revoked:boolean}>(`/pets/${petId}/health-shares/${id}/revoke`,{method:"POST"}),
 publicShare:(token:string,signal?:AbortSignal)=>apiFetch<PublicHealthShare>(`/public/health-shares/${encodeURIComponent(token)}`,{signal,cache:"no-store"}),
 suggestions:(petId:string,status:string,signal?:AbortSignal)=>apiFetch<CareSuggestion[]>(`/pets/${petId}/care-suggestions${status?`?status=${encodeURIComponent(status)}`:""}`,{signal}),
 acceptSuggestion:(petId:string,id:string,body:{dueAt?:string;assignedToUserId?:string|null})=>apiFetch<CareSuggestion>(`/pets/${petId}/care-suggestions/${id}/accept`,{method:"POST",body}),
 dismissSuggestion:(petId:string,id:string)=>apiFetch<CareSuggestion>(`/pets/${petId}/care-suggestions/${id}/dismiss`,{method:"POST"}),
 suggestForVisit:(visitId:string,items:CareSuggestionInput[])=>apiFetch<CareSuggestion[]>(`/provider/clinical/visits/${visitId}/care-suggestions`,{method:"POST",body:{items}}),
 suggestForBooking:(bookingId:string,items:CareSuggestionInput[])=>apiFetch<CareSuggestion[]>(`/provider/bookings/${bookingId}/care-suggestions`,{method:"POST",body:{items}}),
};
