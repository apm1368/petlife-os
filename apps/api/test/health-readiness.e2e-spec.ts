import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./test-app";

/** LIVE = process + HTTP listener; READY = PostgreSQL and Redis usable, reported per dependency (no hosts or errors). */
describe("Health: liveness and readiness", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => app.close());

  it("reports live and ready with per-dependency checks", async () => {
    expect((await request(app.getHttpServer()).get("/health/live").expect(200)).body).toEqual({ status: "ok" });
    expect((await request(app.getHttpServer()).get("/health/ready").expect(200)).body).toEqual({ status: "ok", checks: { database: "up", redis: "up" } });
  });
});
