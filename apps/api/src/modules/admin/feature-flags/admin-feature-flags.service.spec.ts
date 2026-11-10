import { AdminFeatureFlagsService } from "./admin-feature-flags.service";
import type { PrismaService } from "../../../common/prisma/prisma.service";
import type { AdminAuditLogService } from "../audit/admin-audit-log.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";
import { SettingChangeConflictException } from "../../../common/errors/api-exception";

describe("feature flag cancellation governance", () => {
  const actor = { adminUserId: "requester" } as ResolvedAdminContext;
  function setup(status = "PENDING", owner = "requester") {
    const initial = { id: "change", flagKey: "checkout-v2", status: "PENDING", requestedByAdminId: "requester" };
    const fresh = { ...initial, status, requestedByAdminId: owner };
    const row = { ...fresh, status: "CANCELLED", createdAt: new Date(), reviewedAt: new Date() };
    const tx = { $executeRaw: jest.fn().mockResolvedValue(1), featureFlagChange: { findUnique: jest.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce(fresh), update: jest.fn().mockResolvedValue(row) } };
    const prisma = { $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)), featureFlagChange: { findUniqueOrThrow: jest.fn().mockResolvedValue(row) } };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    return { service: new AdminFeatureFlagsService(prisma as unknown as PrismaService, audit as unknown as AdminAuditLogService), tx, audit };
  }
  it.each(["APPLIED", "REJECTED", "SUPERSEDED", "CANCELLED"])("does not overwrite a change that became %s while waiting", async (status) => {
    const { service, tx, audit } = setup(status);
    await expect(service.cancel(actor, "change")).rejects.toBeInstanceOf(SettingChangeConflictException);
    expect(tx.featureFlagChange.findUnique).toHaveBeenCalledTimes(2);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.featureFlagChange.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
  it("allows the requester to cancel a still-pending change and audits it in the transaction", async () => {
    const { service, tx, audit } = setup();
    await expect(service.cancel(actor, "change")).resolves.toMatchObject({ status: "CANCELLED" });
    expect(tx.featureFlagChange.update).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "feature_flag.change_cancelled", adminUserId: "requester", tx }));
    const lockCall = tx.$executeRaw.mock.calls[0];
    if (!lockCall) throw new Error("No feature flag lock");
    expect(lockCall[1]).toBe("feature-flag:checkout-v2");
  });
  it("denies cancellation by an unrelated administrator", async () => {
    const { service, tx } = setup("PENDING", "another-admin");
    await expect(service.cancel(actor, "change")).rejects.toBeInstanceOf(SettingChangeConflictException);
    expect(tx.featureFlagChange.update).not.toHaveBeenCalled();
  });
});
