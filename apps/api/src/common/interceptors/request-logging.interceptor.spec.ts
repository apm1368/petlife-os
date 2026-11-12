import { loggedRoute } from "./request-logging.interceptor";

describe("loggedRoute", () => {
  it("logs the route template, never a bearer token from the path", () => {
    const token = "c2VjcmV0LXNoYXJlLXRva2Vu";
    const line = loggedRoute({ baseUrl: "", route: { path: "/health-shares/:token" }, path: `/health-shares/${token}`, url: `/health-shares/${token}?x=1` });
    expect(line).toBe("/health-shares/:token");
    expect(line).not.toContain(token);
  });

  it("drops the query string when no route matched", () => {
    expect(loggedRoute({ path: "/nowhere", url: "/nowhere?token=abc" })).toBe("/nowhere");
    expect(loggedRoute({ url: "/nowhere?token=abc" })).toBe("/nowhere");
  });
});
