import { previousDevSimulation } from "./live-server-env";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./test-app";

/**
 * On a server people use (dev simulation off) a sandbox payment mode must not let anyone "pay": no online gateway
 * or installment provider is offered, so orders, bookings, subscriptions, donations and trips can't be marked paid
 * without money moving. (The rest of the suite runs with DEV_SIMULATION_ENABLED=true to drive the sandbox.)
 */
describe("Payments: simulated outcomes are off on a live server", () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
    if (previousDevSimulation === undefined) delete process.env.DEV_SIMULATION_ENABLED;
    else process.env.DEV_SIMULATION_ENABLED = previousDevSimulation;
  });

  it("reports no online payment available in sandbox mode", async () => {
    const res = await request(app.getHttpServer()).get("/payments/environment").expect(200);
    expect(res.body).toEqual({ mode: "sandbox", onlinePaymentAvailable: false });
  });
});
