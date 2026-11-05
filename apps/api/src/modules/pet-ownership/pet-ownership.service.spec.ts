import {
  HouseholdRole,
  PetOwnershipMemoryDisposition,
  PetOwnershipTransferStatus,
} from "@prisma/client";
import { PetOwnershipService } from "./pet-ownership.service";

/**
 * The household & pet-ownership rules (ID-01, ID-02, ID-03, ID-05, ID-06, ID-07).
 *
 * These are the decisions that decide who owns a pet and what follows it when it
 * moves. They are asserted here as behaviour, not as implementation: the pet must
 * have exactly one primary owner, a transfer must never apply without both
 * parties agreeing, and a dispute must never move the pet.
 */

const OWNER_ID = "owner-1";
const RECIPIENT_ID = "recipient-1";
const PET_ID = "pet-1";
const FROM_HOUSEHOLD = "household-from";
const TO_HOUSEHOLD = "household-to";

/** A minimal in-memory Prisma double covering only the tables this service touches. */
function makePrisma(overrides: Record<string, unknown> = {}) {
  const state = {
    ownership: new Map<string, { petId: string; ownerUserId: string; householdId: string; transferredAt: Date }>(),
    transfers: new Map<string, Record<string, unknown>>(),
    pets: new Map<string, { id: string; name: string; householdId: string; deletedAt: Date | null; createdAt: Date }>(),
    members: new Map<string, { householdId: string; userId: string; role: HouseholdRole; createdAt: Date }>(),
    memories: [] as Array<{ id: string; petId: string; householdId: string; createdByUserId: string }>,
    copies: [] as Array<{ memoryId: string; userId: string; householdId: string; petId: string }>,
    subscriptions: new Map<string, { id: string; householdId: string; payerUserId: string | null }>(),
  };

  const prisma: Record<string, unknown> = {
    pet: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => state.pets.get(where.id) ?? null),
      findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        [...state.pets.values()].filter((pet) => where.id.in.includes(pet.id)).map((pet) => ({ id: pet.id, name: pet.name })),
      ),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<{ householdId: string }> }) => {
        const pet = state.pets.get(where.id)!;
        Object.assign(pet, data);
        return pet;
      }),
    },
    petOwnership: {
      findUnique: jest.fn(async ({ where }: { where: { petId: string } }) => {
        const row = state.ownership.get(where.petId);
        if (!row) return null;
        return { ...row, owner: { displayName: "Owner" } };
      }),
      findMany: jest.fn(async ({ where }: { where: { ownerUserId?: string } }) =>
        [...state.ownership.values()]
          .filter((row) => !where.ownerUserId || row.ownerUserId === where.ownerUserId)
          .map((row) => ({ ...row, owner: { displayName: "Owner" } })),
      ),
      upsert: jest.fn(async ({ where, create, update }: { where: { petId: string }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const row = { ...(state.ownership.get(where.petId) ?? create) };
        Object.assign(row, update);
        state.ownership.set(where.petId, row as never);
        return row;
      }),
    },
    petOwnershipTransfer: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => state.transfers.get(where.id) ?? null),
      findUniqueOrThrow: jest.fn(async ({ where }: { where: { id: string } }) => {
        const row = state.transfers.get(where.id);
        if (!row) throw new Error(`Transfer ${where.id} not found`);
        return row;
      }),
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const rows = [...state.transfers.values()];
        if (where.petId && where.status) {
          const found = rows.find((row) => row.petId === where.petId && row.status === where.status);
          return found ?? null;
        }
        if (where.status && where.OR) {
          const found = rows.find((row) => row.status === where.status);
          return found ?? null;
        }
        return null;
      }),
      findMany: jest.fn(async () => [...state.transfers.values()]),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `transfer-${state.transfers.size + 1}`,
          status: PetOwnershipTransferStatus.PENDING_REVIEW,
          memoryDisposition: PetOwnershipMemoryDisposition.RETAIN,
          respondedAt: null,
          appliedAt: null,
          note: null,
          createdAt: new Date(),
          ...data,
        };
        state.transfers.set(row.id as string, row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = { ...state.transfers.get(where.id), ...data };
        state.transfers.set(where.id, row);
        return row;
      }),
      updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        let count = 0;
        for (const [id, row] of state.transfers) {
          if (where.id && typeof where.id === "object" && "in" in where.id && !(where.id as { in: string[] }).in.includes(id)) continue;
          if (where.status && row.status !== where.status) continue;
          Object.assign(row, data);
          count += 1;
        }
        return { count };
      }),
    },
    householdMember: {
      findUnique: jest.fn(async ({ where }: { where: { householdId_userId: { householdId: string; userId: string } } }) => {
        const { householdId, userId } = where.householdId_userId;
        const row = state.members.get(`${householdId}:${userId}`);
        if (!row) return null;
        return { ...row, user: { displayName: "Member" } };
      }),
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const rows = [...state.members.values()];
        if (where.userId) {
          const found = rows.find((row) => row.userId === where.userId);
          if (found) return { ...found, user: { displayName: "Member" } };
        }
        if (where.householdId && where.role) {
          const found = rows.find((row) => row.householdId === where.householdId && row.role === where.role);
          if (found) return { ...found, user: { displayName: "Member" } };
        }
        return null;
      }),
      findMany: jest.fn(async () => [...state.members.values()]),
      delete: jest.fn(async ({ where }: { where: { id: string } }) => {
        for (const [key, row] of state.members) {
          if (`${row.householdId}:${row.userId}` === key || row.userId === where.id) state.members.delete(key);
        }
        return { count: 1 };
      }),
    },
    user: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id, displayName: "User" })),
      findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.map((id) => ({ id, displayName: id === OWNER_ID ? "Owner" : "Recipient" })),
      ),
    },
    petMemory: {
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => state.memories.filter((m) => {
        if (where.householdId && m.householdId !== where.householdId) return false;
        if (where.createdByUserId && m.createdByUserId !== where.createdByUserId) return false;
        if (where.petId && m.petId !== where.petId) return false;
        return true;
      })),
      updateMany: jest.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        let count = 0;
        for (const memory of state.memories) {
          if (where.petId && memory.petId !== where.petId) continue;
          if (where.householdId && memory.householdId !== where.householdId) continue;
          Object.assign(memory, data);
          count += 1;
        }
        return { count };
      }),
    },
    petMemoryCopy: {
      createMany: jest.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
        let count = 0;
        for (const row of data) {
          const duplicate = state.copies.some((c) => c.memoryId === row.memoryId && c.userId === row.userId);
          if (duplicate) continue;
          state.copies.push(row as never);
          count += 1;
        }
        return { count };
      }),
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        state.copies
          .filter((copy) => !where.userId || copy.userId === where.userId)
          .map((copy) => ({ ...copy, id: `copy-${copy.memoryId}`, createdAt: new Date(), memory: { id: copy.memoryId, type: "PHOTO", title: null, description: null, occurredAt: new Date(), mediaObjectKeys: [], tags: [] }, pet: { name: "Pet" } })),
      ),    },
    petAccessGrant: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: `grant-${data.petId}-${data.userId}`, ...data })),
      updateMany: jest.fn(async () => ({ count: 1 })),
    },
    booking: { updateMany: jest.fn(async () => ({ count: 3 })) },
    careReminder: { count: jest.fn(async () => 4), updateMany: jest.fn(async () => ({ count: 4 })) },
    petExpense: { count: jest.fn(async () => 2) },
    subscription: {
      findUnique: jest.fn(async ({ where }: { where: { householdId: string } }) => state.subscriptions.get(where.householdId) ?? null),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = [...state.subscriptions.values()].find((s) => s.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
    },
    $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>): Promise<unknown> => callback(prisma)),
    ...overrides,
  };

  return { prisma, state };
}
function makeService(prisma: unknown) {
  const events = { publish: jest.fn(async () => undefined) };
  const notifications = { notify: jest.fn(async () => undefined) };
  const service = new PetOwnershipService(prisma as never, events as never, notifications as never);
  return { service, events, notifications };
}

