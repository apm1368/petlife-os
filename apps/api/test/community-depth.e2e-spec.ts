import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";

type Actor = { id: string; cookie: string; csrf: string };

/** Community depth: topics and city, saved posts, one-level replies, comment notifications, blocks. */
describe("Community — topics, replies, saved posts", () => {
  let app: INestApplication, db: PrismaService;
  const server = () => app.getHttpServer();
  const get = (a: Actor | null, u: string) => (a ? request(server()).get(u).set("Cookie", a.cookie) : request(server()).get(u));
  const send = (m: "post" | "delete", a: Actor, u: string) => request(server())[m](u).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);
  const city = `City-${randomUUID().slice(0, 6)}`;

  async function actor(name: string): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `g8-${randomUUID()}@example.com` } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86400000) } });
    const res = await request(server()).get("/health/live");
    const csrf = extractCookie(res.headers["set-cookie"], "petlife_csrf")!;
    return { id: user.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }
  const post = (a: Actor, extra: Record<string, unknown> = {}) => send("post", a, "/community/posts").send({ type: "GENERAL", body: "Hello", ...extra });

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
  });
  afterAll(async () => app.close());

  it("topics (max 3, fixed vocabulary) and broad city filter the feed", async () => {
    const a = await actor("author");
    await post(a, { topics: ["DOGS", "HEALTH", "TRAINING", "CATS"] }).expect(400);
    await post(a, { topics: ["ALIENS"] }).expect(400);
    await post(a, { topics: ["DOGS", "DOGS"] }).expect(400);
    const p1 = (await post(a, { topics: ["DOGS", "HEALTH"], city }).expect(201)).body;
    expect(p1).toMatchObject({ topics: ["DOGS", "HEALTH"], city });
    expect(Object.keys(p1)).not.toEqual(expect.arrayContaining(["latitude", "longitude"]));
    await post(a, { topics: ["CATS"], city }).expect(201);
    const dogs = (await get(null, `/community/posts?topic=DOGS&city=${encodeURIComponent(city)}`).expect(200)).body;
    expect(dogs.items.map((x: { id: string }) => x.id)).toEqual([p1.id]);
    expect((await get(null, `/community/posts?city=${encodeURIComponent(city.toLowerCase())}`).expect(200)).body.items).toHaveLength(2);
    await get(null, "/community/posts?topic=NOPE").expect(400);
  });

  it("saved posts are private to the member; removed posts can't be saved and drop out", async () => {
    const a = await actor("author");
    const b = await actor("saver");
    const c = await actor("other");
    const p = (await post(a).expect(201)).body;
    await send("post", b, `/community/posts/${p.id}/save`).expect(201);
    await send("post", b, `/community/posts/${p.id}/save`).expect(201);
    expect((await get(b, "/community/saved-posts").expect(200)).body.map((x: { id: string }) => x.id)).toEqual([p.id]);
    expect((await get(c, "/community/saved-posts").expect(200)).body).toEqual([]);
    await get(null, "/community/saved-posts").expect(401);
    // c "unsaving" b's bookmark touches only c's own (non-existent) bookmark.
    await send("delete", c, `/community/posts/${p.id}/save`).expect(200);
    expect((await get(b, "/community/saved-posts").expect(200)).body).toHaveLength(1);
    await db.communityPost.update({ where: { id: p.id }, data: { status: "REMOVED" } });
    expect((await get(b, "/community/saved-posts").expect(200)).body).toEqual([]);
    expect([403, 404]).toContain((await send("post", c, `/community/posts/${p.id}/save`)).status);
  });

  it("one level of replies; comment and reply notifications; hidden posts take no interaction", async () => {
    const a = await actor("author");
    const b = await actor("commenter");
    const c = await actor("replier");
    const p = (await post(a).expect(201)).body;
    const top = (await send("post", b, `/community/posts/${p.id}/comments`).send({ body: "Nice" }).expect(201)).body;
    expect(await db.notification.count({ where: { userId: a.id, type: "community.post_comment" } })).toBe(1);
    const reply = (await send("post", c, `/community/posts/${p.id}/comments`).send({ body: "Agreed", parentCommentId: top.id }).expect(201)).body;
    expect(reply.parentCommentId).toBe(top.id);
    expect(await db.notification.count({ where: { userId: b.id, type: "community.comment_reply", deepLink: `/community/posts/${p.id}` } })).toBe(1);
    // No reply-to-reply.
    await send("post", a, `/community/posts/${p.id}/comments`).send({ body: "deeper", parentCommentId: reply.id }).expect(404);
    // A parent on another post is refused.
    const other = (await post(a).expect(201)).body;
    await send("post", c, `/community/posts/${other.id}/comments`).send({ body: "x", parentCommentId: top.id }).expect(404);
    // Self-comment doesn't notify yourself.
    await send("post", a, `/community/posts/${p.id}/comments`).send({ body: "thanks" }).expect(201);
    expect(await db.notification.count({ where: { userId: a.id, type: "community.post_comment" } })).toBe(1);
    const list = (await get(null, `/community/posts/${p.id}/comments`).expect(200)).body;
    expect(list.items.map((x: { body: string }) => x.body)).toEqual(["Nice", "thanks"]);
    expect(list.items[0].replies.map((x: { body: string }) => x.body)).toEqual(["Agreed"]);
    expect(list.items[0].authorUserId).toBeNull();

    await db.communityPost.update({ where: { id: p.id }, data: { status: "HIDDEN" } });
    expect([403, 404]).toContain((await send("post", b, `/community/posts/${p.id}/comments`).send({ body: "x" })).status);
  });

  it("a block in either direction stops comments and replies between the two members", async () => {
    const a = await actor("author");
    const b = await actor("blocked");
    const c = await actor("neutral");
    const p = (await post(a).expect(201)).body;
    const top = (await send("post", c, `/community/posts/${p.id}/comments`).send({ body: "hi" }).expect(201)).body;
    await send("post", a, "/chat/blocks").send({ userId: b.id }).expect(201);
    expect((await send("post", b, `/community/posts/${p.id}/comments`).send({ body: "x" }).expect(403)).body.error.code).toBe("COMMUNITY_INTERACTION_BLOCKED");
    // b replying to c on a's post still addresses a's post → refused; b on c's own post is fine.
    await send("post", b, `/community/posts/${p.id}/comments`).send({ body: "x", parentCommentId: top.id }).expect(403);
    const cp = (await post(c).expect(201)).body;
    await send("post", b, `/community/posts/${cp.id}/comments`).send({ body: "ok" }).expect(201);
    // The blocker can't comment on the blocked member's post either.
    const bp = (await post(b).expect(201)).body;
    await send("post", a, `/community/posts/${bp.id}/comments`).send({ body: "x" }).expect(403);
  });
});
