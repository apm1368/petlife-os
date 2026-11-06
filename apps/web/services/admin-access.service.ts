import {apiFetch} from "@/lib/api/client";
export type AdminRole="SUPER_ADMIN"|"ADMIN"|"SUPPORT"|"TRUST_SAFETY"|"FINANCE"|"OPERATIONS"|"CONTENT"|"VERIFICATION"|"READ_ONLY"|"EDITOR"|"PARTNER_OPERATIONS"|"CLINIC_OPERATIONS"|"COMMERCE_OPERATIONS"|"ANALYTICS"|"CONTENT_ADMIN"|"SHOP_ADMIN"|"SERVICE_ADMIN"|"SUPPORT_AGENT"|"CUSTOM";
export type AdminServiceVertical="CLINIC"|"GROOMING"|"ACCOMMODATION"|"INSURANCE";
export const adminServiceVerticals:AdminServiceVertical[]=["CLINIC","GROOMING","ACCOMMODATION","INSURANCE"];
export interface AdminMembership {id:string;userId:string;displayName:string|null;emailMasked:string|null;role:AdminRole;serviceScopes:AdminServiceVertical[];customRole?:{id:string;key:string;label:string}|null;status:"ACTIVE"|"SUSPENDED";createdAt:string;updatedAt:string;lastActiveAt:string|null;permissions?:string[]}
export interface AdminRoleDefinition {role:AdminRole;protected:boolean;permissions:string[];activeMembers:number;suspendedMembers:number}
export interface AdminPermissionDefinition {permission:string;domain:string;roles:AdminRole[];customRoleAllowed:boolean}
export interface AdminCustomRole {id:string;key:string;label:string;description:string;permissions:string[];verticals:string[];status:"PENDING"|"ACTIVE"|"REJECTED";reason:string;requestedByAdminId:string;approvedByAdminId:string|null;createdAt:string;approvedAt:string|null}
export interface PendingRoleAssignment {id:string;adminUserId:string;displayName:string|null;customRoleId:string|null;customRoleKey:string|null;customRoleLabel:string|null;reason:string;requestedByAdminId:string;createdAt:string}
export interface AdminCustomRoleQueue {roles:AdminCustomRole[];pendingAssignments:PendingRoleAssignment[]}
const base="/admin/access";
export const adminAccessService={
 roles:(signal?:AbortSignal)=>apiFetch<AdminRoleDefinition[]>(`${base}/roles`,{signal}),
 permissions:(signal?:AbortSignal)=>apiFetch<AdminPermissionDefinition[]>(`${base}/permissions`,{signal}),
 customRoles:(signal?:AbortSignal)=>apiFetch<AdminCustomRoleQueue>(`${base}/custom-roles`,{signal}),
 createCustomRole:(input:{key:string;label:string;description:string;permissions:string[];verticals:string[];reason:string})=>apiFetch<AdminCustomRole>(`${base}/custom-roles`,{method:"POST",body:input}),
 reviewCustomRole:(id:string,decision:"APPROVE"|"REJECT",reason:string)=>apiFetch<AdminCustomRole>(`${base}/custom-roles/${encodeURIComponent(id)}/review`,{method:"POST",body:{decision,reason}}),
 requestCustomRoleAssignment:(adminId:string,customRoleId:string|null,reason:string)=>apiFetch<{id:string;status:string}>(`${base}/admins/${encodeURIComponent(adminId)}/custom-role-assignment`,{method:"POST",body:{customRoleId,reason}}),
 reviewCustomRoleAssignment:(id:string,decision:"APPROVE"|"REJECT",reason:string)=>apiFetch<{id:string;status:string}>(`${base}/custom-role-assignments/${encodeURIComponent(id)}/review`,{method:"POST",body:{decision,reason}}),
 list:(query:URLSearchParams,signal?:AbortSignal)=>apiFetch<{items:AdminMembership[];total:number;page:number;pageSize:number}>(`${base}/admins?${query}`,{signal}),
 get:(id:string,signal?:AbortSignal)=>apiFetch<AdminMembership>(`${base}/admins/${encodeURIComponent(id)}`,{signal}),
 grant:(email:string,role:AdminRole,reason:string,serviceScopes:AdminServiceVertical[]=[])=>apiFetch<AdminMembership>(`${base}/admins`,{method:"POST",body:{email,role,reason,serviceScopes}}),
 changeRole:(id:string,role:AdminRole,reason:string,serviceScopes:AdminServiceVertical[]=[])=>apiFetch<AdminMembership>(`${base}/admins/${encodeURIComponent(id)}/role`,{method:"POST",body:{role,reason,serviceScopes}}),
 changeScopes:(id:string,serviceScopes:AdminServiceVertical[],reason:string)=>apiFetch<AdminMembership>(`${base}/admins/${encodeURIComponent(id)}/scopes`,{method:"POST",body:{serviceScopes,reason}}),
 suspend:(id:string,reason:string)=>apiFetch<AdminMembership>(`${base}/admins/${encodeURIComponent(id)}/suspend`,{method:"POST",body:{reason}}),
 reactivate:(id:string,reason:string)=>apiFetch<AdminMembership>(`${base}/admins/${encodeURIComponent(id)}/reactivate`,{method:"POST",body:{reason}}),
};
