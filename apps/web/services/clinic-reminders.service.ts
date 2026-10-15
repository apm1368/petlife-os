import {apiFetch} from "@/lib/api/client";
export type ClinicReminderKind="VACCINATION"|"CHECKUP"|"MEDICATION"|"FOLLOW_UP"|"MESSAGE";
export interface ClinicReminder {id:string;petId:string;kind:ClinicReminderKind;title:string;note:string|null;dueAt:string;status:"SCHEDULED"|"SENT"|"CANCELLED"|"FAILED";sentAt:string|null;recipientCount:number;cancelledAt:string|null;createdAt:string}
export const clinicRemindersService={
 list:(page:number,status:string,signal?:AbortSignal)=>apiFetch<{items:ClinicReminder[];total:number;page:number;pageSize:number}>(`/provider/clinic/reminders?page=${page}&pageSize=20${status?`&status=${encodeURIComponent(status)}`:""}`,{signal}),
 create:(body:{petId:string;kind:ClinicReminderKind;title:string;note?:string;dueAt?:string})=>apiFetch<ClinicReminder>("/provider/clinic/reminders",{method:"POST",body}),
 cancel:(id:string)=>apiFetch<ClinicReminder>(`/provider/clinic/reminders/${id}/cancel`,{method:"POST"}),
};
