import { ClinicalVisitService } from "./clinical-visit.service";
import type { PrismaService } from "../../common/prisma/prisma.service";
import type { DomainEventsService } from "../../common/events/domain-events.service";
import type { ResolvedProviderContext } from "../provider-os/auth/provider-context.types";
import { InvalidClinicalVisitTransitionException, ProviderAccessDeniedException } from "../../common/errors/api-exception";

jest.mock("./clinical-health-mapper", () => ({ CLINICAL_VISIT_INCLUDE: {}, toClinicalVisitDto: (row: unknown) => row }));

describe("clinical notes finalization race", () => {
  const ctx = { organizationId: "clinic-a" } as ResolvedProviderContext;
  function setup(status = "IN_PROGRESS", organizationId = "clinic-a", count = 1) {
    const row = { id: "visit", petId: "pet", status, providerOrganizationId: organizationId };
    const tx = { clinicalVisit: { updateMany: jest.fn().mockResolvedValue({ count }), findUniqueOrThrow: jest.fn().mockResolvedValue({ ...row, planText: "saved" }) } };
    const prisma = { clinicalVisit: { findUnique: jest.fn().mockResolvedValue(row) }, $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
    return { service: new ClinicalVisitService(prisma as unknown as PrismaService, {} as DomainEventsService), prisma, tx };
  }
  it.each(["COMPLETED", "AMENDED", "VOIDED"])("rejects direct edits to %s before writing", async (status) => {
    const { service, prisma } = setup(status);
    await expect(service.updateNotes(ctx, "pet", "visit", { planText: "changed" })).rejects.toBeInstanceOf(InvalidClinicalVisitTransitionException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it("rejects an edit if completion wins after the preflight read", async () => {
    const { service, tx } = setup("IN_PROGRESS", "clinic-a", 0);
    await expect(service.updateNotes(ctx, "pet", "visit", { planText: "changed" })).rejects.toBeInstanceOf(InvalidClinicalVisitTransitionException);
    expect(tx.clinicalVisit.updateMany).toHaveBeenCalledWith({ where: { id: "visit", petId: "pet", providerOrganizationId: "clinic-a", status: { in: ["DRAFT", "IN_PROGRESS"] } }, data: { planText: "changed" } });
    expect(tx.clinicalVisit.findUniqueOrThrow).not.toHaveBeenCalled();
  });
  it("saves notes on an open visit", async () => {
    const { service } = setup();
    await expect(service.updateNotes(ctx, "pet", "visit", { planText: "saved" })).resolves.toMatchObject({ planText: "saved" });
  });
  it("denies an unrelated clinic before writing", async () => {
    const { service, prisma } = setup("IN_PROGRESS", "clinic-b");
    await expect(service.updateNotes(ctx, "pet", "visit", { planText: "changed" })).rejects.toBeInstanceOf(ProviderAccessDeniedException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
