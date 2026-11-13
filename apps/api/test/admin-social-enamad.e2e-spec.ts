import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AdminMembershipStatus, AdminRole } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PlatformSettingsService } from "../src/modules/platform-settings/platform-settings.service";

const KEYS = ["social.bale", "social.baleEnabled", "social.instagram", "trust.enamadEnabled", "trust.enamadId", "trust.enamadCode"];

/** Owner, 2026-11-13: social links per network (link + switch) and the eNamad seal, edited by settings.manage, audited. */
describe("admin social links and eNamad seal reach /settings/public", () => {
  let app: INestApplication, db: PrismaService, csrf: string;
  const anon = () => request(app.getHttpServer());
  const pub = async () => (await anon().get("/settings/public").expect(200)).body;

  async function admin(role: AdminRole) {
    const user = await db.user.create({ data: { displayName: `site ${role}`, email: `se-${randomUUID()}@example.com` } });
    const adminUser = await db.adminUser.create({ data: { userId: user.id, role, status: AdminMembershipStatus.ACTIVE } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86_400_000) } });
    const cookie = `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}`;
    const version = async (key: string) => ((await request(app.getHttpServer()).get("/admin/settings").set("Cookie", cookie).expect(200)).body as { key: string; version: number }[]).find((s) => s.key === key)!.version;
    /** Resolves to the response (the base version is read first), so callers assert on its status. */
    const put = async (key: string, value: unknown) => {
      const baseVersion = await version(key);
      return request(app.getHttpServer()).put(`/admin/settings/${key}`).set("Cookie", cookie).set("x-csrf-token", csrf).send({ value, baseVersion, reason: "owner request #7/#8" });
    };
    return { id: adminUser.id, put };
  }

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
    csrf = extractCookie((await anon().get("/health/live")).headers["set-cookie"], "petlife_csrf")!;
    await db.platformSetting.deleteMany({ where: { key: { in: KEYS } } });
  });
  afterAll(async () => {
    await db.platformSetting.deleteMany({ where: { key: { in: KEYS } } });
    await app?.close();
  });

  it("publishes a network's link only on its own host, with its switch, and the seal from id + code only", async () => {
    const editor = await admin(AdminRole.ADMIN);
    const viewer = await admin(AdminRole.OPERATIONS);
    expect(await pub()).toMatchObject({ "social.bale": null, "social.baleEnabled": true, "trust.enamadEnabled": false, "trust.enamadId": null, "trust.enamadCode": null });

    // settings.view alone can't edit.
    expect((await viewer.put("social.bale", "https://ble.ir/opetlife")).status).toBe(403);
    // Another host, plain http, or a look-alike domain is refused with a reason the admin page shows.
    for (const bad of ["https://evil.example/ble.ir", "https://ble.ir.evil.example/x"]) {
      const res = await editor.put("social.bale", bad);
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain("URL_HOST_NOT_ALLOWED");
    }
    expect((await editor.put("social.bale", "http://ble.ir/opetlife")).status).toBe(400);
    expect((await editor.put("social.bale", "https://ble.ir/opetlife")).status).toBe(200);
    expect((await pub())["social.bale"]).toBe("https://ble.ir/opetlife");
    expect((await editor.put("social.baleEnabled", false)).status).toBe(200);
    expect(await pub()).toMatchObject({ "social.bale": "https://ble.ir/opetlife", "social.baleEnabled": false });
    expect(await db.adminAuditLog.count({ where: { adminUserId: editor.id, action: "setting.changed", entityId: { in: ["social.bale", "social.baleEnabled"] } } })).toBe(2);

    // A link stored before the allowlist existed is never published off its network's host.
    await db.platformSetting.upsert({ where: { key: "social.instagram" }, create: { key: "social.instagram", value: "https://evil.example/insta", version: 1 }, update: { value: "https://evil.example/insta" } });
    await app.get(PlatformSettingsService).refresh();
    expect((await pub())["social.instagram"]).toBeNull();

    // eNamad: pasted HTML is refused; only the id and the code are stored.
    expect((await editor.put("trust.enamadCode", '<a href="https://trustseal.enamad.ir/?id=1"><img src=x></a>')).status).toBe(400);
    expect((await editor.put("trust.enamadId", "123456")).status).toBe(200);
    expect((await editor.put("trust.enamadCode", "AbC123xyz789")).status).toBe(200);
    expect((await editor.put("trust.enamadEnabled", true)).status).toBe(200);
    expect(await pub()).toMatchObject({ "trust.enamadEnabled": true, "trust.enamadId": "123456", "trust.enamadCode": "AbC123xyz789" });
  });
});
