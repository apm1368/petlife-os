import type { AdminAuditLogService } from "./admin-audit-log.service";

/** True when an address-shaped value carries an exact map point. */
export const carriesPin = (address: { latitude?: unknown; longitude?: unknown } | null | undefined): boolean =>
  !!address && typeof address.latitude === "number" && typeof address.longitude === "number";

/**
 * Records that a staff member was shown a member's exact pin (always for dispatch). Only who, what and where it was
 * shown — never the coordinates themselves.
 */
export function auditMemberPinRead(
  audit: AdminAuditLogService,
  input: { adminUserId: string; entityType: string; entityId: string | undefined; field: string; requestId?: string },
): Promise<void> {
  return audit.record({
    adminUserId: input.adminUserId,
    action: "member_pin.viewed",
    entityType: input.entityType,
    entityId: input.entityId,
    reason: "dispatch",
    afterSummary: { field: input.field },
    requestId: input.requestId,
  });
}
