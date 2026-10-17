// Live functional smoke through the real API, as the two dedicated QA accounts only (seeded by
// apps/api/prisma/seed-sprint-demo-extras.ts):
//   FREE  qa-smoke-free@example.test — free plan: paid features must be refused (409 SUBSCRIPTION_FEATURE_NOT_INCLUDED)
//   PAID  qa-smoke-paid@example.test — plus plan: the same features must work end to end
// Both scenarios are intentional; entitlement enforcement is asserted, never bypassed. The script edits each account's
// one seeded pet instead of creating pets, removes what it can (memory, vet share, sessions), and prints no secrets.
// Usage (on the server): set -a; . apps/api/.env; set +a; PRISMA_CLIENT=<…>/@prisma/client node functional-smoke.js
const { createHmac, randomUUID } = require("crypto");
const { PrismaClient } = require(process.env.PRISMA_CLIENT);
const API = process.env.API_ORIGIN || "http://127.0.0.1:4000";
const db = new PrismaClient();
const results = [];
const sessions = [];
const ok = (scenario, name, pass, detail = "") => { results.push({ pass }); console.log(`${pass ? "PASS" : "FAIL"}  [${scenario}] ${name}${detail ? "  — " + detail : ""}`); };

async function session(email) {
  if (!/^qa-smoke-(free|paid)@example\.test$/.test(email)) throw new Error("QA smoke accounts only");
  const u = await db.user.findUnique({ where: { email } });
  if (!u) throw new Error(`${email} missing — run seed-sprint-demo-extras.ts first`);
  const s = await db.session.create({ data: { userId: u.id, expiresAt: new Date(Date.now() + 900e3) } });
  sessions.push(s.id);
  const cookie = `petlife_session=${s.id}.${createHmac("sha256", process.env.SESSION_SECRET).update(s.id).digest("hex")}`;
  const r = await fetch(`${API}/auth/session`, { headers: { cookie } });
  const csrf = (r.headers.get("set-cookie") || "").match(/petlife_csrf=([^;]+)/)?.[1] ?? randomUUID();
  const jar = `${cookie}; petlife_csrf=${csrf}`;
  return async (method, path, body) => {
    const res = await fetch(`${API}${path}`, { method, headers: { cookie: jar, "x-csrf-token": csrf, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    return { status: res.status, json, text };
  };
}
const refused = (r, key) => r.status === 409 && r.json?.error?.code === "SUBSCRIPTION_FEATURE_NOT_INCLUDED" && r.json?.error?.details?.key === key;
const brief = (r) => `HTTP ${r.status}${r.status >= 300 ? " " + r.text.slice(0, 140) : ""}`;

async function context(call, scenario) {
  const hh = (await call("GET", "/households")).json?.[0];
  const pet = hh ? (await call("GET", `/households/${hh.id}/pets`)).json?.find?.((p) => p.name === "پت آزمون دودی (QA)") : null;
  ok(scenario, "seeded household + QA pet resolve", Boolean(hh?.id && pet?.id));
  if (!pet?.id) throw new Error("QA pet missing — run seed-sprint-demo-extras.ts");
  return { hh, pet };
}
async function vetShareBody(call, petId) {
  const vet = (await call("GET", `/pets/${petId}/vet-shares/providers`)).json?.[0];
  if (!vet) return null;
  return { providerUserId: vet.providerUserId ?? vet.id, scopes: ["ALLERGIES"], documentIds: [], startsAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400e3).toISOString() };
}

(async () => {
  const free = await session("qa-smoke-free@example.test");
  const paid = await session("qa-smoke-paid@example.test");

  // ---------------------------------------------------------------- FREE scenario
  {
    const { hh, pet } = await context(free, "FREE");
    const sub = (await free("GET", `/households/${hh.id}/subscription/summary`)).json;
    ok("FREE", "plan is free", sub?.plan?.isFree === true || sub?.plan === null, `plan ${sub?.plan?.code}`);
    const weight = Number((1 + Math.random()).toFixed(1));
    const edit = await free("PATCH", `/pets/${pet.id}`, { latestWeightValue: weight, latestWeightUnit: "KG" });
    ok("FREE", "core pet edit works on free plan", edit.status === 200 && Number((await free("GET", `/pets/${pet.id}`)).json?.latestWeightValue) === weight, brief(edit));
    const care = await free("POST", `/pets/${pet.id}/care-items`, { title: "کنترل وزن", type: "WEIGHT_CHECK", dueAt: new Date(Date.now() + 2 * 86400e3).toISOString(), recurrence: "ONCE" });
    ok("FREE", "care.reminders refused with entitlement error", refused(care, "care.reminders"), brief(care));
    const body = await vetShareBody(free, pet.id);
    if (body) {
      const share = await free("POST", `/pets/${pet.id}/vet-shares`, body);
      ok("FREE", "vet.share refused with entitlement error", refused(share, "vet.share"), brief(share));
    } else ok("FREE", "vet.share check skipped — no verified vet listed", true);
  }

  // ---------------------------------------------------------------- PAID scenario
  {
    const { hh, pet } = await context(paid, "PAID");
    const sub = (await paid("GET", `/households/${hh.id}/subscription/summary`)).json;
    ok("PAID", "plan is paid and active", sub?.plan?.isFree === false && sub?.status === "ACTIVE", `plan ${sub?.plan?.code} ${sub?.status}`);
    const stamp = `QA ${new Date().toISOString().slice(0, 16)}`;
    const edit = await paid("PATCH", `/pets/${pet.id}`, { colorMarkings: stamp });
    ok("PAID", "pet edit persists", edit.status === 200 && (await paid("GET", `/pets/${pet.id}`)).json?.colorMarkings === stamp, brief(edit));

    // Photo: signed upload target → PUT → attach → public read (storage wiring).
    const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex");
    const target = (await paid("POST", `/pets/${pet.id}/photo-upload-url`, { contentType: "image/png" })).json;
    if (target?.uploadUrl) {
      const put = await fetch(target.uploadUrl, { method: "PUT", headers: target.headers ?? { "content-type": "image/png" }, body: png });
      const attach = await paid("PATCH", `/pets/${pet.id}`, { photoUrl: target.publicUrl });
      const read = await fetch(target.publicUrl);
      ok("PAID", "pet photo upload → attach → public read", put.ok && attach.status === 200 && read.ok, `PUT ${put.status}, attach ${attach.status}, GET ${read.status}`);
    } else ok("PAID", "pet photo upload target", false, JSON.stringify(target).slice(0, 140));

    const mem = await paid("POST", `/pets/${pet.id}/memories`, { title: stamp, occurredAt: new Date().toISOString().slice(0, 10), type: "MILESTONE" });
    const listed = (await paid("GET", `/pets/${pet.id}/memories`)).json;
    ok("PAID", "memory create + list", Boolean(mem.json?.id) && Array.isArray(listed) && listed.some((m) => m.id === mem.json.id), brief(mem));
    if (mem.json?.id) ok("PAID", "memory removed (cleanup)", (await paid("DELETE", `/pets/${pet.id}/memories/${mem.json.id}`)).status < 300);

    const care = await paid("POST", `/pets/${pet.id}/care-items`, { title: "کنترل وزن", type: "WEIGHT_CHECK", dueAt: new Date(Date.now() + 2 * 86400e3).toISOString(), recurrence: "ONCE" });
    const cid = care.json?.id;
    ok("PAID", "care reminder create", Boolean(cid), brief(care));
    if (cid) {
      const snooze = await paid("POST", `/pets/${pet.id}/care-items/${cid}/actions`, { action: "SNOOZE", at: new Date(Date.now() + 4 * 86400e3).toISOString() });
      ok("PAID", "care snooze → SNOOZED", snooze.json?.state === "SNOOZED", brief(snooze));
      const done = await paid("POST", `/pets/${pet.id}/care-items/${cid}/actions`, { action: "COMPLETE" });
      ok("PAID", "care complete → COMPLETED", done.json?.state === "COMPLETED", brief(done));
      const again = await paid("POST", `/pets/${pet.id}/care-items/${cid}/actions`, { action: "COMPLETE" });
      ok("PAID", "completing twice: no 500", again.status < 500, `HTTP ${again.status}`);
    }

    const body = await vetShareBody(paid, pet.id);
    if (body) {
      const share = await paid("POST", `/pets/${pet.id}/vet-shares`, body);
      ok("PAID", "vet share create", share.status < 300 && Boolean(share.json?.id), brief(share));
      if (share.json?.id) ok("PAID", "vet share revoked (cleanup)", (await paid("POST", `/pets/${pet.id}/vet-shares/${share.json.id}/revoke`)).status < 300);
    } else ok("PAID", "vet share check skipped — no verified vet listed", true);

    // Cross-household: the FREE account must not see or change the PAID pet.
    for (const [label, path] of [["pet", `/pets/${pet.id}`], ["memories", `/pets/${pet.id}/memories`], ["care", `/pets/${pet.id}/care-items`]]) {
      const r = await free("GET", path);
      ok("PAID", `IDOR: other household cannot read ${label}`, r.status === 403 || r.status === 404, `HTTP ${r.status}`);
    }
    const w = await free("PATCH", `/pets/${pet.id}`, { name: "hijack" });
    ok("PAID", "IDOR: other household cannot edit pet", w.status === 403 || w.status === 404, `HTTP ${w.status}`);
    const disc = await paid("GET", "/discovery/providers?category=VET");
    ok("PAID", "discovery VET returns providers", (disc.json?.items ?? []).length > 0, `${(disc.json?.items ?? []).length} providers`);
  }
})()
  .catch((e) => { console.error("SMOKE ERROR", e.message); results.push({ pass: false }); })
  .finally(async () => {
    await db.session.deleteMany({ where: { id: { in: sessions } } });
    await db.$disconnect();
    const passed = results.filter((r) => r.pass).length;
    console.log(`\n${passed}/${results.length} passed`);
    process.exit(passed === results.length ? 0 : 1);
  });
