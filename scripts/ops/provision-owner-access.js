#!/usr/bin/env node
/**
 * Owner access provisioning for the canonical server — idempotent, prints statuses only (never a password).
 *
 *   cd /var/www/petlife-os/apps/api && set -a && . ./.env && set +a && \
 *     PRISMA_CLIENT=/var/www/petlife-os/node_modules/.pnpm/node_modules/@prisma/client \
 *     node ../../scripts/ops/provision-owner-access.js
 *
 * 1. Owner admin: verifies the existing `pedram` SUPER_ADMIN signs in with its stored credential (normal
 *    /auth/login/password) and keeps that credential in /root/petlife-owner-admin-credential.txt (600). It never
 *    rotates a password the owner may already use; if the stored one fails it stops and says so.
 * 2. Review account (seed-owner-review.ts must have run): grants full consumer access as admin entitlement overrides
 *    mirroring the premium plan — through the admin API as the owner admin, so RBAC and the admin audit log apply.
 *    No subscription, payment or ledger row is created.
 * 3. Verifies the review account signs in and resolves every premium entitlement, then writes the access index.
 * Sessions it opens are signed out at the end.
 */
const { readFileSync, existsSync, writeFileSync, chmodSync } = require("node:fs");
const { PrismaClient } = require(process.env.PRISMA_CLIENT || "@prisma/client");

const API = process.env.API_ORIGIN || "http://127.0.0.1:4000";
const PUBLIC = process.env.OWNER_PUBLIC_ORIGIN || "http://185.231.112.154";
const ADMIN_FILE = "/root/petlife-owner-admin-credential.txt";
const LEGACY_ADMIN_FILE = "/root/petlife-owner-credential.txt";
const REVIEW_FILE = "/root/petlife-owner-review-credential.txt";
const INDEX_FILE = "/root/petlife-owner-access.txt";
const ADMIN_USERNAME = "pedram";
const REVIEW_EMAIL = "owner-review@example.test";
const REASON = "Owner manual review account — complimentary full consumer access (no payment)";

const out = [];
const report = (k, v) => { out.push(`${k}: ${v}`); console.log(`${k}: ${v}`); };
const write600 = (path, text) => { writeFileSync(path, text, { mode: 0o600 }); chmodSync(path, 0o600); };

function readCredential(path) {
  if (!existsSync(path)) return null;
  const text = readFileSync(path, "utf8");
  const pick = (...keys) => { for (const k of keys) { const m = text.match(new RegExp(`^${k}\\s*[:=]\\s*(.+)$`, "mi")); if (m) return m[1].trim(); } return null; };
  const username = pick("IDENTIFIER", "username");
  const password = pick("TEMP_PASSWORD", "password");
  return username && password ? { username, password } : null;
}

