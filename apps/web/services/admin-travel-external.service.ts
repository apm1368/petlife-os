import {apiFetch} from "@/lib/api/client";
export const externalSourceNumberFields={syncIntervalMinutes:{min:60,max:10080},priceTtlMinutes:{min:15,max:10080},metadataTtlMinutes:{min:60,max:43200},maxRequestsPerRun:{min:1,max:500},timeoutMs:{min:1000,max:30000},retryCount:{min:0,max:5},requestDelayMinMs:{min:1000,max:60000},requestDelayMaxMs:{min:1000,max:120000},priceFreshHours:{min:1,max:168},priceAgingHours:{min:1,max:720},staleAfterMissedRuns:{min:1,max:30},removeAfterMissedRuns:{min:2,max:60},rawRetentionDays:{min:1,max:90}} as const;
export type ExternalSourceNumberField=keyof typeof externalSourceNumberFields;
export type ExternalSourceConfig=Record<ExternalSourceNumberField,number>&{imagePolicy:"NO_IMAGES"|"REMOTE_REFERENCE"|"CACHE_PERMITTED";cityScopes:string[];autoPublish:boolean;concurrency:1;anomalyDropRatio:number};
export interface ExternalSourceRun {id:string;kind:"DISCOVERY"|"FULL"|"LISTING"|"PRICE";status:"STARTED"|"SUCCEEDED"|"PARTIAL"|"FAILED"|"CANCELLED"|"ABANDONED";trigger:string;startedAt:string;finishedAt?:string|null;itemsScanned:number;listingsDiscovered:number;created:number;updated:number;unchanged:number;failed:number;removed:number;staleMarked?:number;anomaly:boolean;durationMs:number|null;source?:{code:string;nameFa:string};changesByKind?:Record<string,number>;errors?:{externalId?:string;category:string;message:string}[]|null;errorCategories?:Record<string,number>|null}
export interface ExternalSource {
 code:string;nameFa:string;nameEn:string;allowedHosts:string[];mode:"AUTOMATED"|"MANUAL"|"DISABLED";automationStatus:string;health:string;healthReason:string|null;status:"ACTIVE"|"PAUSED"|"BLOCKED"|"DEGRADED"|"ERROR"|"NOT_SUPPORTED";adapter:{strategy:string;parserReady:boolean}|null;
 robots:{checkedAt:string|null;result:unknown};terms:{checkedAt:string|null;url:string|null};config:ExternalSourceConfig;lastRunAt:string|null;lastSuccessAt:string|null;lastFailureAt:string|null;lastError:string|null;lastRunStatus:string|null;lastListingsSeen:number|null;lastDurationMs:number|null;circuitOpenUntil:string|null;nextRunAt:string|null;consecutiveFailures:number;listingCount:number;lastRun:ExternalSourceRun|null;listings?:{status:string;publishState:string;count:number}[];runs?:ExternalSourceRun[];
}
export interface ExternalSourceDashboard {totalExternalListings:number;petFriendlyPublished:number;bySource:{code:string;total:number;published:number}[];freshPriceSnapshots:number;stalePriceSnapshots:number;failedSyncsLast7Days:number;sourceRemoved:number;outboundClicks:number;conversion:"UNKNOWN"}
export const adminTravelExternalService={
 dashboard:(signal?:AbortSignal)=>apiFetch<ExternalSourceDashboard>("/admin/travel/external/dashboard",{signal}),
 sources:(signal?:AbortSignal)=>apiFetch<ExternalSource[]>("/admin/travel/external/sources",{signal}),
 source:(code:string,signal?:AbortSignal)=>apiFetch<ExternalSource>(`/admin/travel/external/sources/${encodeURIComponent(code)}`,{signal}),
 config:(code:string,body:Partial<ExternalSourceConfig>&{reason:string})=>apiFetch<ExternalSource>(`/admin/travel/external/sources/${encodeURIComponent(code)}`,{method:"PATCH",body}),
 pause:(code:string,reason:string)=>apiFetch<ExternalSource>(`/admin/travel/external/sources/${encodeURIComponent(code)}/pause`,{method:"POST",body:{reason}}),
 resume:(code:string,reason:string)=>apiFetch<ExternalSource>(`/admin/travel/external/sources/${encodeURIComponent(code)}/resume`,{method:"POST",body:{reason}}),
 probe:(code:string)=>apiFetch<{ok:boolean;category?:string;detail?:string;schemaOk?:boolean}>(`/admin/travel/external/sources/${encodeURIComponent(code)}/probe`,{method:"POST"}),
 healthCheck:(code:string)=>apiFetch<{ok:boolean;category?:string;detail?:string;schemaOk?:boolean}>(`/admin/travel/external/sources/${encodeURIComponent(code)}/health-check`,{method:"POST"}),
 run:(code:string,kind:"DISCOVERY"|"FULL")=>apiFetch<ExternalSourceRun>(`/admin/travel/external/sources/${encodeURIComponent(code)}/runs`,{method:"POST",body:{kind}}),
 runs:(page:number,source?:string,signal?:AbortSignal)=>apiFetch<{items:ExternalSourceRun[];total:number;page:number;pageSize:number}>(`/admin/travel/external/runs?page=${page}&pageSize=20${source?`&source=${encodeURIComponent(source)}`:""}`,{signal}),
 runDetail:(id:string,signal?:AbortSignal)=>apiFetch<ExternalSourceRun>(`/admin/travel/external/runs/${id}`,{signal}),
};
