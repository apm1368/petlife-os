// Live read smoke for the G8–G10 endpoints as the showcase demo account (read-only; its one session is removed).
const { createHmac } = require("crypto");
const { PrismaClient } = require(process.env.PRISMA_CLIENT);
const API = "http://127.0.0.1:4000";
(async () => {
  const db = new PrismaClient();
  const u = await db.user.findUniqueOrThrow({ where: { email: "batch2-review@example.test" } });
  const s = await db.session.create({ data: { userId: u.id, expiresAt: new Date(Date.now() + 600e3) } });
  const cookie = `petlife_session=${s.id}.${createHmac("sha256", process.env.SESSION_SECRET).update(s.id).digest("hex")}`;
  const hh = (await db.householdMember.findFirstOrThrow({ where: { userId: u.id, role: "OWNER" } })).householdId;
  const checks = [
    ["G8 community feed", "/community/posts", (b) => Array.isArray(b.items ?? b)],
    ["G8 chat conversations", "/chat/conversations", (b) => Array.isArray(b.items ?? b)],
    ["G8 chat archived", "/chat/conversations?archived=true", (b) => Array.isArray(b.items ?? b)],
    ["G9 notifications grouped", "/notifications/grouped", (b) => Array.isArray(b)],
    ["G9 digest prefs", "/notification-preferences/digest", (b) => b.deliveryStatus === "STORED_ONLY"],
    ["G9 subscription summary", `/households/${hh}/subscription/summary`, (b) => !!b.status && Array.isArray(b.usage)],
    ["G9 downgrade preview", `/households/${hh}/subscription/downgrade-preview?planCode=free`, (b) => b.dataDeleted === false],
    ["G9 activity feed", `/households/${hh}/activity`, (b) => b.items.length >= 4],
    ["G10 decisions", "/me/moderation-decisions", (b) => b.length >= 1],
    ["G10 appeals", "/me/appeals", (b) => b.length >= 1 && b[0].status === "SUBMITTED"],
    ["G10 saved", "/me/saved", (b) => b.length >= 1],
    ["G10 recently viewed", "/me/recently-viewed", (b) => b.length >= 2],
    ["G10 deletion impact", "/account/privacy/deletion/preview", (b) => Array.isArray(b.impact)],
    ["G10 public search", "/search?q=%D9%BE%D8%A7%D8%B1%DA%A9", (b) => typeof b.total === "number"],
  ];
  let pass = 0;
  for (const [name, path, fn] of checks) {
    const r = await fetch(API + path, { headers: name.includes("public") ? {} : { cookie } });
    let body = null; try { body = await r.json(); } catch {}
    const ok = r.status === 200 && fn(body);
    if (ok) pass++;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}  — HTTP ${r.status}${ok ? "" : " " + JSON.stringify(body).slice(0, 160)}`);
  }
  await db.session.delete({ where: { id: s.id } });
  console.log(`${pass}/${checks.length} passed`);
  if (pass !== checks.length) process.exitCode = 1;
  await db.$disconnect();
})();