async function session(username, password) {
  const r0 = await fetch(`${API}/health/live`);
  const csrf = (r0.headers.get("set-cookie") || "").match(/petlife_csrf=([^;]+)/)?.[1];
  const jar = { csrf, cookie: `petlife_csrf=${csrf}` };
  const login = await fetch(`${API}/auth/login/password`, { method: "POST", headers: { "content-type": "application/json", cookie: jar.cookie, "x-csrf-token": csrf }, body: JSON.stringify({ username, password }) });
  if (login.status !== 200) return { ok: false, status: login.status };
  const sess = (login.headers.get("set-cookie") || "").match(/petlife_session=([^;]+)/)?.[1];
  jar.cookie = `petlife_session=${sess}; petlife_csrf=${csrf}`;
  const call = async (method, path, body) => {
    const res = await fetch(`${API}${path}`, { method, headers: { cookie: jar.cookie, "x-csrf-token": csrf, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    let json = null; try { json = await res.json(); } catch {}
    return { status: res.status, json };
  };
  return { ok: true, call, logout: () => call("POST", "/auth/logout") };
}

(async () => {
  const db = new PrismaClient();
  let failed = false;
  try {
    // ---------------------------------------------------------------- 1. owner admin
    const adminCred = readCredential(ADMIN_FILE) || readCredential(LEGACY_ADMIN_FILE);
    if (!adminCred || adminCred.username !== ADMIN_USERNAME) throw new Error("ADMIN_CREDENTIAL_MISSING — no stored credential for the owner admin; not rotating automatically");
    const admin = await session(adminCred.username, adminCred.password);
    if (!admin.ok) throw new Error(`ADMIN_LOGIN_FAILED (HTTP ${admin.status}) — stored credential no longer valid; not rotating automatically`);
    report("admin.login", "VERIFIED");
    if (!existsSync(ADMIN_FILE)) {
      write600(ADMIN_FILE, `ADMIN_URL=${PUBLIC}/fa/admin\nLOGIN_URL=${PUBLIC}/fa/account\nIDENTIFIER=${adminCred.username}\nTEMP_PASSWORD=${adminCred.password}\n# Change it after sign-in: Account → Security.\n`);
      report("admin.credentialFile", `CREATED ${ADMIN_FILE} (same credential as before, not rotated)`);
    } else report("admin.credentialFile", `ALREADY_PRESENT ${ADMIN_FILE}`);
    const me = await admin.call("GET", "/admin/me");
    report("admin.role", `${me.json?.role} (${me.json?.permissions?.length ?? 0} permissions, isAdmin=${me.json?.isAdmin})`);
    if (me.json?.role !== "SUPER_ADMIN") throw new Error("ADMIN_NOT_SUPER_ADMIN");

    // ---------------------------------------------------------------- 2. review entitlements
    const reviewUser = await db.user.findUnique({ where: { email: REVIEW_EMAIL } });
    if (!reviewUser) throw new Error("REVIEW_USER_MISSING — run prisma/seed-owner-review.ts first");
    const membership = await db.householdMember.findFirst({ where: { userId: reviewUser.id, role: "OWNER" } });
    const householdId = membership.householdId;
    const premium = await db.subscriptionPlan.findUnique({ where: { code: "premium" }, include: { entitlements: true } });
    const current = (await admin.call("GET", `/admin/subscriptions/households/${householdId}/entitlement-overrides`)).json ?? [];
    const active = (Array.isArray(current) ? current : current.items ?? []).filter((o) => o.active !== false);
    let granted = 0, present = 0;
    for (const e of premium.entitlements) {
      const same = active.find((o) => o.key === e.key && o.type === e.type && (e.type === "BOOLEAN" ? o.boolValue === e.boolValue : (o.limitValue ?? null) === (e.limitValue ?? null)));
      if (same) { present++; continue; }
      const res = await admin.call("POST", "/admin/subscriptions/entitlement-overrides", { householdId, key: e.key, type: e.type, ...(e.type === "BOOLEAN" ? { boolValue: e.boolValue } : { limitValue: e.limitValue }), reason: REASON });
      if (res.status >= 300) throw new Error(`OVERRIDE_FAILED ${e.key} HTTP ${res.status}`);
      granted++;
    }
    report("review.entitlementOverrides", `${granted} granted, ${present} already present (mirrors premium: ${premium.entitlements.length} keys)`);
    await admin.logout();

    // ---------------------------------------------------------------- 3. review login + access index
    const reviewCred = readCredential(REVIEW_FILE);
    if (!reviewCred) throw new Error("REVIEW_CREDENTIAL_MISSING — run the seed with OWNER_REVIEW_CREDENTIAL_FILE");
    const review = await session(reviewCred.username, reviewCred.password);
    if (!review.ok) throw new Error(`REVIEW_LOGIN_FAILED (HTTP ${review.status})`);
    const ent = (await review.call("GET", `/households/${householdId}/subscription/entitlements`)).json ?? [];
    const list = Array.isArray(ent) ? ent : ent.items ?? ent.entitlements ?? [];
    const missing = premium.entitlements.filter((e) => !list.some((r) => r.key === e.key && (e.type === "BOOLEAN" ? r.boolValue === true : r.limitValue === e.limitValue)));
    report("review.login", "VERIFIED");
    report("review.entitlements", missing.length ? `MISSING ${missing.map((m) => m.key).join(",")}` : "ALL_PREMIUM_FEATURES_RESOLVED");
    if (missing.length) failed = true;
    await review.logout();

    write600(INDEX_FILE, [
      `LIVE_URL=${PUBLIC}/`, `FA_URL=${PUBLIC}/fa`, `LOGIN_URL=${PUBLIC}/fa/account`, `ADMIN_URL=${PUBLIC}/fa/admin`,
      `ADMIN_IDENTIFIER=${adminCred.username}`, `ADMIN_CREDENTIAL_FILE=${ADMIN_FILE}`,
      `REVIEW_USER_IDENTIFIER=${reviewCred.username}`, `REVIEW_CREDENTIAL_FILE=${REVIEW_FILE}`, "",
    ].join("\n"));
    report("accessIndex", `WRITTEN ${INDEX_FILE}`);
  } catch (e) {
    failed = true;
    report("ERROR", e.message);
  } finally {
    await db.$disconnect();
    process.exit(failed ? 1 : 0);
  }
})();
