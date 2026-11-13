import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { createTestApp, extractCookie } from "./test-app";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { DomainEventsService } from "../src/common/events/domain-events.service";

type Actor = { id: string; cookie: string; csrf: string };

/** M6: authors edit and delete their own posts and comments; everyone else gets 404; moderator decisions reach the author. */
describe("Community — the author's own controls", () => {
  let app: INestApplication, db: PrismaService;
  const server = () => app.getHttpServer();
  const get = (a: Actor | null, u: string) => (a ? request(server()).get(u).set("Cookie", a.cookie) : request(server()).get(u));
  const send = (m: "post" | "patch" | "delete", a: Actor, u: string) => request(server())[m](u).set("Cookie", a.cookie).set("x-csrf-token", a.csrf);

  async function actor(name: string): Promise<Actor> {
    const user = await db.user.create({ data: { displayName: name, email: `m6-${randomUUID()}@example.com` } });
    const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86400000) } });
    const res = await request(server()).get("/health/live");
    const csrf = extractCookie(res.headers["set-cookie"], "petlife_csrf")!;
    return { id: user.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
  }
  const post = (a: Actor) => send("post", a, "/community/posts").send({ type: "GENERAL", title: "First", body: "Hello" }).expect(201);

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
  });
  afterAll(async () => app.close());

  it("only the author edits a published post; the edit is marked; type, pet and media stay as posted", async () => {
    const a = await actor("author");
    const b = await actor("stranger");
    const p = (await post(a)).body;
    expect(p.editedAt).toBeNull();
    await send("patch", b, `/community/posts/${p.id}`).send({ body: "Hijacked" }).expect(404);
    expect([401, 403]).toContain((await request(server()).patch(`/community/posts/${p.id}`).send({ body: "Anon" })).status);
    await send("patch", a, `/community/posts/${p.id}`).send({ body: "   " }).expect(400);
    await send("patch", a, `/community/posts/${p.id}`).send({ type: "ADOPTION", body: "x" }).expect(400);
    const edited = (await send("patch", a, `/community/posts/${p.id}`).send({ title: "Better", body: "Hello again", topics: ["DOG"] }).expect(200)).body;
    expect(edited).toMatchObject({ title: "Better", body: "Hello again", topics: ["DOG"], type: "GENERAL", isMine: true });
    expect(edited.editedAt).toEqual(expect.any(String));
    const seen = (await get(b, `/community/posts/${p.id}`).expect(200)).body;
    expect(seen).toMatchObject({ body: "Hello again", isMine: false, authorUserId: null });
    expect(seen.editedAt).toEqual(edited.editedAt);
  });

  it("a hidden or sourced post can't be edited, and a deleted post is gone for everyone", async () => {
    const a = await actor("author");
    const b = await actor("saver");
    const hidden = (await post(a)).body;
    await db.communityPost.update({ where: { id: hidden.id }, data: { status: "HIDDEN" } });
    await send("patch", a, `/community/posts/${hidden.id}`).send({ body: "Sneak it back" }).expect(404);
    await send("delete", a, `/community/posts/${hidden.id}`).expect(404);

    const sourced = (await post(a)).body;
    await db.communityPost.update({ where: { id: sourced.id }, data: { sourceType: "LOST_PET_INCIDENT" } });
    await send("patch", a, `/community/posts/${sourced.id}`).send({ body: "Changed" }).expect(404);

    const p = (await post(a)).body;
    await send("post", b, `/community/posts/${p.id}/save`).expect(201);
    await send("delete", b, `/community/posts/${p.id}`).expect(404);
    expect((await send("delete", a, `/community/posts/${p.id}`).expect(200)).body).toEqual({ deleted: true });
    await get(null, `/community/posts/${p.id}`).expect(404);
    expect((await get(b, "/community/saved-posts").expect(200)).body).toEqual([]);
    await send("delete", a, `/community/posts/${p.id}`).expect(404);
    const row = await db.communityPost.findUniqueOrThrow({ where: { id: p.id } });
    expect(row.status).toBe("REMOVED");
    expect(row.removedByAuthorAt).not.toBeNull();
    await send("post", b, `/community/posts/${p.id}/comments`).send({ body: "Too late" }).expect(404);
  });

  it("comments: only their author edits or deletes them; a deleted comment leaves the thread", async () => {
    const a = await actor("author");
    const b = await actor("commenter");
    const p = (await post(a)).body;
    const c = (await send("post", b, `/community/posts/${p.id}/comments`).send({ body: "Nice" }).expect(201)).body;
    await send("patch", a, `/community/comments/${c.id}`).send({ body: "Rude" }).expect(404);
    await send("delete", a, `/community/comments/${c.id}`).expect(404);
    await send("patch", b, `/community/comments/${c.id}`).send({ body: "" }).expect(400);
    const edited = (await send("patch", b, `/community/comments/${c.id}`).send({ body: "Very nice" }).expect(200)).body;
    expect(edited).toMatchObject({ body: "Very nice", isMine: true });
    expect(edited.editedAt).toEqual(expect.any(String));
    expect((await get(null, `/community/posts/${p.id}/comments`).expect(200)).body.items.map((x: { body: string }) => x.body)).toEqual(["Very nice"]);
    await send("delete", b, `/community/comments/${c.id}`).expect(200);
    expect((await get(null, `/community/posts/${p.id}/comments`).expect(200)).body.items).toEqual([]);
    await send("patch", b, `/community/comments/${c.id}`).send({ body: "Back" }).expect(404);
    await send("patch", b, `/community/comments/${randomUUID()}`).send({ body: "Nope" }).expect(404);
  });

  it("an open report freezes the text, so the reported words stay as reported; deleting stays possible", async () => {
    const a = await actor("author");
    const b = await actor("reporter");
    const p = (await post(a)).body;
    const c = (await send("post", a, `/community/posts/${p.id}/comments`).send({ body: "Original comment" }).expect(201)).body;
    await send("post", b, `/community/posts/${p.id}/report`).send({ reason: "SCAM", details: "Asks for a deposit" }).expect(201);
    await send("post", b, `/community/comments/${c.id}/report`).send({ reason: "ABUSE" }).expect(201);
    const frozen = await send("patch", a, `/community/posts/${p.id}`).send({ body: "Nothing to see" }).expect(409);
    expect(frozen.body.error.code).toBe("COMMUNITY_CONTENT_UNDER_REVIEW");
    await send("patch", a, `/community/comments/${c.id}`).send({ body: "Rewritten" }).expect(409);
    expect((await db.communityPost.findUniqueOrThrow({ where: { id: p.id } })).body).toBe("Hello");
    expect((await db.communityComment.findUniqueOrThrow({ where: { id: c.id } })).body).toBe("Original comment");
    // Once moderators close the reports, editing works again.
    await db.communityReport.updateMany({ where: { OR: [{ postId: p.id }, { commentId: c.id }] }, data: { status: "DISMISSED" } });
    await send("patch", a, `/community/posts/${p.id}`).send({ body: "Fixed typo" }).expect(200);
    // Deleting a reported post keeps its row (and words) for the moderators.
    await db.communityReport.updateMany({ where: { postId: p.id }, data: { status: "OPEN" } });
    await send("delete", a, `/community/posts/${p.id}`).expect(200);
    expect(await db.communityPost.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ status: "REMOVED", body: "Fixed typo" });
  });

  it("the author is told in-app when a moderator removes or restores their post", async () => {
    const a = await actor("author");
    const p = (await post(a)).body;
    const events = app.get(DomainEventsService);
    await events.publish("CommunityContentStatusChangedByModerator", { contentId: p.id, from: "PUBLISHED", to: "REMOVED", viaTrustAction: "REMOVE_CONTENT" }, { aggregateType: "CommunityContent", aggregateId: p.id });
    await events.publish("CommunityContentStatusChangedByModerator", { contentId: p.id, from: "REMOVED", to: "PUBLISHED", viaTrustAction: "RESTORE" }, { aggregateType: "CommunityContent", aggregateId: p.id });
    const notes = await db.notification.findMany({ where: { userId: a.id }, orderBy: { createdAt: "asc" }, select: { type: true, deepLink: true } });
    expect(notes).toEqual([
      { type: "community.content_removed", deepLink: "/community" },
      { type: "community.content_restored", deepLink: `/community/posts/${p.id}` },
    ]);
  });
});