function seedHouseholdWithPet() {
  const { prisma, state } = makePrisma();
  state.pets.set(PET_ID, { id: PET_ID, name: "Lulu", householdId: FROM_HOUSEHOLD, deletedAt: null, createdAt: new Date() });
  state.ownership.set(PET_ID, { petId: PET_ID, ownerUserId: OWNER_ID, householdId: FROM_HOUSEHOLD, transferredAt: new Date() });
  state.members.set(`${FROM_HOUSEHOLD}:${OWNER_ID}`, { householdId: FROM_HOUSEHOLD, userId: OWNER_ID, role: HouseholdRole.OWNER, createdAt: new Date() });
  state.members.set(`${TO_HOUSEHOLD}:${RECIPIENT_ID}`, { householdId: TO_HOUSEHOLD, userId: RECIPIENT_ID, role: HouseholdRole.OWNER, createdAt: new Date() });
  state.subscriptions.set(TO_HOUSEHOLD, { id: "sub-1", householdId: TO_HOUSEHOLD, payerUserId: null });
  return { prisma, state };
}

describe("pet ownership — ID-01: exactly one primary owner", () => {
  it("records the primary owner explicitly rather than inferring it from household role", async () => {
    const { prisma, state } = seedHouseholdWithPet();
    const { service } = makeService(prisma);

    const ownership = await service.getOwnership(PET_ID);

    expect(ownership?.ownerUserId).toBe(OWNER_ID);
    expect(state.ownership.get(PET_ID)?.ownerUserId).toBe(OWNER_ID);
  });

  it("falls back to the household's earliest owner for a pet created before the ownership table existed", async () => {
    const { prisma, state } = seedHouseholdWithPet();
    state.ownership.delete(PET_ID);
    const { service } = makeService(prisma);

    const ownership = await service.getOwnership(PET_ID);

    expect(ownership?.ownerUserId).toBe(OWNER_ID);
  });

  it("lists only the pets the caller is the primary owner of", async () => {
    const { prisma, state } = seedHouseholdWithPet();
    state.ownership.set("pet-2", { petId: "pet-2", ownerUserId: "someone-else", householdId: FROM_HOUSEHOLD, transferredAt: new Date() });
    const { service } = makeService(prisma);

    const owned = await service.listOwnedPets(OWNER_ID);

    expect(owned.map((pet) => pet.petId)).toEqual([PET_ID]);
  });
});

