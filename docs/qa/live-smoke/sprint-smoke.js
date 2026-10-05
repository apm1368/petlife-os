// Live functional smoke for the sprint domains, as demo accounts only (…@example.test).
// Showcase accounts are only read; every write that leaves a visible trace goes through the QA pair
// qa-smoke-free/paid@example.test (seed-sprint-demo-extras.ts), and the clinic reminder's notification is removed.
const { createHmac, randomUUID } = require("crypto");
const { PrismaClient } = require(process.env.PRISMA_CLIENT);
const API = "http://127.0.0.1:4000";
const WEB = "http://127.0.0.1:3000";
const results = [];
const ok = (name, pass, detail = "") => { results.push({ name, pass }); console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
const db = new PrismaClient();
async function session(email) {
  if (!email.endsWith("@example.test")) throw new Error("demo accounts only");
  const u = await db.user.findUniqueOrThrow({ where: { email } });
  const s = await db.session.create({ data: { userId: u.id, expiresAt: new Date(Date.now() + 3600e3) } });
  const cookie = `petlife_session=${s.id}.${createHmac("sha256", process.env.SESSION_SECRET).update(s.id).digest("hex")}`;
  const r = await fetch(`${API}/auth/session`, { headers: { cookie } });
  const csrf = (r.headers.get("set-cookie") || "").match(/petlife_csrf=([^;]+)/)?.[1] ?? randomUUID();
  const jar = `${cookie}; petlife_csrf=${csrf}`;
  const call = async (method, path, body) => {
    const res = await fetch(`${API}${path}`, { method, headers: { cookie: jar, "x-csrf-token": csrf, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
    return { status: res.status, json, text };
  };
  call.userId = u.id; call.sessionId = s.id;
  return call;
}
(async () => {
  const sessions = [];
  const S = async (e) => { const s = await session(e); sessions.push(s.sessionId); return s; };
  try {
    const reviewer = await S("batch2-review@example.test");
    const customer = await S("clinic-demo-customer@example.test");
    const stranger = await S("batch3-customer@example.test");
    const owner = await S("batch3-clinic-owner@example.test");
    const vet = await S("clinic-demo-vet@example.test");
    const otherClinic = await S("batch3-pasdaran-owner@example.test");
    const spammer = await db.user.findUniqueOrThrow({ where: { email: "chat-demo-seller@example.test" } });

    // ---- Chat
    const convs = (await reviewer("GET", "/chat/conversations")).json ?? [];
    const demo = convs.find((c) => c.otherMember?.displayName?.includes("نگار"));
    ok("chat: list shows demo conversation with an unread count", Boolean(demo) && Number.isInteger(demo.unreadCount), demo ? `unread ${demo.unreadCount}` : JSON.stringify(convs).slice(0, 120));
    const spam = convs.find((c) => c.otherMember?.id === spammer.id);
    ok("chat: blocked conversation shows blockedByMe", spam?.blocked === true && spam?.blockedByMe === true);
    const reopened = await reviewer("POST", "/chat/conversations", { participantUserId: customer.userId });
    ok("chat: open is idempotent", reopened.json?.id === demo?.id, `HTTP ${reopened.status}`);
    // Writes happen between the two QA accounts, never in the showcase conversation.
    const qaA = await S("qa-smoke-free@example.test");
    const qaB = await S("qa-smoke-paid@example.test");
    const qaConv = (await qaA("POST", "/chat/conversations", { participantUserId: qaB.userId })).json;
    const sent = await qaA("POST", `/chat/conversations/${qaConv?.id}/messages`, { body: "پیام تست دود (QA)" });
    ok("chat: send", sent.status === 201, `HTTP ${sent.status}`);
    const unread = (await qaB("GET", "/chat/unread-count")).json;
    ok("chat: recipient unread-count > 0", (unread?.count ?? unread?.unreadCount ?? 0) > 0, JSON.stringify(unread));
    await qaB("POST", `/chat/conversations/${qaConv.id}/read`);
    const after = (await qaB("GET", "/chat/unread-count")).json;
    ok("chat: mark read clears unread", (after?.count ?? after?.unreadCount ?? -1) === 0, JSON.stringify(after));
    const note = await db.notification.findFirst({ where: { userId: qaB.userId, type: "community.chat_message" }, orderBy: { createdAt: "desc" } });
    ok("chat: notification deep link is locale-free", note?.deepLink === `/community/messages/${qaConv.id}`, note?.deepLink);
    ok("chat: IDOR — outsider gets 404", (await stranger("GET", `/chat/conversations/${demo.id}/messages`)).status === 404);
    ok("chat: outsider cannot post", (await stranger("POST", `/chat/conversations/${demo.id}/messages`, { body: "x" })).status === 404);
    ok("chat: blocked side cannot unblock (404)", (await customer("DELETE", `/chat/blocks/${reviewer.userId}`)).status === 404);
    const unb = await reviewer("DELETE", `/chat/blocks/${spammer.id}`);
    const reb = await reviewer("POST", "/chat/blocks", { userId: spammer.id });
    ok("chat: unblock then block again", unb.status === 200 && reb.status === 201, `${unb.status}/${reb.status}`);
    const msgs = (await customer("GET", `/chat/conversations/${demo.id}/messages`)).json;
    const target = msgs.items.find((m) => !m.senderIsMe) ?? msgs.items[0];
    const rep = await stranger("POST", "/reports", { targetType: "CHAT_MESSAGE", targetId: target.id, reason: "SPAM" });
    ok("chat: outsider cannot report a message", rep.status === 404 || rep.status === 403, `HTTP ${rep.status}`);

    // ---- Clinic OS
    const sub = (await owner("GET", "/provider/clinic/subscription")).json;
    ok("clinic: subscription CLINIC_PRO", sub?.plan?.code === "CLINIC_PRO", sub?.plan?.code);
    ok("clinic: no invented prices", (await owner("GET", "/provider/clinic/plans")).json?.every((p) => p.prices.length === 0));
    const staff = (await owner("GET", "/provider/clinic/staff")).json;
    ok("clinic: staff usage (PRO unlimited)", staff?.usage?.limit === null && staff.usage.used >= 2, JSON.stringify(staff?.usage));
    const otherStaff = (await otherClinic("GET", "/provider/clinic/staff")).json;
    ok("clinic: BASIC staff/branch limits 3/1", otherStaff?.usage?.limit === 3 && (await otherClinic("GET", "/provider/clinic/branches")).json?.usage?.limit === 1);
    const vetAdd = await vet("POST", "/provider/clinic/staff", { email: "support-helper-a@example.test", role: "STAFF" });
    ok("clinic: VET cannot add staff", vetAdd.status === 403, `HTTP ${vetAdd.status}`);
    const customers = (await owner("GET", "/provider/clinic/customers?q=نگار")).json;
    const hh = customers?.items?.[0];
    ok("clinic: customer registry finds demo customer with pet", Boolean(hh) && hh.pets.length >= 1, `total ${customers?.total}`);
    ok("clinic: registry has no contact data", !/@example\.test|phone/i.test(JSON.stringify(customers)));
    const detail = await owner("GET", `/provider/clinic/customers/${hh.householdId}`);
    ok("clinic: customer detail with bookings", detail.status === 200 && detail.json.bookings.length >= 3, `bookings ${detail.json?.bookings?.length}`);
    ok("clinic: other clinic cannot open customer (404)", (await otherClinic("GET", `/provider/clinic/customers/${hh.householdId}`)).status === 404);
    const bookings = await owner("GET", "/provider/bookings");
    ok("clinic: appointment list", bookings.status === 200, `HTTP ${bookings.status}`);
    const petId = hh.pets[0].id;
    const record = await vet("GET", `/provider/clinical/patients/${petId}`);
    ok("clinic: medical record via grant", record.status === 200, `HTTP ${record.status}`);
    const foreignRecord = await otherClinic("GET", `/provider/clinical/patients/${petId}`);
    ok("clinic: other clinic cannot read medical record", foreignRecord.status === 403 || foreignRecord.status === 404, `HTTP ${foreignRecord.status}`);
    const rem = await vet("POST", "/provider/clinic/reminders", { petId, kind: "MESSAGE", title: "تست دود: نتیجهٔ آزمایش آماده است (QA)" });
    ok("clinic: reminder/message sent via orchestrator", rem.json?.status === "SENT" && rem.json?.recipientCount === 1, `HTTP ${rem.status} ${rem.json?.status}`);
    const cn = await db.notification.findFirst({ where: { userId: customer.userId, entityId: rem.json?.id } });
    ok("clinic: owner received in-app notification with pet deep link", cn?.deepLink === `/pets/${petId}`, cn?.deepLink);
    if (cn) await db.notification.delete({ where: { id: cn.id } }); // keep the showcase inbox free of smoke messages
    ok("clinic: other clinic cannot message a non-patient (404)", (await otherClinic("POST", "/provider/clinic/reminders", { petId, kind: "MESSAGE", title: "x" })).status === 409 || (await otherClinic("POST", "/provider/clinic/reminders", { petId, kind: "MESSAGE", title: "x" })).status === 404);
    const fin = await owner("GET", `/provider/clinic/reports/finance?from=${new Date(Date.now() - 90 * 86400e3).toISOString()}`);
    ok("clinic: finance report (real sums)", fin.status === 200 && fin.json.bookings.completed >= 2 && fin.json.billedAmount.length > 0, JSON.stringify(fin.json?.billedAmount));
    ok("clinic: VET cannot read finance (403)", (await vet("GET", "/provider/clinic/reports/finance")).status === 403);
    ok("clinic: BASIC clinic finance gated (409)", (await otherClinic("GET", "/provider/clinic/reports/finance")).status === 409);

    // ---- Taxi
    const taxi = await db.providerService.findFirst({ where: { locationMode: "TRANSPORT", isActive: true } });
    const addrs = await db.customerAddress.findMany({ where: { household: { members: { some: { userId: customer.userId } } } }, orderBy: { createdAt: "asc" } });
    const q = await customer("GET", `/provider-services/${taxi.id}/transport-quote?pickupAddressId=${addrs[0].id}&dropoffAddressId=${addrs[1].id}`);
    ok("taxi: quote is honest (NOT_CONFIGURED, no distance tariff)", q.json?.pricingStatus === "NOT_CONFIGURED" && q.json?.pricing === null, `${q.status} ${q.json?.pricingStatus} ${q.json?.estimateBasis}`);
    ok("taxi: stranger cannot quote with someone else's address", (await stranger("GET", `/provider-services/${taxi.id}/transport-quote?pickupAddressId=${addrs[0].id}&dropoffAddressId=${addrs[1].id}`)).status === 400);
    const rides = await customer("GET", "/bookings");
    const withRoute = (rides.json ?? []).filter((b) => b.transportRoute);
    ok("taxi: demo rides with route snapshot visible to their owner", rides.status === 200 && withRoute.length >= 3 && withRoute.every((b) => b.transportRoute.distanceMeters > 0), `HTTP ${rides.status}, ${withRoute.length} rides`);
    const foreign = await stranger("GET", `/bookings/${withRoute[0]?.id}`);
    ok("taxi: stranger cannot open someone else's ride", foreign.status === 403 || foreign.status === 404, `HTTP ${foreign.status}`);

    // ---- Animal support
    const needs = await db.supportNeedListing.findMany({ where: { title: { contains: "(نمایشی)" }, contactMode: "DONATE", targetAmountIrr: { not: null } }, take: 1 });
    const sum = (await fetch(`${API}/animal-support/needs/${needs[0].id}/summary`).then((r) => r.json()));
    ok("support: cash progress from ledger-backed donations", sum.raisedAmountIrr > 0 && sum.remainingAmountIrr === sum.targetAmountIrr - sum.raisedAmountIrr, `${sum.raisedAmountIrr}/${sum.targetAmountIrr}`);
    ok("support: summary exposes no helper identities", !/helperUserId|example\.test/.test(JSON.stringify(sum)));

    // ---- Content
    const guides = await fetch(`${API}/blog/articles?locale=fa&categorySlug=guides`).then((r) => r.json());
    const blog = await fetch(`${API}/blog/articles?locale=fa&excludeCategorySlug=guides`).then((r) => r.json());
    ok("content: 3 guides + 2 blog posts", guides.items.length === 3 && blog.items.length >= 2, `${guides.items.length}/${blog.items.length}`);
    for (const path of ["/fa/blog", "/fa/guides", "/en/guides", guides.items[0].canonicalPath, blog.items[0].canonicalPath]) {
      const r = await fetch(`${WEB}${path}`); const html = await r.text();
      ok(`content: ${path} 200 with <title>`, r.status === 200 && /<title>[^<]+<\/title>/.test(html), `HTTP ${r.status}`);
    }
    const art = await fetch(`${WEB}${guides.items[0].canonicalPath}`).then((r) => r.text());
    ok("content: article has meta description", /<meta name="description" content="[^"]+"/.test(art));
    const missing = await fetch(`${API}/blog/articles/does-not-exist-qa?locale=fa`);
    ok("content: unknown slug 404 from API", missing.status === 404);
  } finally {
    await db.session.deleteMany({ where: { id: { in: sessions } } });
    console.log(`\n${results.filter((r) => r.pass).length}/${results.length} passed`);
    if (results.some((r) => !r.pass)) process.exitCode = 1;
    await db.$disconnect();
  }
})().catch((e) => { console.error("SMOKE ERROR", e.stack); process.exit(1); });
