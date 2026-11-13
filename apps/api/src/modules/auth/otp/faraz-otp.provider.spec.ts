import { MessagingSendFailedException, OtpRateLimitedException } from "../../../common/errors/api-exception";
import { FarazOtpProvider } from "./faraz-otp.provider";

const configValues: Record<string, unknown> = {
  OTP_RESEND_COOLDOWN_SECONDS: 30,
  FARAZ_SMS_OTP_PATTERN_CODE: "approved-otp-uid",
  FARAZ_SMS_OTP_CODE_ATTRIBUTE: "code",
};
const config = { get: (key: string) => configValues[key] } as never;

describe("FarazOtpProvider", () => {
  it("delivers the code it is handed through the approved pattern", async () => {
    const faraz = { sendPattern: jest.fn().mockResolvedValue({ ok: true, providerMessageId: "send-1" }) };
    await new FarazOtpProvider(config, faraz as never).deliver("+989121234567", "042137");
    expect(faraz.sendPattern).toHaveBeenCalledWith({ patternCode: "approved-otp-uid", recipient: "+989121234567", attributes: { code: "042137" } });
  });

  it("throws when the provider rejects the send, so no code is stored", async () => {
    const faraz = { sendPattern: jest.fn().mockResolvedValue({ ok: false, kind: "TRANSIENT", code: "PROVIDER_TIMEOUT" }) };
    await expect(new FarazOtpProvider(config, faraz as never).deliver("+989121234567", "042137")).rejects.toBeInstanceOf(MessagingSendFailedException);
  });

  it("maps the provider's own rate limit to OTP_RATE_LIMITED and refuses non-mobile recipients", async () => {
    const limited = { sendPattern: jest.fn().mockResolvedValue({ ok: false, kind: "TRANSIENT", code: "PROVIDER_HTTP_429" }) };
    await expect(new FarazOtpProvider(config, limited as never).deliver("+989121234567", "1")).rejects.toBeInstanceOf(OtpRateLimitedException);
    const faraz = { sendPattern: jest.fn() };
    await expect(new FarazOtpProvider(config, faraz as never).deliver("someone@example.com", "1")).rejects.toBeInstanceOf(MessagingSendFailedException);
    expect(faraz.sendPattern).not.toHaveBeenCalled();
  });
});
