import { MessagingProvider } from "@prisma/client";
import { KavenegarSmsAdapter } from "./kavenegar-sms.adapter";
import { MessagingProviderRegistry } from "./messaging-provider-registry.service";

const configWith = (values: Record<string, unknown>) => ({ get: (key: string) => values[key] }) as never;

describe("KavenegarSmsAdapter", () => {
  it("only simulates outside production mode", async () => {
    const kavenegar = { send: jest.fn() };
    const result = await new KavenegarSmsAdapter(configWith({ MESSAGING_SANDBOX_MODE: "sandbox" }), kavenegar as never).sendSms({ destination: "+989121234567", body: "x" });
    expect(result.status).toBe("SENT");
    expect(result.providerMessageId).toMatch(/^kavenegar-msg-/);
    expect(kavenegar.send).not.toHaveBeenCalled();
  });

  it("sends the body as plain text in production and reports Kavenegar's code on failure", async () => {
    const kavenegar = {
      send: jest.fn().mockResolvedValueOnce({ ok: true, providerMessageId: "55" }).mockResolvedValueOnce({ ok: false, kind: "PERMANENT", code: "KAVENEGAR_418" }),
    };
    const adapter = new KavenegarSmsAdapter(configWith({ MESSAGING_SANDBOX_MODE: "production" }), kavenegar as never);
    await expect(adapter.sendSms({ destination: "+989121234567", body: "سلام" })).resolves.toEqual({ status: "SENT", providerMessageId: "55" });
    expect(kavenegar.send).toHaveBeenCalledWith({ receptor: "+989121234567", message: "سلام" });
    await expect(adapter.sendSms({ destination: "+989121234567", body: "سلام" })).resolves.toMatchObject({ status: "FAILED", failureKind: "PERMANENT", failureCode: "KAVENEGAR_418" });
  });
});

describe("MessagingProviderRegistry with Kavenegar", () => {
  const dev = { provider: MessagingProvider.DEV };
  const faraz = { provider: MessagingProvider.FARAZ };
  const kavenegar = { provider: MessagingProvider.KAVENEGAR };

  it("resolves MESSAGING_PROVIDER=kavenegar to the Kavenegar adapter when KAVENEGAR_ENABLED", () => {
    const registry = new MessagingProviderRegistry(dev as never, faraz as never, kavenegar as never, configWith({ MESSAGING_PROVIDER: "kavenegar", KAVENEGAR_ENABLED: true }));
    expect(registry.resolveActiveSmsProvider()).toBe(kavenegar);
  });

  it("refuses Kavenegar while KAVENEGAR_ENABLED is off", () => {
    const registry = new MessagingProviderRegistry(dev as never, faraz as never, kavenegar as never, configWith({ MESSAGING_PROVIDER: "kavenegar", KAVENEGAR_ENABLED: false }));
    expect(() => registry.resolveActiveSmsProvider()).toThrow();
  });
});
