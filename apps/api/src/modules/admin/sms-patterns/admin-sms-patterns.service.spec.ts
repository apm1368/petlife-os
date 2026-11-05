import { Locale } from "@prisma/client";
import { AdminSmsPatternsService } from "./admin-sms-patterns.service";

const now = new Date("2026-11-05T00:00:00.000Z");
const actor = { adminUserId: "admin-1" } as never;
const row = {
  id: "8f3e4ec9-2f9b-4be5-b4a0-8e1ee9862c13",
  key: "booking.confirmed",
  locale: Locale.fa,
  displayName: "Booking confirmation",
  farazPatternCode: "BOOKING_OK",
  bodyAttributeKey: "message",
  isActive: true,
  version: 1,
  createdAt: now,
  updatedAt: now,
};

describe("AdminSmsPatternsService", () => {
  function setup() {
    const tx = {
      smsPatternTemplate: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    const prisma = {
      smsPatternTemplate: { findMany: jest.fn(), create: jest.fn() },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const templates = { invalidate: jest.fn() };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    return { service: new AdminSmsPatternsService(prisma as never, templates as never, audit as never), prisma, tx, templates, audit };
  }

  it("persists only safe pattern metadata, invalidates its cache, and writes an append-only audit summary", async () => {
    const { service, prisma, templates, audit } = setup();
    prisma.smsPatternTemplate.create.mockResolvedValue(row);

    await expect(
      service.create(actor, row.key, Locale.fa, {
        displayName: "  Booking confirmation ",
        farazPatternCode: " BOOKING_OK ",
        bodyAttributeKey: " message ",
        isActive: true,
      }),
    ).resolves.toMatchObject({ id: row.id, key: row.key, version: 1 });

    expect(prisma.smsPatternTemplate.create).toHaveBeenCalledWith({
      data: {
        key: "booking.confirmed",
        locale: "fa",
        displayName: "Booking confirmation",
        farazPatternCode: "BOOKING_OK",
        bodyAttributeKey: "message",
        isActive: true,
        updatedByAdminId: "admin-1",
      },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "sms_pattern.created",
        entityId: row.id,
        afterSummary: expect.objectContaining({ key: row.key, farazPatternCode: row.farazPatternCode }),
      }),
    );
    expect(JSON.stringify(audit.record.mock.calls[0][0])).not.toMatch(/api.?key|credential|recipient|sms.?text/i);
    expect(templates.invalidate).toHaveBeenCalledWith("booking.confirmed", "fa");
  });

  it("rejects malformed event keys before making a database write", async () => {
    const { service, prisma } = setup();
    await expect(
      service.create(actor, "Booking confirmed", Locale.fa, {
        displayName: "Booking confirmation",
        farazPatternCode: "BOOKING_OK",
        bodyAttributeKey: "message",
        isActive: true,
      }),
    ).rejects.toThrow();
    expect(prisma.smsPatternTemplate.create).not.toHaveBeenCalled();
  });

  it("rejects a stale edit without mutating, invalidating a cache, or emitting an audit event", async () => {
    const { service, tx, templates, audit } = setup();
    tx.smsPatternTemplate.findUnique.mockResolvedValue(row);
    await expect(
      service.update(actor, row.id, 2, {
        displayName: "Changed",
        farazPatternCode: "BOOKING_CHANGED",
        bodyAttributeKey: "message",
        isActive: true,
      }),
    ).rejects.toThrow();
    expect(tx.smsPatternTemplate.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(templates.invalidate).not.toHaveBeenCalled();
  });
});
