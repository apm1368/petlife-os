import { JajigaPublicWebAdapter } from "./jajiga.adapter";

describe("Jajiga adapter boundary", () => {
  it("checks only robots.txt and leaves discovery pending until source payload and coverage are verified", async () => {
    const adapter = new JajigaPublicWebAdapter();
    const getText = jest.fn().mockResolvedValue({ status: 200, body: "User-agent: *\nAllow: /\n", finalUrl: "https://www.jajiga.com/robots.txt", contentType: "text/plain" });
    const health = await adapter.healthCheck({ http: { getText } } as never);
    expect(health).toMatchObject({ ok: true, checkedUrl: "https://www.jajiga.com/robots.txt" });
    expect(adapter.parserReady).toBe(false);
    await expect(adapter.discover({} as never)).rejects.toMatchObject({ category: "PARSER_PENDING" });
    expect(getText).toHaveBeenCalledTimes(1);
  });
});
