import { interpretKavenegarResponse, isTransientKavenegarStatus, KavenegarSmsClient } from "./kavenegar-sms.client";

const API_KEY = "4A6B-SECRET-KEY-0000";
const values: Record<string, unknown> = {
  KAVENEGAR_TIMEOUT_MS: 5000,
  KAVENEGAR_BASE_URL: "https://api.kavenegar.com",
  KAVENEGAR_API_KEY: API_KEY,
  KAVENEGAR_SENDER: "10004346",
};
const client = (overrides: Record<string, unknown> = {}) => new KavenegarSmsClient({ get: (key: string) => ({ ...values, ...overrides })[key] } as never);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const ok = (messageid: number, status = 1) => json({ return: { status: 200, message: "تایید شد" }, entries: [{ messageid, status, receptor: "09121234567" }] });

describe("KavenegarSmsClient", () => {
  afterEach(() => jest.restoreAllMocks());

  it("sends one-time codes through Verify Lookup as a form POST with the key only in the path", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValueOnce(ok(8792343));
    await expect(client().verifyLookup({ receptor: "+989121234567", template: "opetlifeotp", token: "042137" })).resolves.toEqual({ ok: true, providerMessageId: "8792343" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(`https://api.kavenegar.com/v1/${API_KEY}/verify/lookup.json`);
    expect(init?.method).toBe("POST");
    expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({ receptor: "09121234567", token: "042137", template: "opetlifeotp", type: "sms" });
    expect(String(init?.body)).not.toContain(API_KEY);
  });

  it("sends notifications as plain text with hide=1, and with the sender only when one is configured", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValueOnce(ok(1)).mockResolvedValueOnce(ok(2));
    await client().send({ receptor: "+989121234567", message: "نوبت شما فردا ساعت ۱۰" });
    await client({ KAVENEGAR_SENDER: undefined }).send({ receptor: "+989121234567", message: "hi" });
    const first = Object.fromEntries(new URLSearchParams(String(fetchMock.mock.calls[0]![1]?.body)));
    const second = Object.fromEntries(new URLSearchParams(String(fetchMock.mock.calls[1]![1]?.body)));
    expect(String(fetchMock.mock.calls[0]![0])).toBe(`https://api.kavenegar.com/v1/${API_KEY}/sms/send.json`);
    expect(first).toEqual({ receptor: "09121234567", message: "نوبت شما فردا ساعت ۱۰", hide: "1", sender: "10004346" });
    expect(second).toEqual({ receptor: "09121234567", message: "hi", hide: "1" });
  });

  it("reads the real code from the JSON body of a non-200 answer (418 no credit is permanent)", async () => {
    jest.spyOn(global, "fetch").mockResolvedValueOnce(json({ return: { status: 418, message: "اعتبار حساب شما کافی نیست" }, entries: null }, 418));
    await expect(client().send({ receptor: "+989121234567", message: "x" })).resolves.toEqual({ ok: false, kind: "PERMANENT", code: "KAVENEGAR_418" });
  });

  it("treats 451 (too many calls) as transient and falls back to the HTTP status when the body is not JSON", async () => {
    jest.spyOn(global, "fetch")
      .mockResolvedValueOnce(json({ return: { status: 451, message: "too many" }, entries: null }, 451))
      .mockResolvedValueOnce(new Response("<html>bad gateway</html>", { status: 502 }));
    await expect(client().verifyLookup({ receptor: "+989121234567", template: "opetlifeotp", token: "1" })).resolves.toEqual({ ok: false, kind: "TRANSIENT", code: "KAVENEGAR_451" });
    await expect(client().verifyLookup({ receptor: "+989121234567", template: "opetlifeotp", token: "1" })).resolves.toEqual({ ok: false, kind: "TRANSIENT", code: "KAVENEGAR_502" });
  });

  it("reduces timeouts and network errors to codes that never carry the request URL or key", async () => {
    const abort = Object.assign(new Error(`aborted https://api.kavenegar.com/v1/${API_KEY}/sms/send.json`), { name: "AbortError" });
    jest.spyOn(global, "fetch").mockRejectedValueOnce(abort).mockRejectedValueOnce(new TypeError(`fetch failed for /v1/${API_KEY}/sms/send.json`));
    const timeout = await client().send({ receptor: "+989121234567", message: "x" });
    const unreachable = await client().send({ receptor: "+989121234567", message: "x" });
    expect(timeout).toEqual({ ok: false, kind: "TRANSIENT", code: "PROVIDER_TIMEOUT" });
    expect(unreachable).toEqual({ ok: false, kind: "TRANSIENT", code: "PROVIDER_UNREACHABLE" });
    expect(JSON.stringify([timeout, unreachable])).not.toContain(API_KEY);
  });

  it("refuses bad input locally without calling Kavenegar", async () => {
    const fetchMock = jest.spyOn(global, "fetch");
    await expect(client().send({ receptor: "+12025550123", message: "x" })).resolves.toMatchObject({ ok: false, code: "INVALID_RECIPIENT" });
    await expect(client().send({ receptor: "+989121234567", message: "x".repeat(1801) })).resolves.toMatchObject({ ok: false, kind: "PERMANENT", code: "MESSAGE_TOO_LONG" });
    await expect(client().verifyLookup({ receptor: "+989121234567", template: "opetlifeotp", token: "12 34" })).resolves.toMatchObject({ ok: false, code: "INVALID_TOKEN" });
    await expect(client({ KAVENEGAR_API_KEY: undefined }).send({ receptor: "+989121234567", message: "x" })).resolves.toMatchObject({ ok: false, code: "KAVENEGAR_NOT_CONFIGURED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Kavenegar response classification", () => {
  it.each([402, 409, 451, 500, 503])("retries %s", (status) => expect(isTransientKavenegarStatus(status)).toBe(true));
  it.each([400, 401, 403, 407, 411, 412, 413, 418, 420, 424, 426, 427, 428, 429, 431, 432, 501, 607])("does not retry %s", (status) =>
    expect(isTransientKavenegarStatus(status)).toBe(false),
  );

  it("needs a message id on success and fails entries Kavenegar already marked undeliverable", () => {
    expect(interpretKavenegarResponse(200, { return: { status: 200 }, entries: [] })).toEqual({ ok: false, kind: "TRANSIENT", code: "INVALID_PROVIDER_RESPONSE" });
    expect(interpretKavenegarResponse(200, { return: { status: 200 }, entries: [{ messageid: 7, status: 14 }] })).toEqual({ ok: false, kind: "PERMANENT", code: "KAVENEGAR_ENTRY_14" });
    expect(interpretKavenegarResponse(200, { return: { status: 200 }, entries: [{ messageid: "7", status: 5 }] })).toEqual({ ok: true, providerMessageId: "7" });
  });
});
