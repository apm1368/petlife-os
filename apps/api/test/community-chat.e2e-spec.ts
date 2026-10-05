import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { signSessionCookie } from "../src/common/session/session-cookie.util";

/** Community chat v1 — participant-only, blockable, reportable, paginated, notified once. */
describe("Community chat", () => {
  let app: INestApplication, db: PrismaService;
  type Actor = { id: string; get: (u: string) => request.Test; post: (u: string) => request.Test; del: (u: string) => request.Test };
  async function actor(name: string): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `chat-${randomUUID()}@example.com` } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86400000) } });
    const res = await request(app.getHttpServer()).get("/health/live");
    const csrf = extractCookie(res.headers["set-cookie"], "petlife_csrf")!;
    const cookie = `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}`;
    const http = () => request(app.getHttpServer());
    return { id: user.id, get: (u) => http().get(u).set("Cookie", cookie), post: (u) => http().post(u).set("Cookie", cookie).set("x-csrf-token", csrf), del: (u) => http().delete(u).set("Cookie", cookie).set("x-csrf-token", csrf) };
  }
  beforeAll(async () => { app = await createTestApp(); db = app.get(PrismaService); });
  afterAll(async () => { await app?.close(); });

  it("opening a conversation is idempotent per pair, and messages flow with read state and unread counts", async () => {
    const maryam = await actor("مریم"), sara = await actor("سارا");
    const a = (await maryam.post("/chat/conversations").send({ participantUserId: sara.id }).expect(201)).body;
    const b = (await sara.post("/chat/conversations").send({ participantUserId: maryam.id }).expect(201)).body;
    expect(b.id).toBe(a.id);
    expect(a.otherMember).toEqual({ id: sara.id, displayName: "سارا", avatarUrl: null });
    expect(JSON.stringify(a)).not.toMatch(/@example\.com/); // no contact data
    await maryam.post(`/chat/conversations/${a.id}/messages`).send({ body: "  سلام! پشمک امروز چطور است؟  " }).expect(201);
    await maryam.post(`/chat/conversations/${a.id}/messages`).send({ body: "عکسش را دیدم." }).expect(201);
    expect((await sara.get("/chat/unread-count").expect(200)).body.unreadCount).toBe(2);
    expect((await maryam.get("/chat/unread-count").expect(200)).body.unreadCount).toBe(0);
    const page = (await sara.get(`/chat/conversations/${a.id}/messages`).expect(200)).body;
    expect(page.items.map((m: { body: string }) => m.body)).toEqual(["سلام! پشمک امروز چطور است؟", "عکسش را دیدم."]);
    expect(page.items[0].senderIsMe).toBe(false);
    await sara.post(`/chat/conversations/${a.id}/read`).expect(201);
    expect((await sara.get("/chat/unread-count").expect(200)).body.unreadCount).toBe(0);
    const notes = await db.notification.findMany({ where: { userId: sara.id, type: "community.chat_message" } });
    expect(notes).toHaveLength(2);
    expect(notes[0]!.deepLink).toBe(`/community/messages/${a.id}`);
  });

  it("only participants can read or write — everyone else gets the same 404 as a missing conversation", async () => {
    const x = await actor("x"), y = await actor("y"), outsider = await actor("outsider");
    const c = (await x.post("/chat/conversations").send({ participantUserId: y.id }).expect(201)).body;
    for (const id of [c.id, randomUUID()]) {
      await outsider.get(`/chat/conversations/${id}/messages`).expect(404);
      await outsider.post(`/chat/conversations/${id}/messages`).send({ body: "hi" }).expect(404);
      await outsider.post(`/chat/conversations/${id}/read`).expect(404);
    }
    expect((await outsider.get("/chat/conversations").expect(200)).body).toEqual([]);
    await request(app.getHttpServer()).get("/chat/conversations").expect(401);
    await x.post("/chat/conversations").send({ participantUserId: x.id }).expect(400);
    await x.post("/chat/conversations").send({ participantUserId: randomUUID() }).expect(404);
  });

  it("validates the body and paginates backwards", async () => {
    const p = await actor("p"), q = await actor("q");
    const c = (await p.post("/chat/conversations").send({ participantUserId: q.id }).expect(201)).body;
    await p.post(`/chat/conversations/${c.id}/messages`).send({ body: "   " }).expect(400);
    await p.post(`/chat/conversations/${c.id}/messages`).send({ body: "x".repeat(2001) }).expect(400);
    const base = Date.now() - 60_000;
    await db.chatMessage.createMany({ data: Array.from({ length: 35 }, (_, i) => ({ conversationId: c.id, senderUserId: q.id, body: `m${i}`, createdAt: new Date(base + i * 1000) })) });
    const first = (await p.get(`/chat/conversations/${c.id}/messages?limit=20`).expect(200)).body;
    expect([first.items.length, first.hasMore, first.items[19].body]).toEqual([20, true, "m34"]);
    const older = (await p.get(`/chat/conversations/${c.id}/messages?limit=20&before=${encodeURIComponent(first.items[0].createdAt)}`).expect(200)).body;
    expect([older.items.length, older.hasMore, older.items[0].body]).toEqual([15, false, "m0"]);
    await p.get(`/chat/conversations/${c.id}/messages?limit=500`).expect(400);
  });

  it("a block stops new conversations and messages both ways; history stays readable; unblock restores", async () => {
    const a = await actor("a"), b = await actor("b");
    const c = (await a.post("/chat/conversations").send({ participantUserId: b.id }).expect(201)).body;
    await a.post(`/chat/conversations/${c.id}/messages`).send({ body: "قبل از مسدودی" }).expect(201);
    await b.post("/chat/blocks").send({ userId: a.id }).expect(201);
    expect((await a.post(`/chat/conversations/${c.id}/messages`).send({ body: "x" }).expect(403)).body.error.code).toBe("CHAT_BLOCKED");
    await b.post(`/chat/conversations/${c.id}/messages`).send({ body: "x" }).expect(403);
    await a.post("/chat/conversations").send({ participantUserId: b.id }).expect(403);
    expect((await a.get(`/chat/conversations/${c.id}/messages`).expect(200)).body.items).toHaveLength(1);
    expect((await b.get("/chat/blocks").expect(200)).body.map((r: { userId: string }) => r.userId)).toEqual([a.id]);
    // Both see the conversation as blocked; only the blocker can lift it, and the blocked side cannot "unblock".
    const seen = async (who: typeof a) => (await who.get("/chat/conversations").expect(200)).body.find((x: { id: string }) => x.id === c.id);
    expect(await seen(a)).toMatchObject({ blocked: true, blockedByMe: false });
    expect(await seen(b)).toMatchObject({ blocked: true, blockedByMe: true });
    await a.del(`/chat/blocks/${b.id}`).expect(404);
    await b.del(`/chat/blocks/${a.id}`).expect(200);
    await b.del(`/chat/blocks/${a.id}`).expect(404);
    await a.post(`/chat/conversations/${c.id}/messages`).send({ body: "بعد از رفع مسدودی" }).expect(201);
  });

  it("a participant can report a message into the moderation queue; an outsider cannot; a removed message disappears", async () => {
    const a = await actor("ra"), b = await actor("rb"), outsider = await actor("ro");
    const c = (await a.post("/chat/conversations").send({ participantUserId: b.id }).expect(201)).body;
    const m = (await a.post(`/chat/conversations/${c.id}/messages`).send({ body: "پیام نامناسب" }).expect(201)).body;
    await outsider.post("/reports").send({ targetType: "CHAT_MESSAGE", targetId: m.id, reason: "HARASSMENT" }).expect(404);
    await b.post("/reports").send({ targetType: "CHAT_MESSAGE", targetId: m.id, reason: "HARASSMENT", details: "تهدیدآمیز" }).expect(201);
    expect(await db.communityReport.count({ where: { chatMessageId: m.id, status: "OPEN" } })).toBe(1);
    await db.chatMessage.update({ where: { id: m.id }, data: { status: "REMOVED" } });
    expect((await b.get(`/chat/conversations/${c.id}/messages`).expect(200)).body.items).toHaveLength(0);
  });

  it("per-member controls: archive, mute (notifications only), delete-for-self — none touch the other member", async () => {
    const a = await actor("a-ctrl"), b = await actor("b-ctrl"), outsider = await actor("o-ctrl");
    const c = (await a.post("/chat/conversations").send({ participantUserId: b.id }).expect(201)).body;
    await b.post(`/chat/conversations/${c.id}/messages`).send({ body: "first" }).expect(201);
    const ids = (who: typeof a, q = "") => who.get(`/chat/conversations${q}`).expect(200).then((r) => r.body.map((x: { id: string }) => x.id));

    // Archive: only a's inbox changes; a new incoming message brings it back.
    expect((await a.post(`/chat/conversations/${c.id}/archive`).expect(201)).body.archived).toBe(true);
    expect(await ids(a)).not.toContain(c.id);
    expect(await ids(a, "?archived=true")).toEqual([c.id]);
    expect(await ids(b)).toContain(c.id);
    await b.post(`/chat/conversations/${c.id}/messages`).send({ body: "back?" }).expect(201);
    expect(await ids(a)).toContain(c.id);

    // Mute: no notification, but the message and unread count are unchanged.
    expect((await a.post(`/chat/conversations/${c.id}/mute`).send({ duration: "ONE_DAY" }).expect(201)).body.mutedUntil).toBeTruthy();
    await a.post(`/chat/conversations/${c.id}/mute`).send({ duration: "ONE_YEAR" }).expect(400);
    const before = await db.notification.count({ where: { userId: a.id, type: "community.chat_message" } });
    await b.post(`/chat/conversations/${c.id}/messages`).send({ body: "while muted" }).expect(201);
    expect(await db.notification.count({ where: { userId: a.id, type: "community.chat_message" } })).toBe(before);
    expect((await a.get("/chat/unread-count").expect(200)).body.unreadCount).toBe(3);
    expect((await b.get("/chat/conversations").expect(200)).body.find((x: { id: string }) => x.id === c.id).mutedUntil).toBeNull();
    expect((await a.del(`/chat/conversations/${c.id}/mute`).expect(200)).body.mutedUntil).toBeNull();
    await b.post(`/chat/conversations/${c.id}/messages`).send({ body: "after unmute" }).expect(201);
    expect(await db.notification.count({ where: { userId: a.id, type: "community.chat_message" } })).toBe(before + 1);

    // Delete for self: gone from a's lists and history; b still has everything; nothing is deleted.
    const total = await db.chatMessage.count({ where: { conversationId: c.id } });
    await a.post(`/chat/conversations/${c.id}/delete-for-self`).expect(201);
    expect(await ids(a)).not.toContain(c.id);
    expect(await ids(a, "?archived=true")).not.toContain(c.id);
    expect((await a.get("/chat/unread-count").expect(200)).body.unreadCount).toBe(0);
    expect((await b.get(`/chat/conversations/${c.id}/messages`).expect(200)).body.items).toHaveLength(total);
    expect(await db.chatMessage.count({ where: { conversationId: c.id } })).toBe(total);
    // A new incoming message restores it for a, showing only what came after.
    await b.post(`/chat/conversations/${c.id}/messages`).send({ body: "new start" }).expect(201);
    expect(await ids(a)).toContain(c.id);
    expect((await a.get(`/chat/conversations/${c.id}/messages`).expect(200)).body.items.map((m: { body: string }) => m.body)).toEqual(["new start"]);

    // Participant-only: the outsider gets the same 404 for every control.
    for (const path of ["archive", "unarchive", "delete-for-self"]) await outsider.post(`/chat/conversations/${c.id}/${path}`).expect(404);
    await outsider.post(`/chat/conversations/${c.id}/mute`).send({ duration: "FOREVER" }).expect(404);
  });
});
