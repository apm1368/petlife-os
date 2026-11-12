import { BookingReminderWorker } from "./booking-reminder.worker";
import type { PrismaService } from "../../common/prisma/prisma.service";
import type { NotificationOrchestratorService } from "../notifications/notification-orchestrator.service";

const now = new Date("2026-11-12T08:00:00Z");
const booking = (id: string, startInHours: number, bookedHoursBefore: number) => ({
  id,
  startAt: new Date(now.getTime() + startInHours * 3_600_000),
  createdAt: new Date(now.getTime() + (startInHours - bookedHoursBefore) * 3_600_000),
});

function setup(rows24: ReturnType<typeof booking>[], rows2: ReturnType<typeof booking>[] = [], claim = 1) {
  const notify = jest.fn().mockResolvedValue(undefined);
  const prisma = {
    booking: {
      findMany: jest.fn().mockResolvedValueOnce(rows24).mockResolvedValueOnce(rows2),
      updateMany: jest.fn().mockResolvedValue({ count: claim }),
      findUnique: jest.fn().mockImplementation(({ where }) =>
        Promise.resolve({ id: where.id, userId: "u1", petId: "p1", householdId: "h1", providerOrganizationId: "o1", startAt: new Date(now.getTime() + 23 * 3_600_000), pet: { name: "Milo" }, providerOrganization: { name: "Paw Clinic" } }),
      ),
    },
  };
  return { notify, prisma, worker: new BookingReminderWorker(prisma as unknown as PrismaService, { notify } as unknown as NotificationOrchestratorService) };
}

describe("BookingReminderWorker", () => {
  it("sends the 24-hour reminder once, with the Tehran time and a link to the booking", async () => {
    const { worker, notify, prisma } = setup([booking("b1", 23, 72)]);
    expect(await worker.process(now)).toBe(1);
    expect(prisma.booking.updateMany.mock.calls[0][0]).toMatchObject({ where: { id: "b1", reminder24hSentAt: null, bookingStatus: "CONFIRMED" } });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", type: "booking.reminder_24h", category: "BOOKING", deepLink: "/bookings/b1", templateParams: { petName: "Milo", providerName: "Paw Clinic", time: "10:30" } }));
  });

  it("marks but does not send a reminder for a booking made only shortly before", async () => {
    const { worker, notify, prisma } = setup([booking("b2", 23, 2)]);
    expect(await worker.process(now)).toBe(0);
    expect(prisma.booking.updateMany).toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("never sends twice when another worker already claimed the reminder", async () => {
    const { worker, notify } = setup([booking("b3", 23, 72)], [], 0);
    expect(await worker.process(now)).toBe(0);
    expect(notify).not.toHaveBeenCalled();
  });

  it("sends the 2-hour reminder from its own window", async () => {
    const { worker, notify } = setup([], [booking("b4", 1.75, 48)]);
    expect(await worker.process(now)).toBe(1);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: "booking.reminder_2h" }));
  });
});
