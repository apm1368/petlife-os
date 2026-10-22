import { FarazSmsClient, toDomesticMobile } from "./faraz-sms.client";

const values: Record<string, unknown> = {
  FARAZ_SMS_TIMEOUT_MS: 5000,
  FARAZ_SMS_BASE_URL: "https://api.iranpayamak.com",
  FARAZ_SMS_API_KEY: "secret-key",
  FARAZ_SMS_SENDER: "90008361",
};

describe("FarazSmsClient", () => {
  afterEach(() => jest.restoreAllMocks());

  it("converts canonical Iranian E.164 numbers to the domestic format required by Faraz", () => {
    expect(toDomesticMobile("+989121234567")).toBe("09121234567");
    expect(toDomesticMobile("09121234567")).toBe("09121234567");
    expect(toDomesticMobile("+12025550123")).toBeNull();
  });

  it("calls the official Pattern endpoint with Api-Key and returns the send-request id", async () => {
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: 451 } }), { status: 201, headers: { "Content-Type": "application/json" } }));
    const client = new FarazSmsClient({ get: (key: string) => values[key] } as never);

    await expect(client.sendPattern({ patternCode: "otp-pattern", recipient: "+989121234567", attributes: { code: "123456" } })).resolves.toEqual({ ok: true, providerMessageId: "451" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.iranpayamak.com/ws/v1/sms/pattern");
    expect(init?.headers).toEqual(expect.objectContaining({ "Api-Key": "secret-key" }));
    expect(JSON.parse(String(init?.body))).toEqual({ code: "otp-pattern", attributes: { code: "123456" }, recipient: "09121234567", line_number: "90008361", number_format: "english" });
  });

  it.each([
    [429, "TRANSIENT"],
    [503, "TRANSIENT"],
    [422, "PERMANENT"],
  ])("classifies HTTP %s without exposing the response body", async (status, kind) => {
    jest.spyOn(global, "fetch").mockResolvedValueOnce(new Response("sensitive provider detail", { status }));
    const client = new FarazSmsClient({ get: (key: string) => values[key] } as never);
    await expect(client.sendPattern({ patternCode: "p", recipient: "+989121234567", attributes: { code: "123456" } })).resolves.toEqual({ ok: false, kind, code: `PROVIDER_HTTP_${status}` });
  });
});
