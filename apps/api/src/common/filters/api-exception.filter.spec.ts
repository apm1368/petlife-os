import { HttpStatus, type ArgumentsHost } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ApiExceptionFilter } from "./api-exception.filter";

function host() {
  const res = { status: jest.fn(), json: jest.fn(), setHeader: jest.fn() };
  res.status.mockReturnValue(res);
  const h = { switchToHttp: () => ({ getResponse: () => res, getRequest: () => ({ requestId: "req-1" }) }) } as unknown as ArgumentsHost;
  return { res, h };
}

describe("ApiExceptionFilter", () => {
  it.each(["P2028", "P2024"])("answers a busy database (%s) with a retryable 503, not a 500", (code) => {
    const { res, h } = host();
    new ApiExceptionFilter().catch(new Prisma.PrismaClientKnownRequestError("Transaction already closed: timeout", { code, clientVersion: "test" }), h);
    expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(res.setHeader).toHaveBeenCalledWith("Retry-After", "3");
    expect(res.json).toHaveBeenCalledWith({ error: expect.objectContaining({ code: "SERVICE_BUSY", details: { retryable: true, prismaCode: code }, requestId: "req-1" }) });
  });

  it("still reports an unknown error as a 500", () => {
    const { res, h } = host();
    new ApiExceptionFilter().catch(new Error("boom"), h);
    expect(res.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(res.json).toHaveBeenCalledWith({ error: expect.objectContaining({ code: "INTERNAL_ERROR" }) });
  });
});
