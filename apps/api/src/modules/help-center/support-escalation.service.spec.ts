import { SupportEscalationService } from "./support-escalation.service";
import type { PrismaService } from "../../common/prisma/prisma.service";
import type { SupportCaseService } from "../admin/support/support-case.service";

describe("support escalation transaction", () => {
  function setup(status = "OPEN", existing: object | null = null) {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ nextval: 1n }]),
      supportCase: { findUniqueOrThrow: jest.fn().mockResolvedValue({ status }) },
      supportEscalation: { findFirst: jest.fn().mockResolvedValue(existing), create: jest.fn().mockImplementation(async ({ data }) => data) },
    };
    const prisma = { $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
    const cases = { getForUser: jest.fn().mockResolvedValue({ status: "OPEN", caseNumber: "CASE-1" }) };
    const service = new SupportEscalationService(prisma as unknown as PrismaService, cases as unknown as SupportCaseService);
    return { service, prisma, tx, cases };
  }
  it("locks the ticket before checking for an existing escalation", async () => {
    const { service, tx } = setup();
    const result = await service.escalate("user", "case", { confirm: true, reason: "Help" });
    expect(result.referenceNumber).toBe("ESC-000001");
    const lockCall = tx.$queryRaw.mock.calls[0];
    if (!lockCall) throw new Error("Ticket lock was not acquired");
    expect(lockCall[0].join("?")).toContain("FROM support_cases WHERE id = ?::uuid FOR UPDATE");
    expect(tx.$queryRaw.mock.invocationCallOrder[0]!).toBeLessThan(tx.supportEscalation.findFirst.mock.invocationCallOrder[0]!);
  });
  it("reuses the escalation found after locking without allocating a new number", async () => {
    const existing = { caseId: "case", referenceNumber: "ESC-000008", confirmedAt: new Date() };
    const { service, tx } = setup("OPEN", existing);
    await expect(service.escalate("user", "case", { confirm: true, reason: "Retry" })).resolves.toMatchObject({ referenceNumber: "ESC-000008" });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.supportEscalation.create).not.toHaveBeenCalled();
  });
  it.each(["CLOSED", "RESOLVED"])("rejects a ticket changed to %s after ownership preflight", async (status) => {
    const { service, tx } = setup(status);
    await expect(service.escalate("user", "case", { confirm: true, reason: "Help" })).rejects.toThrow();
    expect(tx.supportEscalation.create).not.toHaveBeenCalled();
  });
  it("rejects an unrelated user before entering the transaction", async () => {
    const { service, prisma, cases } = setup();
    cases.getForUser.mockRejectedValue(new Error("not found"));
    await expect(service.escalate("stranger", "case", { confirm: true, reason: "Help" })).rejects.toThrow("not found");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