describe("pet ownership — ID-01: a transfer needs both parties' approval", () => {
  it("does not move the pet when the request is merely proposed", async () => {
    const { prisma, state } = seedHouseholdWithPet();
    const { service } = makeService(prisma);

    const transfer = await service.requestTransfer(PET_ID, OWNER_ID, RECIPIENT_ID, {});

    expect(transfer.status).toBe(PetOwnershipTransferStatus.PENDING_REVIEW);
    // The pet has not moved and the owner has not changed.
    expect(state.pets.get(PET_ID)?.householdId).toBe(FROM_HOUSEHOLD);
    expect(state.ownership.get(PET_ID)?.ownerUserId).toBe(OWNER_ID);
  });

  it("moves the pet and its ownership once the recipient accepts", async () => {
    const { prisma, state } = seedHouseholdWithPet();
    const { service } = makeService(prisma);
    const transfer = await service.requestTransfer(PET_ID, OWNER_ID, RECIPIENT_ID, {});

    const outcome = await service.acceptTransfer(transfer.id, RECIPIENT_ID);

    expect(outcome.transfer.status).toBe(PetOwnershipTransferStatus.ACCEPTED);
    expect(state.pets.get(PET_ID)?.householdId).toBe(TO_HOUSEHOLD);
    expect(state.ownership.get(PET_ID)?.ownerUserId).toBe(RECIPIENT_ID);
  });

  it("refuses to accept a transfer addressed to somebody else", async () => {
    const { prisma, state } = seedHouseholdWithPet();
    const { service } = makeService(prisma);
    const transfer = await service.requestTransfer(PET_ID, OWNER_ID, RECIPIENT_ID, {});

    await expect(service.acceptTransfer(transfer.id, "a-stranger")).rejects.toThrow();
    expect(state.pets.get(PET_ID)?.householdId).toBe(FROM_HOUSEHOLD);
  });

  it("refuses a proposal from anyone but the registered owner", async () => {
    const { prisma, state } = seedHouseholdWithPet();
    const { service } = makeService(prisma);

    await expect(service.requestTransfer(PET_ID, "a-stranger", RECIPIENT_ID, {})).rejects.toThrow();
    expect(state.transfers.size).toBe(0);
  });

  it("refuses a second pending request for the same pet", async () => {
    const { prisma } = seedHouseholdWithPet();
    const { service } = makeService(prisma);
    await service.requestTransfer(PET_ID, OWNER_ID, RECIPIENT_ID, {});

    await expect(service.requestTransfer(PET_ID, OWNER_ID, "another-user", {})).rejects.toThrow();
  });

  it("refuses a transfer to the current owner", async () => {
    const { prisma } = seedHouseholdWithPet();
    const { service } = makeService(prisma);

    await expect(service.requestTransfer(PET_ID, OWNER_ID, OWNER_ID, {})).rejects.toThrow();
  });

  it("applies the transfer only once, even if it is accepted twice", async () => {
    const { prisma, state } = seedHouseholdWithPet();
    const { service } = makeService(prisma);
    const transfer = await service.requestTransfer(PET_ID, OWNER_ID, RECIPIENT_ID, {});

    await service.acceptTransfer(transfer.id, RECIPIENT_ID);
    await expect(service.acceptTransfer(transfer.id, RECIPIENT_ID)).rejects.toThrow();
    expect(state.ownership.get(PET_ID)?.ownerUserId).toBe(RECIPIENT_ID);
  });

  it("gives the new owner access to the pet and ends the previous owner's owner-level grant", async () => {
    const { prisma } = seedHouseholdWithPet();
    const { service } = makeService(prisma);
    const transfer = await service.requestTransfer(PET_ID, OWNER_ID, RECIPIENT_ID, {});

    await service.acceptTransfer(transfer.id, RECIPIENT_ID);

    const access = prisma.petAccessGrant as { create: jest.Mock; updateMany: jest.Mock };
    // The new owner gets the owner's capabilities — ownership without access would
    // mean owning a pet you cannot open.
    const created = access.create.mock.calls[0][0].data;
    expect(created.userId).toBe(RECIPIENT_ID);
    expect(created.canViewHealth).toBe(true);
    expect(created.canManageAccess).toBe(true);
    // The previous owner's owner-level grant ends with the ownership.
    const revoked = access.updateMany.mock.calls[0][0].where;
    expect(revoked.userId).toBe(OWNER_ID);
    expect(revoked.canManageAccess).toBe(true);
  });
});

