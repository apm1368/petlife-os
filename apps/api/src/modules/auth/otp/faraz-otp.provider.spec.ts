import { MessagingSendFailedException } from "../../../common/errors/api-exception";
import { FarazOtpProvider } from "./faraz-otp.provider";

const configValues: Record<string, unknown> = {
  OTP_LENGTH: 6,
  OTP_TTL_SECONDS: 300,
  OTP_RESEND_COOLDOWN_SECONDS: 30,
  OTP_MAX_ATTEMPTS: 5,
  FARAZ_SMS_OTP_PATTERN_CODE: "approved-otp-uid",
  FARAZ_SMS_OTP_CODE_ATTRIBUTE: "code",
};

describe("FarazOtpProvider", () => {
  it("sends through the approved pattern and stores only a hash in Redis", async () => {
    const transaction = { set: jest.fn().mockReturnThis(), exec: jest.fn().mockResolvedValue([]) };
    const redis = { ttl: jest.fn().mockResolvedValue(-1), multi: jest.fn(() => transaction) };
    const faraz = { sendPattern: jest.fn().mockResolvedValue({ ok: true, providerMessageId: "send-1" }) };
    const provider = new FarazOtpProvider(redis as never, { get: (key: string) => configValues[key] } as never, faraz as never);

    await provider.sendOtp("+989121234567");

    expect(faraz.sendPattern).toHaveBeenCalledWith({
      patternCode: "approved-otp-uid",
      recipient: "+989121234567",
      attributes: { code: expect.stringMatching(/^\d{6}$/) },
    });
    const sentCode = faraz.sendPattern.mock.calls[0]![0].attributes.code as string;
    const stored = JSON.parse(transaction.set.mock.calls[0]![1] as string) as { codeHash: string };
    expect(stored.codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(transaction.set.mock.calls[0]![1]).not.toContain(sentCode);
    expect(transaction.exec).toHaveBeenCalledTimes(1);
  });

  it("does not create a usable challenge when the provider rejects the send", async () => {
    const redis = { ttl: jest.fn().mockResolvedValue(-1), multi: jest.fn() };
    const faraz = { sendPattern: jest.fn().mockResolvedValue({ ok: false, kind: "TRANSIENT", code: "PROVIDER_TIMEOUT" }) };
    const provider = new FarazOtpProvider(redis as never, { get: (key: string) => configValues[key] } as never, faraz as never);

    await expect(provider.sendOtp("+989121234567")).rejects.toBeInstanceOf(MessagingSendFailedException);
    expect(redis.multi).not.toHaveBeenCalled();
  });
});
