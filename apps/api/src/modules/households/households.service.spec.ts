import { HouseholdRole, PetAccessSource } from "@prisma/client";
import { HouseholdsService } from "./households.service";

/**
 * The household separation rule (ID-02): "the separated member keeps a read-only
 * copy of the memories they recorded".
 *
 * The separation itself happens in this service (leave/removeMember) — it is where
 * membership changes live, and it is the only path that ends a member's household
 * access. The copy is made at the same moment the membership ends, so the
 * separated member never loses the memories they wrote and never keeps write
 * access to the pet.
 */

const HOUSEHOLD_ID = "household-1";
const OWNER_ID = "owner-1";
const LEAVING_ID = "leaving-member";

/** A minimal in-memory Prisma double covering the tables this path touches. */
function makePrisma() {
  const state = {
    members: new Map<string, { id: string; householdId: string; userId: string; role: HouseholdRole; createdAt: Date }>(),
    memories: [] as Array<{ id: string; petId: string; householdId: string; createdByUserId: string }>,
    copies: [] as Array<{ memoryId: string; userId: string; householdId: string; petId: string }>,
  };

  const prisma: Record<string, unknown> = {
    householdMember: {
      findUnique: jest.fn(async ({ where }: { where: { householdId_userId: { householdId: string; userId: string } } }) => {
        const { householdId, userId } = where.householdId_userId;
        return state.members.get(`${householdId}:${userId}`) ?? null;
      }),
      findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const rows = [...state.members.values()];
        if (where.id) return rows.find((row) => row.id === where.id) ?? null;
        if (where.userId) return rows.find((row) => row.userId === where.userId) ?? null;
        if (where.householdId && where.role) {
          return rows.find((row) => row.householdId === where.householdId && row.role === where.role) ?? null;
        }
        if (where.householdId) return rows.find((row) => row.householdId === where.householdId) ?? null;
        return null;
      }),
      delete: jest.fn(async ({ where }: { where: { id: string } }) => {
        for (const [key, row] of state.members) {
          if (row.id === where.id) state.members.delete(key);
        }
        return { count: 1 };
      }),
    },
    petMemory: {
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        state.memories.filter((memory) => {
          if (where.householdId && memory.householdId !== where.householdId) return false;
          if (where.createdByUserId && memory.createdByUserId !== where.createdByUserId) return false;
          return true;
        }),
      ),
    },
    petMemoryCopy: {
      createMany: jest.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
        let count = 0;
        for (const row of data) {
          // The unique index on (memoryId, userId) makes a repeated separation a no-op.
          if (state.copies.some((copy) => copy.memoryId === row.memoryId && copy.userId === row.userId)) continue;
          state.copies.push(row as never);
          count += 1;
        }
        return { count };
      }),
    },
    petAccessGrant: {
      updateMany: jest.fn(async () => ({ count: 2 })),
    },
    $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>): Promise<unknown> => callback(prisma)),
  };

  return { prisma, state };
}

function makeService(prisma: unknown) {
  const events = { publish: jest.fn(async () => undefined) };
  const notifications = { notify: jest.fn(async () => undefined) };
  return { service: new HouseholdsService(prisma as never, events as never, notifications as never), events, notifications };
}

function seed() {
  const { prisma, state } = makePrisma();
  state.members.set(`${HOUSEHOLD_ID}:${OWNER_ID}`, { id: "member-owner", householdId: HOUSEHOLD_ID, userId: OWNER_ID, role: HouseholdRole.OWNER, createdAt: new Date() });
  state.members.set(`${HOUSEHOLD_ID}:${LEAVING_ID}`, { id: "member-leaving", householdId: HOUSEHOLD_ID, userId: LEAVING_ID, role: HouseholdRole.FAMILY, createdAt: new Date() });
  return { prisma, state };
}

describe("household separation — ID-02: the separated member keeps a read-only copy of their memories", () => {
  it("copies only the memories the leaving member recorded", async () => {
    const { prisma, state } = seed();
    state.memories.push({ id: "mem-mine", petId: "pet-1", householdId: HOUSEHOLD_ID, createdByUserId: LEAVING_ID });
    state.memories.push({ id: "mem-theirs", petId: "pet-1", householdId: HOUSEHOLD_ID, createdByUserId: OWNER_ID });
    const { service } = makeService(prisma);

    const result = await service.leave(HOUSEHOLD_ID, LEAVING_ID);

    expect(result.copiedMemories).toBe(1);
    expect(state.copies).toHaveLength(1);
    expect(state.copies[0]!.memoryId).toBe("mem-mine");
    expect(state.copies[0]!.userId).toBe(LEAVING_ID);
  });

  it("copies the leaving member's memories when an owner removes them", async () => {
    const { prisma, state } = seed();
    state.memories.push({ id: "mem-mine", petId: "pet-1", householdId: HOUSEHOLD_ID, createdByUserId: LEAVING_ID });
    const { service } = makeService(prisma);

    const result = await service.removeMember(HOUSEHOLD_ID, "member-leaving", OWNER_ID);

    expect(result.copiedMemories).toBe(1);
    expect(state.copies[0]!.userId).toBe(LEAVING_ID);
  });

  it("ends the membership so the separated member loses household access", async () => {
    const { prisma, state } = seed();
    const { service } = makeService(prisma);

    await service.leave(HOUSEHOLD_ID, LEAVING_ID);

    expect(state.members.has(`${HOUSEHOLD_ID}:${LEAVING_ID}`)).toBe(false);
    // The owner keeps the household.
    expect(state.members.has(`${HOUSEHOLD_ID}:${OWNER_ID}`)).toBe(true);
  });

  it("revokes the separated member's household-issued pet grants", async () => {
    const { prisma } = seed();
    const { service } = makeService(prisma);

    await service.leave(HOUSEHOLD_ID, LEAVING_ID);

    const revoked = (prisma.petAccessGrant as { updateMany: jest.Mock }).updateMany;
    expect(revoked).toHaveBeenCalled();
    const args = revoked.mock.calls[0][0];
    expect(args.where.userId).toBe(LEAVING_ID);
    // A provider's booking grant or an explicit vet share is not the household's to revoke.
    expect(args.where.source).toEqual({ in: [PetAccessSource.HOUSEHOLD, PetAccessSource.MANUAL, PetAccessSource.TEMPORARY] });
  });

  it("copies nothing when the leaving member recorded no memories", async () => {
    const { prisma, state } = seed();
    state.memories.push({ id: "mem-theirs", petId: "pet-1", householdId: HOUSEHOLD_ID, createdByUserId: OWNER_ID });
    const { service } = makeService(prisma);

    const result = await service.leave(HOUSEHOLD_ID, LEAVING_ID);

    expect(result.copiedMemories).toBe(0);
    expect(state.copies).toHaveLength(0);
  });
});
