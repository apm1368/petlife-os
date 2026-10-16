import {apiFetch} from "@/lib/api/client";
export interface ClinicTag {id:string;name:string;customerCount:number}
export interface CustomerTag {id:string;name:string}
export interface SharedClinicNote {id:string;householdId:string;clinic:{id:string;name:string};body:string;createdAt:string}
export const clinicCustomerExtrasService={
 tags:(signal?:AbortSignal)=>apiFetch<ClinicTag[]>("/provider/clinic/tags",{signal}),
 createTag:(name:string)=>apiFetch<ClinicTag[]>("/provider/clinic/tags",{method:"POST",body:{name}}),
 deleteTag:(id:string)=>apiFetch<ClinicTag[]>(`/provider/clinic/tags/${encodeURIComponent(id)}`,{method:"DELETE"}),
 customerTags:(householdId:string,signal?:AbortSignal)=>apiFetch<{tags:CustomerTag[]}>(`/provider/clinic/customers/${encodeURIComponent(householdId)}`,{signal}),
 tagCustomer:(householdId:string,tagId:string)=>apiFetch<CustomerTag[]>(`/provider/clinic/customers/${encodeURIComponent(householdId)}/tags/${encodeURIComponent(tagId)}`,{method:"POST"}),
 untagCustomer:(householdId:string,tagId:string)=>apiFetch<CustomerTag[]>(`/provider/clinic/customers/${encodeURIComponent(householdId)}/tags/${encodeURIComponent(tagId)}`,{method:"DELETE"}),
 sharedNotes:(signal?:AbortSignal)=>apiFetch<SharedClinicNote[]>("/me/clinic-notes",{signal}),
};
