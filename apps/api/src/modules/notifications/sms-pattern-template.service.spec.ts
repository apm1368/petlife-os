import { SmsPatternTemplateService } from "./sms-pattern-template.service";

describe("SmsPatternTemplateService", () => {
  it("resolves only active, locale-specific bindings and caches a short-lived read", async () => {
    const findFirst = jest
      .fn()
      .mockResolvedValue({
        key: "booking.confirmed",
        locale: "fa",
        farazPatternCode: "booking-fa",
        bodyAttributeKey: "message",
      });
    const service = new SmsPatternTemplateService({ smsPatternTemplate: { findFirst } } as never);
    await expect(service.resolve("booking.confirmed", "fa")).resolves.toMatchObject({
      farazPatternCode: "booking-fa",
    });
    await service.resolve("booking.confirmed", "fa");
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: "booking.confirmed", locale: "fa", isActive: true } }),
    );
  });

  it("does not resolve a pattern without both event key and locale", async () => {
    const findFirst = jest.fn();
    const service = new SmsPatternTemplateService({ smsPatternTemplate: { findFirst } } as never);
    await expect(service.resolve(undefined, "fa")).resolves.toBeNull();
    expect(findFirst).not.toHaveBeenCalled();
  });
});
