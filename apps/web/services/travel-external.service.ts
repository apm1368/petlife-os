import {apiFetch,API_BASE_URL} from "@/lib/api/client";
export interface ExternalStayContext {checkIn?:string;checkOut?:string;guests?:number;pets?:number}
export interface ExternalStaySearch extends ExternalStayContext {city?:string;stayType?:string;source?:string;minPrice?:number;maxPrice?:number;instantBooking?:boolean;dogs?:boolean;cats?:boolean;petPolicy?:string;page?:number;pageSize?:number}
export interface ExternalStayPrice {state:"DATES_REQUIRED"|"NO_PRICE_FOR_DATES"|"FRESH"|"STALE";freshness:string;context?:ExternalStayContext;priceType?:string;currency?:string;priceIrr?:number|null;oldPriceIrr?:number|null;discountPercent?:number|null;priceBasis?:string;observedAt?:string;expiresAt?:string;availability?:{state:string;observedAt:string|null}}
export interface ExternalStay {
 id:string;title:string|null;city:string|null;area:string|null;stayType:string|null;province:string|null;country:string;addressText:string|null;capacity:number|null;bedrooms:number|null;beds:number|null;amenities:string[];
 source:{code:string;nameFa:string;nameEn:string;sourceType:string;sourceUrl:string;partnership:"NONE";affiliateStatus:string};sourceUrl:string;lastSeenAt:string;dataFreshness:string;
 pet:{policyStatus:"CONFIRMED_ALLOWED"|"CONFIRMED_NOT_ALLOWED"|"UNKNOWN"|"AMBIGUOUS";accepted:boolean|"UNKNOWN";authority:string;evidenceType:string|null;evidenceText:string|null;evidenceObservedAt:string|null;evidenceAgeHours:number|null;policy:Record<string,unknown>|null;summary:string|null};
 rating:number|null;reviewCount:number|null;instantBooking:boolean|"UNKNOWN";descriptionSummary:string|null;images:string[];status:"ACTIVE"|"STALE";lastCheckedAt:string;cta:"VIEW_SOURCE";outboundPath:string;canonicalAccommodationId:string|null;externalDataDisclaimerRequired:boolean;disclaimerFa:string;
 price?:ExternalStayPrice;fromPrice?:{priceType:"FROM_PRICE";priceIrr:number;currency:string;priceBasis:string;observedAt:string;freshness:string}|null;priceFreshness?:string;availabilityStatus?:string;trustLabels?:string[];alternatives?:ExternalStay[];
}
export interface TripExternalStay {state:string;reservationConfirmed:false;addedAt:string;stay:ExternalStay;priceAtAttach:{priceIrr:number|null;observedAt:string;checkIn:string|null;checkOut:string|null;priceType:string;guests:number}|null}
function query(input:object){const params=new URLSearchParams();for(const[key,value]of Object.entries(input)){if(value!==undefined&&value!=="")params.set(key,String(value))}const text=params.toString();return text?`?${text}`:""}
function context(input:ExternalStayContext){return {checkIn:input.checkIn,checkOut:input.checkOut,guests:input.guests,pets:input.pets}}
export const travelExternalService={
 search:(input:ExternalStaySearch,signal?:AbortSignal)=>apiFetch<{items:ExternalStay[];total:number;page:number;pageSize:number;context:ExternalStayContext|null}>(`/travel/external/stays${query(input)}`,{signal}),
 detail:(id:string,input:ExternalStayContext,signal?:AbortSignal)=>apiFetch<ExternalStay>(`/travel/external/stays/${id}${query(context(input))}`,{signal}),
 outboundUrl:(id:string,input:ExternalStayContext)=>`${API_BASE_URL}/travel/external/stays/${encodeURIComponent(id)}/out${query(context(input))}`,
 favorites:(signal?:AbortSignal)=>apiFetch<{savedAt:string;available:boolean;stay:ExternalStay}[]>("/me/external-stays/favorites",{signal}),
 favorite:(id:string)=>apiFetch<{stayId:string;saved:boolean}>(`/me/external-stays/${id}/favorite`,{method:"POST"}),
 unfavorite:(id:string)=>apiFetch<{stayId:string;saved:boolean}>(`/me/external-stays/${id}/favorite`,{method:"DELETE"}),
 tripStays:(petId:string,tripId:string,signal?:AbortSignal)=>apiFetch<TripExternalStay[]>(`/pets/${petId}/trips/${tripId}/external-stays`,{signal}),
 attach:(petId:string,tripId:string,stayId:string,input:ExternalStayContext)=>apiFetch<TripExternalStay[]>(`/pets/${petId}/trips/${tripId}/external-stays`,{method:"POST",body:{stayId,...context(input)}}),
 detach:(petId:string,tripId:string,stayId:string)=>apiFetch<TripExternalStay[]>(`/pets/${petId}/trips/${tripId}/external-stays/${stayId}`,{method:"DELETE"}),
};
