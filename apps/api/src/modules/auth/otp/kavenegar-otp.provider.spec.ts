import { MessagingSendFailedException, OtpRateLimitedException } from "../../../common/errors/api-exception";
import { KAVENEGAR_OTP_MESSAGE, KavenegarOtpProvider } from "./kavenegar-otp.provider";

const configValues: Record<string, unknown> = { OTP_RESEND_COOLDOWN_SECONDS: 30, KAVENEGAR_OTP_TEMPLATE: "opetlifeotp" };
const config = { get: (key: string) => configValues[key] } as never;

describe("KavenegarOtpProvider", () => {
  it("without a Verify template, sends the code as the fixed plain-text Persian SMS (standard plan)", async () => {
    const plain = { get: (key: string) => ({ OTP_RESEND_COOLDOWN_SECONDS: 30 } as Record<string, unknown>)[key] } as never;
    const kavenegar = { send: jest.fn().mockResolvedValue({ ok: true, providerMessageId: "77" }), verifyLookup: jest.fn() };
    await new KavenegarOtpProvider(plain, kavenegar as never).deliver("+989121234567", "042137");
    expect(kavenegar.send).toHaveBeenCalledWith({ receptor: "+989121234567", message: "کد تأیید اپت لایف: 042137\nاین کد را به کسی ندهید." });
    expect(kavenegar.verifyLookup).not.toHaveBeenCalled();
    expect(KAVENEGAR_OTP_MESSAGE("1")).not.toMatch(/https?:|www\.|\.ir\b|\.com\b/);
  });

  it("with a Verify template, delivers the code it is handed as the Verify Lookup token", async () => {
    const kavenegar = { verifyLookup: jest.fn().mockResolvedValue({ ok: true, providerMessageId: "8792343" }) };
    await new KavenegarOtpProvider(config, kavenegar as never).deliver("+989121234567", "042137");
    expect(kavenegar.verifyLookup).toHaveBeenCalledWith({ receptor: "+989121234567", template: "opetlifeotp", token: "042137" });
  });

  it("throws when Kavenegar rejects the send (e.g. 426 advanced service off), so no code is stored", async () => {
    const kavenegar = { verifyLookup: jest.fn().mockResolvedValue({ ok: false, kind: "PERMANENT", code: "KAVENEGAR_426" }) };
    const error = await new KavenegarOtpProvider(config, kavenegar as never).deliver("+989121234567", "042137").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MessagingSendFailedException);
    expect(JSON.stringify((error as MessagingSendFailedException).getResponse())).not.toContain("042137");
  });

  it("maps Kavenegar's 451 (too many calls) to OTP_RATE_LIMITED and refuses non-mobile recipients", async () => {
    const limited = { verifyLookup: jest.fn().mockResolvedValue({ ok: false, kind: "TRANSIENT", code: "KAVENEGAR_451" }) };
    await expect(new KavenegarOtpProvider(config, limited as never).deliver("+989121234567", "1")).rejects.toBeInstanceOf(OtpRateLimitedException);
    const kavenegar = { verifyLookup: jest.fn() };
    await expect(new KavenegarOtpProvider(config, kavenegar as never).deliver("someone@example.com", "1")).rejects.toBeInstanceOf(MessagingSendFailedException);
    expect(kavenegar.verifyLookup).not.toHaveBeenCalled();
  });
});
