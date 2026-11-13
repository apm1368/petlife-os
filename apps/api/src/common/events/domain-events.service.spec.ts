import type { EventEmitter2 } from "@nestjs/event-emitter";
import type { Prisma } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import { DomainEventsService } from "./domain-events.service";

describe("DomainEventsService.stage", () => {
  const setup = () => {
    const order: string[] = [];
    const prisma = { domainEvent: { update: jest.fn(async () => { order.push("processed"); }) } };
    const tx = { domainEvent: { create: jest.fn(async () => { order.push("row in tx"); return { id: "e1" }; }) } };
    const emitter = { emitAsync: jest.fn(async () => { order.push("listeners"); return []; }) };
    const service = new DomainEventsService(prisma as unknown as PrismaService, emitter as unknown as EventEmitter2);
    return { order, prisma, tx: tx as unknown as Prisma.TransactionClient & typeof tx, emitter, service };
  };

  it("writes the event in the transaction and runs listeners only when dispatched afterwards", async () => {
    const { order, prisma, tx, emitter, service } = setup();
    const dispatch = await service.stage("SupportCaseCreated", { caseId: "c1" }, { tx, aggregateType: "SupportCase", aggregateId: "c1" });
    expect(order).toEqual(["row in tx"]);
    expect(emitter.emitAsync).not.toHaveBeenCalled();
    await dispatch();
    expect(order).toEqual(["row in tx", "listeners", "processed"]);
    expect(emitter.emitAsync).toHaveBeenCalledWith("SupportCaseCreated", { caseId: "c1" }, "e1");
    expect(prisma.domainEvent.update).toHaveBeenCalledWith({ where: { id: "e1" }, data: { processedAt: expect.any(Date) } });
  });

  it("records a failing listener on the event row instead of throwing at the caller", async () => {
    const { prisma, tx, emitter, service } = setup();
    emitter.emitAsync.mockRejectedValueOnce(new Error("sms down"));
    const dispatch = await service.stage("SupportCaseCreated", { caseId: "c1" }, { tx });
    await expect(dispatch()).resolves.toBeUndefined();
    expect(prisma.domainEvent.update).toHaveBeenCalledWith({ where: { id: "e1" }, data: { attemptCount: { increment: 1 }, lastError: "sms down" } });
  });
});
