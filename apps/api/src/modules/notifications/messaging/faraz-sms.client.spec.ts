import type { ConfigService } from "@nestjs/config";
import type { AppEnv } from "../../../config/env";
import { FarazSmsClient, FarazSmsError, toFarazRecipient } from "./faraz-sms.client";

function client(env: Partial<Record<keyof AppEnv, string>>) {
  const config = { get: (key: keyof AppEnv) => env[key] } as unknown as ConfigService<AppEnv, true>;
  return new FarazSmsClient(config);
}

function respond(status: number, body: unknown) {
  return jest.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

describe("FarazSmsClient", () => {
  afterEach(() => jest.restoreAllMocks());

  it("sends local mobile numbers, never +98", () => {
    expect(toFarazRecipient("+989121234567")).toBe("09121234567");
    expect(toFarazRecipient("989121234567")).toBe("09121234567");
    expect(toFarazRecipient("9121234567")).toBe("09121234567");
    expect(toFarazRecipient("09121234567")).toBe("09121234567");
  });

  it("posts a pattern send with the Api-Key header and the documented body", async () => {
    const fetchSpy = respond(201, { status: "success", data: 98765, messages: null });
    const id = await client({ FARAZ_SMS_API_KEY: "key-1", FARAZ_SMS_SENDER: "90008361" }).sendPattern({ code: "PAT1", recipient: "+989121234567", attributes: { code: "123456" } });
    expect(id).toBe("98765");
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://api.iranpayamak.com/ws/v1/sms/pattern");
    expect((init!.headers as Record<string, string>)["Api-Key"]).toBe("key-1");
    expect(JSON.parse(init!.body as string)).toEqual({ code: "PAT1", attributes: { code: "123456" }, recipient: "09121234567", line_number: "90008361", number_format: "english" });
  });

  it("maps the pattern form onto the create-pattern request (share as 0/1, numbered category)", async () => {
    const fetchSpy = respond(201, { status: "success", data: "NEWCODE", messages: null });
    await client({ FARAZ_SMS_API_KEY: "k", FARAZ_SMS_BASE_URL: "https://example.test/" }).createPattern({ text: "کد شما %code%", website: "opetlife.ir", shared: false, category: "otp", vars: [{ var: "code", length: 6, type: "int" }] });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://example.test/ws/v1/patterns");
    expect(JSON.parse(init!.body as string)).toEqual({ text: "کد شما %code%", description: "", share: 0, website: "opetlife.ir", category: 1, vars: [{ var: "code", length: 6, type: "int" }] });
  });

  it("reports provider validation errors as permanent and server errors as transient", async () => {
    respond(422, { status: "error", data: null, messages: { code: ["فیلد code باید ارسال شود"] } });
    const rejected = await client({ FARAZ_SMS_API_KEY: "k", FARAZ_SMS_SENDER: "1" }).sendPattern({ code: "X", recipient: "09121234567", attributes: {} }).catch((e) => e);
    expect(rejected).toBeInstanceOf(FarazSmsError);
    expect(rejected).toMatchObject({ httpStatus: 422, transient: false, providerMessages: ["فیلد code باید ارسال شود"] });

    respond(503, {});
    const down = await client({ FARAZ_SMS_API_KEY: "k", FARAZ_SMS_SENDER: "1" }).getBalance().catch((e) => e);
    expect(down).toMatchObject({ httpStatus: 503, transient: true });
  });

  it("treats an error envelope inside HTTP 200 as a failure", async () => {
    respond(200, { status: "error", data: null, messages: "Unauthorized" });
    await expect(client({ FARAZ_SMS_API_KEY: "k" }).getBalance()).rejects.toMatchObject({ providerMessages: ["Unauthorized"] });
  });

  it("refuses to call out without an API key", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch");
    await expect(client({}).getBalance()).rejects.toBeInstanceOf(FarazSmsError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