describe("pet ownership — ID-03: the platform does not judge ownership disputes", () => {
  it("leaves the registered owner in place when the recipient declines", async () => {
    const { prisma, state } = seedHouseholdWithPet();
    const { service } = makeService(prisma);
    const transfer = await service.requestTransfer(PET_ID, OWNER_ID, RECIPIENT_ID, {});

    const declined = await service.declineTransfer(transfer.id, RECIPIENT_ID);

    expect(declined.status).toBe(PetOwnershipTransferStatus.DECLINED);
    expect(state.ownership.get(PET_ID)?.ownerUserId).toBe(OWNER_ID);
    expect(state.pets.get(PET_ID)?.householdId).toBe(FROM_HOUSEHOLD);
  });

  it("records a dispute without moving the pet", async () => {
    const { prisma, state } = seedHouseholdWithPet();
    const { service } = makeService(prisma);
    const transfer = await service.requestTransfer(PET_ID, OWNER_ID, RECIPIENT_ID, {});

    const disputed = await service.raiseDispute(transfer.id, OWNER_ID, "the written agreement says otherwise");

    expect(disputed.status).toBe(PetOwnershipTransferStatus.DISPUTED);
    // ID-03: "the registered owner stays until an official ruling or a written agreement"
    expect(state.ownership.get(PET_ID)?.ownerUserId).toBe(OWNER_ID);
    expect(state.pets.get(PET_ID)?.householdId).toBe(FROM_HOUSEHOLD);
  });

  it("records a dispute raised after an accepted transfer without undoing the record", async () => {
    const { prisma, state } = seedHouseholdWithPet();
    const { service } = makeService(prisma);
    const transfer = await service.requestTransfer(PET_ID, OWNER_ID, RECIPIENT_ID, {});
    await service.acceptTransfer(transfer.id, RECIPIENT_ID);

    const disputed = await service.raiseDispute(transfer.id, OWNER_ID, "this should be reviewed");

    expect(disputed.status).toBe(PetOwnershipTransferStatus.DISPUTED);
    // The transfer already happened and stays on the record; the platform does not
    // silently reverse a transfer because one party objects afterwards.
    expect(state.ownership.get(PET_ID)?.ownerUserId).toBe(RECIPIENT_ID);
  });
});

