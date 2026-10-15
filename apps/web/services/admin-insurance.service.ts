import type {InsuranceProductDto,InsuranceCoverageType,PetSpecies,InsuranceProviderDto,InsuranceVerificationStatus,PaginatedDto} from "@petlife/types";
import {apiFetch} from "@/lib/api/client";
export interface InsuranceProviderInput {name:string;description?:string;country:string;contactEmail?:string;contactPhone?:string;websiteUrl?:string}
export type InsuranceNumericField="minAgeMonths"|"maxAgeMonths"|"waitingPeriodDays"|"deductibleAmountIrr"|"annualLimitIrr"|"coinsurancePercent"|"premiumMinIrr"|"premiumMaxIrr";
export type InsuranceProductInput={name:string;country:string;speciesEligibility:PetSpecies[];coverageTypes:InsuranceCoverageType[];coverageSummary:string;exclusions:string[];termsSource?:string;termsUrl?:string}&Partial<Record<InsuranceNumericField,number>>;
export const adminInsuranceService={
 products:(providerId:string,page:number,signal?:AbortSignal)=>apiFetch<PaginatedDto<InsuranceProductDto>>(`/admin/insurance/products?providerId=${encodeURIComponent(providerId)}&page=${page}&pageSize=20`,{signal}),
 product:(id:string,signal?:AbortSignal)=>apiFetch<InsuranceProductDto>(`/admin/insurance/products/${id}`,{signal}),
 createProduct:(providerId:string,body:InsuranceProductInput)=>apiFetch<InsuranceProductDto>(`/admin/insurance/providers/${providerId}/products`,{method:"POST",body}),
 updateProduct:(id:string,body:Omit<InsuranceProductInput,"country">)=>apiFetch<InsuranceProductDto>(`/admin/insurance/products/${id}`,{method:"PATCH",body}),
 verifyProduct:(id:string,status:InsuranceVerificationStatus)=>apiFetch<InsuranceProductDto>(`/admin/insurance/products/${id}/verification`,{method:"POST",body:{status}}),
 listProduct:(id:string,isPubliclyListed:boolean)=>apiFetch<InsuranceProductDto>(`/admin/insurance/products/${id}/listing`,{method:"POST",body:{isPubliclyListed}}),
 providers:(page:number,signal?:AbortSignal)=>apiFetch<PaginatedDto<InsuranceProviderDto>>(`/admin/insurance/providers?page=${page}&pageSize=20`,{signal}),
 provider:(id:string,signal?:AbortSignal)=>apiFetch<InsuranceProviderDto>(`/admin/insurance/providers/${id}`,{signal}),
 createProvider:(body:InsuranceProviderInput)=>apiFetch<InsuranceProviderDto>("/admin/insurance/providers",{method:"POST",body}),
 updateProvider:(id:string,body:Omit<InsuranceProviderInput,"country">)=>apiFetch<InsuranceProviderDto>(`/admin/insurance/providers/${id}`,{method:"PATCH",body}),
 verifyProvider:(id:string,status:InsuranceVerificationStatus)=>apiFetch<InsuranceProviderDto>(`/admin/insurance/providers/${id}/verification`,{method:"POST",body:{status}}),
 listProvider:(id:string,isPubliclyListed:boolean)=>apiFetch<InsuranceProviderDto>(`/admin/insurance/providers/${id}/listing`,{method:"POST",body:{isPubliclyListed}}),
};
