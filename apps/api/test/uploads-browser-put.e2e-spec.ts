import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { signSessionCookie } from "../src/common/session/session-cookie.util";

/**
 * A browser PUTs the file straight to the upload target with no API client and no CSRF header —
 * as it would to a presigned object-store URL. The token is the authorization; CSRF must not block it,
 * while every other mutation still requires the double-submit token.
 */
describe("Browser uploads to the local-storage upload target", () => {
  let app: INestApplication, db: PrismaService, cookie: string, csrf: string, petId: string;
  const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex");

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
    const user = await db.user.create({ data: { displayName: "Uploader", email: `upload-${randomUUID()}@example.com` } });
    const household = await db.household.create({ data: { name: "Upload household" } });
    await db.householdMember.create({ data: { householdId: household.id, userId: user.id, role: "OWNER" } });
    petId = (await db.pet.create({ data: { householdId: household.id, name: "Pistachio", species: "RABBIT" } })).id;
    await db.petAccessGrant.create({ data: { petId, userId: user.id, canEditIdentity: true, canViewHealth: true, canManageAccess: true } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86400000) } });
    const res = await request(app.getHttpServer()).get("/health/live");
    csrf = extractCookie(res.headers["set-cookie"], "petlife_csrf")!;
    cookie = `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}`;
  });
  afterAll(async () => { await app?.close(); });

  it("accepts the file PUT without a CSRF header and serves it publicly", async () => {
    const target = await request(app.getHttpServer()).post(`/pets/${petId}/photo-upload-url`).set("Cookie", cookie).set("x-csrf-token", csrf).send({ contentType: "image/png" }).expect(201);
    const path = new URL(target.body.uploadUrl).pathname.replace(/^\/api/, "");
    await request(app.getHttpServer()).put(path).set("Content-Type", "image/png").send(png).expect(200);
    // The token is single-use.
    await request(app.getHttpServer()).put(path).set("Content-Type", "image/png").send(png).expect(404);
  });

  it("an unknown token is refused", async () => {
    await request(app.getHttpServer()).put(`/uploads/${randomUUID()}`).set("Content-Type", "image/png").send(png).expect(404);
  });

  it("other mutations still require the CSRF token", async () => {
    await request(app.getHttpServer()).post(`/pets/${petId}/photo-upload-url`).set("Cookie", cookie).send({ contentType: "image/png" }).expect(403);
  });
});
