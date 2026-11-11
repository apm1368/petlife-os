import { ExpressAdapter } from "@nestjs/platform-express";
import request from "supertest";
import { apiSecurityHeaders } from "./api-security-headers";

describe("API security headers", () => {
  it("keeps Helmet protections without duplicating edge-owned HSTS", async () => {
    const app = new ExpressAdapter().getInstance();
    app.set("trust proxy", "loopback");
    app.use(apiSecurityHeaders);

    const response = await request(app)
      .get("/health")
      .set("X-Forwarded-Proto", "https")
      .expect(404);

    expect(response.headers["strict-transport-security"]).toBeUndefined();
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-frame-options"]).toBeDefined();
    expect(response.headers["content-security-policy"]).toBeDefined();
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
  });
});
