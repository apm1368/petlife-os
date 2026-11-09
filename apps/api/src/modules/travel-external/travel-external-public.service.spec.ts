import { ExternalPublishState, ExternalStayStatus } from "@prisma/client";
import { NotFoundApiException } from "../../common/errors/api-exception";
import { TravelExternalPublicService } from "./travel-external-public.service";

describe("TravelExternalPublicService outbound moderation", () => {
  it("only redirects published active or stale stays", async () => {
    const stay = {
      id: "stay-1",
      sourceUrl: "https://www.jajiga.com/room/123456",
      status: ExternalStayStatus.STALE,
      publishState: ExternalPublishState.PUBLISHED,
      source: { code: "JAJIGA", allowedHosts: ["www.jajiga.com"] },
    };
    const prisma = {
      externalStay: { findFirst: jest.fn().mockResolvedValue(stay) },
      outboundTravelClick: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new TravelExternalPublicService(prisma as never, {} as never);

    await expect(service.outbound("stay-1", null, null)).resolves.toBe("https://www.jajiga.com/room/123456");
    expect(prisma.externalStay.findFirst).toHaveBeenCalledWith({
      where: { id: "stay-1", publishState: ExternalPublishState.PUBLISHED, status: { in: [ExternalStayStatus.ACTIVE, ExternalStayStatus.STALE] } },
      include: { source: true },
    });
    expect(prisma.outboundTravelClick.create).toHaveBeenCalledTimes(1);
  });

  it.each([ExternalPublishState.DRAFT, ExternalPublishState.REJECTED])("does not create a redirect or click for %s records", async () => {
    const prisma = {
      externalStay: { findFirst: jest.fn().mockResolvedValue(null) },
      outboundTravelClick: { create: jest.fn() },
    };
    const service = new TravelExternalPublicService(prisma as never, {} as never);

    await expect(service.outbound("stay-1", null, null)).rejects.toBeInstanceOf(NotFoundApiException);
    expect(prisma.outboundTravelClick.create).not.toHaveBeenCalled();
  });
});
