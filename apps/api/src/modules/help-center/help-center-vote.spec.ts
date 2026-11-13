import { Locale } from "@prisma/client";
import { HelpCenterService } from "./help-center.service";

describe("anonymous help feedback deduplication", () => {
  const tx = {
    helpArticle: { findFirst: jest.fn(), updateMany: jest.fn() },
    $executeRaw: jest.fn(),
  };
  const prisma = { $transaction: jest.fn(async (operation: (client: typeof tx) => Promise<unknown>) => operation(tx)) };
  const config = { get: jest.fn().mockReturnValue("test-only-session-secret-32-characters") };
  const service = new HelpCenterService(prisma as never, {} as never, config as never);

  beforeEach(() => {
    jest.clearAllMocks();
    tx.helpArticle.findFirst.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000001" });
    tx.helpArticle.updateMany.mockResolvedValue({ count: 1 });
    tx.$executeRaw.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
  });

  it("claims a pseudonymous daily key before incrementing without storing raw client details", async () => {
    await expect(service.vote(Locale.fa, "article", true, { ip: "203.0.113.17", userAgent: "test-browser" })).resolves.toEqual({ ok: true });
    expect(tx.helpArticle.updateMany).toHaveBeenCalledTimes(1);
    const sent = JSON.stringify(tx.$executeRaw.mock.calls);
    expect(sent).not.toContain("203.0.113.17");
    expect(sent).not.toContain("test-browser");
  });

  it("does not increment when a concurrent or repeated claim already exists", async () => {
    tx.$executeRaw.mockReset().mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    await service.vote(Locale.fa, "article", false, { ip: "203.0.113.17" });
    expect(tx.helpArticle.updateMany).not.toHaveBeenCalled();
  });

  it("does not claim or count a draft, missing or inactive-category article", async () => {
    tx.helpArticle.findFirst.mockResolvedValue(null);
    await expect(service.vote(Locale.fa, "article", true, { ip: "203.0.113.17" })).rejects.toThrow();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(tx.helpArticle.updateMany).not.toHaveBeenCalled();
  });

  it("fails closed when a client address is unavailable", async () => {
    await expect(service.vote(Locale.fa, "article", true, {})).rejects.toThrow("Feedback is temporarily unavailable");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