describe("pet ownership — ID-05: what follows the pet", () => {
  it("keeps the costs behind with the household that paid them", async () => {
    const { prisma, state } = seedHouseholdWithPet();
    state.memories.push({ id: "mem-1", petId: PET_ID, householdId: FROM_HOUSEHOLD, createdByUserId: OWNER_ID });
    const { service } = makeService(prisma);
    const transfer = await service.requestTransfer(PET_ID, OWNER_ID, RECIPIENT_ID, {
      memoryDisposition: PetOwnershipMemoryDisposition.TRANSFER,
    });

    const outcome = await service.acceptTransfer(transfer.id, RECIPIENT_ID);

    // "the costs do not" travel: the expenses stay with the previous household.
    expect(outcome.retainedExpenses).toBe(2);
    expect(outcome.movedMemories).toBe(1);
  });

  it("moves the memories with the pet when the previous owner chooses TRANSFER", async () => {
    const { prisma, state } = seedHouseholdWithPet();
    state.memories.push({ id: "mem-1", petId: PET_ID, householdId: FROM_HOUSEHOLD, createdByUserId: OWNER_ID });
    const { service } = makeService(prisma);
    const transfer = await service.requestTransfer(PET_ID, OWNER_ID, RECIPIENT_ID, {
      memoryDisposition: PetOwnershipMemoryDisposition.TRANSFER,
    });

    await service.acceptTransfer(transfer.id, RECIPIENT_ID);

    expect(state.memories[0]!.householdId).toBe(TO_HOUSEHOLD);
  });

  it("leaves the memories behind when the previous owner chooses RETAIN", async () => {
    const { prisma, state } = seedHouseholdWithPet();
    state.memories.push({ id: "mem-1", petId: PET_ID, householdId: FROM_HOUSEHOLD, createdByUserId: OWNER_ID });
    const { service } = makeService(prisma);
    const transfer = await service.requestTransfer(PET_ID, OWNER_ID, RECIPIENT_ID, {
      memoryDisposition: PetOwnershipMemoryDisposition.RETAIN,
    });

    const outcome = await service.acceptTransfer(transfer.id, RECIPIENT_ID);

    expect(state.memories[0]!.householdId).toBe(FROM_HOUSEHOLD);
    expect(outcome.movedMemories).toBe(0);
  });

  it("gives the new owner a read-only copy when the previous owner chooses COPY_READ_ONLY", async () => {
    const { prisma, state } = seedHouseholdWithPet();
    state.memories.push({ id: "mem-1", petId: PET_ID, householdId: FROM_HOUSEHOLD, createdByUserId: OWNER_ID });
    const { service } = makeService(prisma);
    const transfer = await service.requestTransfer(PET_ID, OWNER_ID, RECIPIENT_ID, {
      memoryDisposition: PetOwnershipMemoryDisposition.COPY_READ_ONLY,
    });

    const outcome = await service.acceptTransfer(transfer.id, RECIPIENT_ID);

    // The original stays with the previous household; the new owner gets a read grant.
    expect(state.memories[0]!.householdId).toBe(FROM_HOUSEHOLD);
    expect(state.copies).toHaveLength(1);
    expect(state.copies[0]!.userId).toBe(RECIPIENT_ID);
    expect(outcome.movedMemories).toBe(1);
  });

  it("moves the bookings and the reminders with the pet", async () => {
    const { prisma } = seedHouseholdWithPet();
    const { service } = makeService(prisma);
    const transfer = await service.requestTransfer(PET_ID, OWNER_ID, RECIPIENT_ID, {});

    const outcome = await service.acceptTransfer(transfer.id, RECIPIENT_ID);

    // ID-06: "Bookings, subscriptions, and reminders move with the pet"
    expect(outcome.movedBookings).toBe(3);
    expect(outcome.movedReminders).toBe(4);
  });
});

describe("pet ownership — ID-07: the subscription payer moves and is suspended until approval", () => {
  it("makes the new owner the recorded payer", async () => {
    const { prisma, state } = seedHouseholdWithPet();
    const { service } = makeService(prisma);
    const transfer = await service.requestTransfer(PET_ID, OWNER_ID, RECIPIENT_ID, {});

    const outcome = await service.acceptTransfer(transfer.id, RECIPIENT_ID);

    expect(state.subscriptions.get(TO_HOUSEHOLD)?.payerUserId).toBe(RECIPIENT_ID);
    expect(outcome.subscriptionPayerChanged).toBe(true);
    expect(outcome.subscriptionSuspended).toBe(true);
  });
});

describe("pet ownership — ID-02: the read-only memory copies a separated member kept", () => {
  it("lists the copies back to the separated member", async () => {
    const { prisma, state } = seedHouseholdWithPet();
    state.copies.push({ memoryId: "mem-mine", userId: "leaving-member", householdId: FROM_HOUSEHOLD, petId: PET_ID });
    const { service } = makeService(prisma);

    const copies = await service.listMemoryCopies("leaving-member");

    expect(copies).toHaveLength(1);
    expect(copies[0]!.memoryId).toBe("mem-mine");
  });

  it("never lists another person's copies", async () => {
    const { prisma, state } = seedHouseholdWithPet();
    state.copies.push({ memoryId: "mem-mine", userId: "leaving-member", householdId: FROM_HOUSEHOLD, petId: PET_ID });
    const { service } = makeService(prisma);

    const copies = await service.listMemoryCopies("someone-else");

    expect(copies).toHaveLength(0);
  });
});
