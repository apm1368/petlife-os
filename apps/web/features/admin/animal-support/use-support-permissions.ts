"use client";
import { useAdminStore } from "@/stores/admin-store";
export function useSupportPermissions() {
  const permissions = useAdminStore((s) => s.context?.permissions);
  return {
    trustManage: !!permissions?.includes("trust.manage"),
    reveal: !!permissions?.includes("customer.pii.reveal"),
    view: !!permissions?.includes("animalSupport.view"),
    manage: !!permissions?.includes("animalSupport.manage"),
    payout: !!permissions?.includes("animalSupport.payout"),
  };
}
