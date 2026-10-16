import {apiFetch} from "@/lib/api/client";
export type AdminRole="SUPER_ADMIN"|"ADMIN"|"SUPPORT"|"TRUST_SAFETY"|"FINANCE"|"OPERATIONS"|"CONTENT"|"VERIFICATION"|"READ_ONLY"|"EDITOR"|"PARTNER_OPERATIONS"|"CLINIC_OPERATIONS"|"COMMERCE_OPERATIONS"|"ANALYTICS";
export interface AdminMembership {id:string;userId:string;displayName:string|null;emailMasked:string|null;role:AdminRole;status:"ACTIVE"|"SUSPENDED";createdAt:string;updatedAt:string;lastActiveAt:string|null;permissions?:string[]}
export interface AdminRoleDefinition {role:AdminRole;protected:boolean;permissions:string[];activeMembers:number;suspendedMembers:number}
export interface AdminPermissionDefinition {permission:string;domain:string;roles:AdminRole[]}
const base="/admin/access";
export const adminAccessService={
 roles:(signal?:AbortSignal)=>apiFetch<AdminRoleDefinition[]>(`${base}/roles`,{signal}),
 permissions:(signal?:AbortSignal)=>apiFetch<AdminPermissionDefinition[]>(`${base}/permissions`,{signal}),
 list:(query:URLSearchParams,signal?:AbortSignal)=>apiFetch<{items:AdminMembership[];total:number;page:number;pageSize:number}>(`${base}/admins?${query}`,{signal}),
 get:(id:string,signal?:AbortSignal)=>apiFetch<AdminMembership>(`${base}/admins/${encodeURIComponent(id)}`,{signal}),
 grant:(email:string,role:AdminRole,reason:string)=>apiFetch<AdminMembership>(`${base}/admins`,{method:"POST",body:{email,role,reason}}),
 changeRole:(id:string,role:AdminRole,reason:string)=>apiFetch<AdminMembership>(`${base}/admins/${encodeURIComponent(id)}/role`,{method:"POST",body:{role,reason}}),
 suspend:(id:string,reason:string)=>apiFetch<AdminMembership>(`${base}/admins/${encodeURIComponent(id)}/suspend`,{method:"POST",body:{reason}}),
 reactivate:(id:string,reason:string)=>apiFetch<AdminMembership>(`${base}/admins/${encodeURIComponent(id)}/reactivate`,{method:"POST",body:{reason}}),
};
