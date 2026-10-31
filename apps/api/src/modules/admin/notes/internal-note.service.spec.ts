import { AdminMembershipStatus, AdminRole, InternalNoteEntityType } from "@prisma/client";
import { InternalNoteService } from "./internal-note.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";

const entityId = "d7206a8c-90ee-4156-8b31-31d5a0ea86b3";
const actor: ResolvedAdminContext = {
  adminUserId: "a5dce6b4-f84b-48cf-8f12-7cbbe7cad727",
  userId: "66a3a037-b055-4813-b9aa-9ce871caee0c",
  displayName: "Admin",
  role: AdminRole.ADMIN,
  status: AdminMembershipStatus.ACTIVE,
  serviceScopes: [],
};

function setup(existing: Partial<Record<InternalNoteEntityType, boolean>> = {}) {
  const lookup = (type: InternalNoteEntityType) => jest.fn().mockResolvedValue(existing[type] === false ? null : { id: entityId });
  const tx = {
    user: { findUnique: lookup(InternalNoteEntityType.USER) },
    household: { findUnique: lookup(InternalNoteEntityType.HOUSEHOLD) },
    pet: { findUnique: lookup(InternalNoteEntityType.PET) },
    supportCase: { findUnique: lookup(InternalNoteEntityType.SUPPORT_CASE) },
    dispute: { findUnique: lookup(InternalNoteEntityType.DISPUTE) },
    trustCase: { findUnique: lookup(InternalNoteEntityType.TRUST_CASE) },
    internalNote: {
      create: jest.fn().mockImplementation(({ data }: { data: { entityType: InternalNoteEntityType; entityId: string; body: string } }) => ({
        id: "e8cd5fcf-4420-41b5-a7ce-78434b59905f",
        ...data,
        createdAt: new Date("2026-10-31T00:00:00.000Z"),
        updatedAt: null,
        authorAdmin: { id: actor.adminUserId, role: actor.role, user: { displayName: actor.displayName } },
      })),
    },
  };
  const audit = { record: jest.fn() };
  const events = { publish: jest.fn() };
  const prisma = { $transaction: (callback: (client: typeof tx) => unknown) => callback(tx) };
  return { service: new InternalNoteService(prisma as never, events as never, audit as never), tx, audit, events };
}

describe("InternalNoteService target integrity", () => {
  it.each([
    [InternalNoteEntityType.USER, "user"],
    [InternalNoteEntityType.HOUSEHOLD, "household"],
    [InternalNoteEntityType.PET, "pet"],
    [InternalNoteEntityType.SUPPORT_CASE, "supportCase"],
    [InternalNoteEntityType.DISPUTE, "dispute"],
    [InternalNoteEntityType.TRUST_CASE, "trustCase"],
  ] as const)("verifies the %s target before writing its note", async (entityType, model) => {
    const { service, tx } = setup();
    await service.add(actor, entityType, entityId, "An internal note");
    expect(tx[model].findUnique).toHaveBeenCalledWith({ where: { id: entityId }, select: { id: true } });
    expect(tx.internalNote.create).toHaveBeenCalledTimes(1);
  });

  it("rejects a missing target without creating an orphaned audit record", async () => {
    const { service, tx, audit, events } = setup({ [InternalNoteEntityType.SUPPORT_CASE]: false });
    await expect(service.add(actor, InternalNoteEntityType.SUPPORT_CASE, entityId, "An internal note")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(tx.internalNote.create).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });
});
