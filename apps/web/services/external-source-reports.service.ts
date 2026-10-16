import {apiFetch} from "@/lib/api/client";
import type {PolicyStatus} from "./admin-external-listings.service";
export interface SourceMetrics {code:string;status:string;listings:number;newLast24h:number;changesLast24h:number;petPolicy:{confirmedAllowed:number;confirmedNotAllowed:number;ambiguous:number;unknown:number;petQualifiedPercent:number|null;unknownPercent:number|null};priceCoveragePercent:number|null;priceFreshness:{FRESH:number;AGING:number;STALE:number};runsLast7d:number;errorRatePercent:number|null;blockRatePercent:number|null}
export interface ParserHealth {code:string;status:string;parserReady:boolean;strategy:string|null;baselineListings:number|null;lastDiscovered:number|null;anomalyRuns:number;itemFailureRate:number|null;runFailureRate:number|null;recentRuns:{id:string;status:string;startedAt:string;listingsDiscovered:number;failed:number;itemsScanned:number;anomaly:boolean}[]}
export interface SourceError {runId:string;source:string;kind:string;status:string;startedAt:string;categories:Record<string,number>|null;errors:{externalId?:string;category:string;message:string}[]}
export interface SourceEvidence {id:string;stay:{id:string;title:string;city:string;source:string;sourceObservation:PolicyStatus;adminConfirmed:PolicyStatus|null;effective:PolicyStatus};status:PolicyStatus;authority:string;evidenceSource:string|null;evidenceUrl:string|null;evidenceText:string|null;observedAt:string;lastConfirmedAt:string;fields:{dogsAllowed:boolean|null;catsAllowed:boolean|null;otherPetsAllowed:boolean|null;maxPets:number|null;maxWeightKg:number|null;petFeeIrr:number|null;depositIrr:number|null;restrictions:string|null;allowedAreas:string|null}}
export interface SourceTask {id:string;title:string;description:string|null;status:string;priority:string;createdAt:string}
export interface DailyChange {stayId:string;title:string;city:string;source:string;kind:string;field:string|null;oldValue:unknown;newValue:unknown;runId:string|null;at:string}
export interface SourceDailyDiff {date:string;newListings:DailyChange[];removedListings:DailyChange[];markedStale:DailyChange[];reappeared:DailyChange[];priceChanges:DailyChange[];petPolicyChanges:DailyChange[];fieldChanges:number;listingFailures:number;staleListingsNow:number;sourceErrors:{runId:string;source:string;status:string;categories:Record<string,number>|null;anomaly:boolean;at:string}[];runs:{id:string;source:string;kind:string;status:string;discovered:number;created:number;updated:number;failed:number}[]}
const root="/admin/travel/external";
export const externalSourceReportsService={
 metrics:(signal?:AbortSignal)=>apiFetch<SourceMetrics[]>(`${root}/metrics`,{signal}),
 parser:(signal?:AbortSignal)=>apiFetch<ParserHealth[]>(`${root}/parser-health`,{signal}),
 errors:(query:URLSearchParams,signal?:AbortSignal)=>apiFetch<{items:SourceError[];total:number;page:number;pageSize:number}>(`${root}/errors?${query}`,{signal}),
 evidence:(query:URLSearchParams,signal?:AbortSignal)=>apiFetch<{items:SourceEvidence[];total:number;page:number;pageSize:number}>(`${root}/pet-evidence?${query}`,{signal}),
 tasks:(signal?:AbortSignal)=>apiFetch<SourceTask[]>(`${root}/tasks`,{signal}),
 diff:(query:URLSearchParams,signal?:AbortSignal)=>apiFetch<SourceDailyDiff>(`${root}/daily-diff?${query}`,{signal}),
};
