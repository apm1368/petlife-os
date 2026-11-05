import { LostPetIncidentStatus } from "@prisma/client";
import { LostPetRenewalReminderWorker } from "./lost-pet-renewal-reminder.worker";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-11-05T09:00:00.000Z");

function dueIncident(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    petId: "22222222-2222-4222-8222-222222222222",
    status: LostPetIncidentStatus.SEARCHING,
    createdAt: new Date(now.getTime() - 30 * DAY),
    pet: { name: "Luna", householdId: "33333333-3333-4333-8333-333333333333" },
    household: {
      members: [
        { userId: "44444444-4444-4444-8444-444444444444" },
        { userId: "55555555-5555-4555-8555-555555555555" },
      ],
    },
    ...overrides,
  };
}

describe("LostPetRenewalReminderWorker", () => {
  const prisma = {
    lostPetIncident: { findMany: jest.fn(), updateMany: jest.fn() },
    domainEvent: { upsert: jest.fn() },
  };
  const notifications = { notify: jest.fn() };
  const worker = new LostPetRenewalReminderWorker(prisma as never, notifications as never);

  beforeEach(() => jest.resetAllMocks());

  it("notifies every household member exactly once for a 30-day active report and records the delivery marker", async () => {
    prisma.lostPetIncident.findMany.mockResolvedValue([dueIncident()]);
    prisma.domainEvent.upsert.mockResolvedValue({});
    prisma.lostPetIncident.updateMany.mockResolvedValue({ count: 1 });
    notifications.notify.mockResolvedValue({ created: true });

    await expect(worker.processDueReminders(now)).resolves.toBe(1);

    expect(prisma.lostPetIncident.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          renewalReminderSentAt: null,
          status: { in: ["OPEN", "SEARCHING", "SIGHTING_REPORTED"] },
          createdAt: { lte: new Date(now.getTime() - 30 * DAY) },
        }),
      }),
    );
    expect(notifications.notify).toHaveBeenCalledTimes(2);
    expect(notifications.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "lost_pet.renewal_due",
        entityType: "LostPetIncident",
        templateParams: { petName: "Luna" },
        metadata: { reminderAfterDays: 30 },
      }),
    );
    expect(prisma.lostPetIncident.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ renewalReminderSentAt: null }),
        data: { renewalReminderSentAt: now },
      }),
    );
  });

  it("does not mark the reminder delivered when creating its notification fails, so a later tick can retry safely", async () => {
    prisma.lostPetIncident.findMany.mockResolvedValue([dueIncident()]);
    prisma.domainEvent.upsert.mockResolvedValue({});
    notifications.notify.mockRejectedValue(new Error("temporary notification failure"));

    await expect(worker.processDueReminders(now)).rejects.toThrow("temporary notification failure");
    expect(prisma.lostPetIncident.updateMany).not.toHaveBeenCalled();
  });

  it("has no due work when all reports are new, closed, reunited, or already reminded", async () => {
    prisma.lostPetIncident.findMany.mockResolvedValue([]);
    await expect(worker.processDueReminders(now)).resolves.toBe(0);
    expect(notifications.notify).not.toHaveBeenCalled();
    expect(prisma.lostPetIncident.updateMany).not.toHaveBeenCalled();
  });
});
