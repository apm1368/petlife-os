import { isPrivateAddress, safeFetch, SourceFetchError, validateSourceUrl } from "./safe-fetch";

jest.mock("node:dns/promises", () => ({ lookup: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const dns = require("node:dns/promises") as { lookup: jest.Mock };

describe("travel source fetching is SSRF-safe", () => {
  const hosts = ["jabama.com"];
  afterEach(() => jest.restoreAllMocks());

  it("classifies private, loopback, link-local/metadata and unique-local addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) expect(isPrivateAddress(ip)).toBe(true);
    for (const ip of ["8.8.8.8", "185.231.112.154", "2606:4700::1111"]) expect(isPrivateAddress(ip)).toBe(false);
  });

  it("only accepts https URLs on allowlisted hosts without credentials, ports or IP literals", () => {
    expect(validateSourceUrl("https://www.jabama.com/stay/1", hosts).hostname).toBe("www.jabama.com");
    expect(validateSourceUrl("https://jabama.com/x", hosts).hostname).toBe("jabama.com");
    for (const bad of ["http://www.jabama.com/x", "javascript:alert(1)", "https://evil.com/?jabama.com", "https://jabama.com.evil.com/x", "https://notjabama.com/x", "https://user:pw@jabama.com/x", "https://jabama.com:8443/x", "https://127.0.0.1/x", "data:text/html,hi", "//jabama.com/x"]) {
      expect(() => validateSourceUrl(bad, hosts)).toThrow(SourceFetchError);
    }
  });

  it("refuses hosts that resolve to private addresses", async () => {
    dns.lookup.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);
    await expect(safeFetch("https://www.jabama.com/robots.txt", hosts, { timeoutMs: 1000 })).rejects.toMatchObject({ category: "PRIVATE_ADDRESS" });
  });

  it("re-validates every redirect hop and reports WAF blocks as BLOCKED_BY_SOURCE", async () => {
    dns.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const fetchMock = jest.spyOn(global, "fetch").mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data" } }));
    await expect(safeFetch("https://www.jabama.com/a", hosts, { timeoutMs: 1000 })).rejects.toMatchObject({ category: "HOST_NOT_ALLOWED" });
    fetchMock.mockResolvedValueOnce(new Response("<title>Request Rejected</title>", { status: 403 }));
    await expect(safeFetch("https://www.jabama.com/robots.txt", hosts, { timeoutMs: 1000 })).rejects.toMatchObject({ category: "BLOCKED_BY_SOURCE" });
    fetchMock.mockResolvedValueOnce(new Response("slow down", { status: 429 }));
    await expect(safeFetch("https://www.jabama.com/robots.txt", hosts, { timeoutMs: 1000 })).rejects.toMatchObject({ category: "RATE_LIMITED" });
    fetchMock.mockResolvedValueOnce(new Response("User-agent: *", { status: 200, headers: { "content-type": "text/plain" } }));
    await expect(safeFetch("https://www.jabama.com/robots.txt", hosts, { timeoutMs: 1000 })).resolves.toMatchObject({ status: 200 });
    // Our identity is honest.
    expect((fetchMock.mock.calls.at(-1)![1] as RequestInit).headers).toMatchObject({ "user-agent": expect.stringContaining("PetLifeBot") });
  });
});
