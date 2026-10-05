import type { INestApplication } from "@nestjs/common";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import request from "supertest";
import { PrismaClient } from "@prisma/client";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { signSessionCookie } from "../src/common/session/session-cookie.util";

/**
 * Final hardening — one cross-domain IDOR suite.
 *
 * Runs on its own database (<test db>_xdomain_test) loaded with every batch QA seed, so each
 * domain has realistic rows created the way the product creates them. Every parametrised
 * route of the running app is then called by an anonymous visitor and by a fresh account
 * that owns nothing, with ids from real rows: the last path parameter from a row of the
 * matching table, the other parameters from that row's own foreign keys.
 *
 * Positive control: the same GET is called as the row's real owner/member (or an admin for
 * /admin); a route counts as proven only when that call succeeds, so a refusal to the
 * attacker can't be an accident of a wrong id.
 */

// Public by design: anyone may read these (published catalogue, public listings, reviews).
const PUBLIC_GET = new Set([
  "/animal-support/campaigns/:campaignId",
  "/animal-support/campaigns/:campaignId/donors",
  "/animal-support/campaigns/:campaignId/updates",
  "/animal-support/needs/:listingId",
  "/animal-support/needs/:listingId/summary",
  "/animal-support/needs/:listingId/updates",
  "/animal-support/needs/:listingId/milestones",
  "/animal-support/organizations/:organizationId",
  "/animal-support/rescue-cases/:rescueCaseId",
  "/community/posts/:postId",
  "/community/posts/:postId/comments",
  "/discovery/providers/:providerId",
  "/insurance/products/:productId",
  "/insurance/providers/:providerId",
  "/lost-pets/:incidentId",
  "/places/:placeId",
  "/provider-services/:serviceId",
  "/provider-services/:serviceId/availability",
  "/provider-services/:serviceId/intake-form",
  "/providers/:providerId/reviews",
  "/providers/vets/:providerId",
  "/providers/vets/:providerId/availability",
  "/shop/products/:id",
  "/shop/products/:id/offers",
  "/shop/products/:id/reviews",
  "/travel/listings/:id",
  "/travel/listings/:id/reviews",
  "/travel/listings/:id/quote",
  "/travel/listings/:id/units/:unitId/calendar",
]);
// The caller acting on their own relationship with a public item (their favourite, their reaction).
const OWN_ACTION = new Set([
  "DELETE /community/posts/:postId/reactions",
  "POST /community/posts/:postId/reactions",
  "POST /places/favorites/:placeId",
  "DELETE /places/favorites/:placeId",
  "PUT /travel/listings/:id/favorite",
  "DELETE /travel/listings/:id/favorite",
  "PUT /shop/products/:id/favorite",
  "DELETE /shop/products/:id/favorite",
  "PUT /providers/:providerId/favorite",
  "DELETE /providers/:providerId/favorite",
  "POST /animal-support/needs/:listingId/save",
  "DELETE /animal-support/needs/:listingId/save",
  "POST /animal-support/organizations/:organizationId/follow",
  "DELETE /animal-support/organizations/:organizationId/follow",
  "POST /animal-support/organizations/:organizationId/volunteer",
  "DELETE /animal-support/organizations/:organizationId/volunteer",
]);

const PARAM_ALIASES: Record<string, string[]> = {
  sellerId: ["sellerOrganizationId"],
  providerId: ["providerOrganizationId", "insuranceProviderId"],
  listingId: ["travelListingId", "supportNeedListingId", "marketplaceListingId"],
  campaignId: ["supportCampaignId"],
  organizationId: ["animalSupportOrganizationId"],
};
const HINT_TABLES: Record<string, string[]> = {
  listing: ["support_need_listings", "travel_listings", "marketplace_listings"],
  need: ["support_need_listings"],
  campaign: ["support_campaigns"],
  organization: ["animal_support_organizations"],
  incident: ["lost_pet_incidents"],
  lost_pet: ["lost_pet_incidents"],
  sighting: ["lost_pet_sightings"],
  post: ["community_posts"],
  seller: ["seller_organizations"],
  provider: ["provider_organizations", "insurance_providers"],
  vet: ["provider_organizations"],
  document: ["medical_documents"],
  observation: ["pet_observations"],
  visit: ["clinical_visits"],
  plan: ["clinical_nutrition_plans", "rehab_plans", "subscription_plans"],
  record: ["dental_records", "health_records"],
  application: ["insurance_applications"],
  product: ["products", "insurance_products"],
  service: ["provider_services"],
  booking: ["bookings", "travel_bookings"],
  trip: ["trips"],
  memory: ["pet_memories", "memories"],
  case: ["trust_cases", "support_cases"],
  condition: ["conditions"],
  share: ["vet_shares", "travel_booking_document_shares"],
  order: ["orders", "seller_orders"],
  offer: ["seller_offers", "help_offers"],
  hospitalization: ["hospitalizations"],
  place: ["pet_friendly_places"],
  customer: ["users"],
  unit: ["travel_units", "travel_listing_units"],
  inventory_item: ["inventory_items"],
  promotion: ["promotions"],
};
const OWNER_KEYS = ["userId", "customerUserId", "ownerUserId", "createdByUserId", "donorUserId", "reporterUserId", "authorUserId", "travelerUserId", "requesterUserId", "creatorUserId", "requestedByUserId", "uploadedByUserId", "recordedByUserId"];
const SEEDS = ["seed-batch2.ts", "seed-batch3.ts", "seed-batch4.ts", "seed-batch5.ts", "seed-batch6.ts", "seed-batch8.ts"];

type Row = Record<string, unknown> & { id: string; __t: string };
const snake = (s: string) => s.replace(/-/g, "_").replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
const singular = (s: string) => s.replace(/ies$/, "y").replace(/([^s])s$/, "$1");

describe("Final hardening — cross-domain security", () => {
  const baseUrl = process.env.DATABASE_URL!;
  const url = new URL(baseUrl);
  const xdomainDb = `${url.pathname.slice(1).replace(/_test$/, "")}_xdomain_test`;
  const xdomainUrl = (() => {
    const u = new URL(baseUrl);
    u.pathname = `/${xdomainDb}`;
    return u.toString();
  })();
  let app: INestApplication;
  let db: PrismaService;
  let csrf = "";
  const cookies: Record<string, string> = {};
  let attackerId = "";
  let attackerHousehold = "";

  beforeAll(async () => {
    if (!url.pathname.endsWith("_test")) throw new Error("The cross-domain suite runs only next to a *_test database.");
    const admin = new PrismaClient({ datasources: { db: { url: baseUrl } } });
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${xdomainDb}" WITH (FORCE)`);
    await admin.$executeRawUnsafe(`CREATE DATABASE "${xdomainDb}"`);
    await admin.$disconnect();
    const apiRoot = path.resolve(__dirname, "..");
    const env = { ...process.env, DATABASE_URL: xdomainUrl, NODE_ENV: "test" };
    execFileSync("npx", ["prisma", "migrate", "deploy"], { cwd: apiRoot, env, stdio: "pipe" });
    for (const seed of SEEDS) execFileSync("npx", ["ts-node", "--transpile-only", `prisma/${seed}`], { cwd: apiRoot, env, stdio: "pipe" });

    process.env.DATABASE_URL = xdomainUrl;
    app = await createTestApp();
    db = app.get(PrismaService);
    csrf = extractCookie((await request(app.getHttpServer()).get("/health/live")).headers["set-cookie"], "petlife_csrf")!;
    const attacker = await db.user.create({ data: { email: `xdomain-${randomUUID()}@example.test`, displayName: "Unrelated account" } });
    attackerId = attacker.id;
    attackerHousehold = (await db.household.create({ data: { name: "Unrelated household" } })).id;
    await db.householdMember.create({ data: { householdId: attackerHousehold, userId: attackerId, role: "OWNER" } });
  }, 900_000);

  afterAll(async () => {
    await app?.close();
    process.env.DATABASE_URL = baseUrl;
  });

  const server = () => app.getHttpServer();
  async function cookieFor(userId: string): Promise<string> {
    if (!cookies[userId]) {
      const session = await db.session.create({ data: { userId, expiresAt: new Date(Date.now() + 3600e3) } });
      cookies[userId] = `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}`;
    }
    return cookies[userId]!;
  }
  function call(method: string, target: string, cookie?: string) {
    const r = (request(server()) as unknown as Record<string, (u: string) => request.Test>)[method.toLowerCase()]!(target);
    if (cookie) r.set("Cookie", cookie).set("x-csrf-token", csrf);
    return method === "GET" || method === "DELETE" ? r : r.send({});
  }

  function routes(): { method: string; path: string }[] {
    const stack = (app.getHttpAdapter().getInstance() as { _router: { stack: { route?: { path: string; methods: Record<string, boolean> } }[] } })._router.stack;
    return stack.filter((l) => l.route && l.route.path.includes(":")).flatMap((l) => Object.keys(l.route!.methods).map((m) => ({ method: m.toUpperCase(), path: l.route!.path })));
  }

  async function sweep(methods: string[]) {
    const q = <T>(sql: string) => db.$queryRawUnsafe<T[]>(sql);
    const tables = new Set((await q<{ t: string }>(`select table_name as t from information_schema.columns where table_schema='public' and column_name='id' and data_type='uuid'`)).map((r) => r.t));
    const memberCols = await q<{ t: string; c: string }>(`select c.table_name as t, c.column_name as c from information_schema.columns c where c.table_schema='public' and c.data_type='uuid' and c.column_name not in ('id','userId') and c.table_name in (select table_name from information_schema.columns where table_schema='public' and column_name='userId')`);
    const adminUser = (await q<{ u: string }>(`select "userId"::text as u from admin_users where status::text='ACTIVE' order by (role::text='SUPER_ADMIN') desc, (role::text='ADMIN') desc limit 1`))[0]?.u;
    const cache: Record<string, Row[]> = {};
    async function rowsOf(t: string): Promise<Row[]> {
      if (!cache[t]) {
        const hasCreated = (await q<{ n: number }>(`select count(*)::int as n from information_schema.columns where table_name='${t}' and column_name='createdAt'`))[0]!.n > 0;
        const rows = await q<{ j: string }>(`select row_to_json(x)::text as j from (select * from "${t}" ${hasCreated ? `order by "createdAt" desc` : ""} limit 6) x`);
        cache[t] = rows.map((r) => ({ ...JSON.parse(r.j), __t: t }) as Row).filter((r) => r.id !== attackerHousehold && r.householdId !== attackerHousehold && r.userId !== attackerId);
      }
      return cache[t]!;
    }
    async function relatedUsers(row: Row): Promise<string[]> {
      const out: string[] = [];
      for (const k of OWNER_KEYS) if (typeof row[k] === "string") out.push(row[k] as string);
      const petId = row.__t === "pets" ? row.id : (row.petId as string | undefined);
      if (petId) out.push(...(await q<{ u: string }>(`select "userId"::text as u from pet_access_grants where "petId"='${petId}'::uuid and "revokedAt" is null order by "canManageAccess" desc limit 2`)).map((r) => r.u));
      const hh = row.__t === "households" ? row.id : (row.householdId as string | undefined);
      if (hh) out.push(...(await q<{ u: string }>(`select "userId"::text as u from household_members where "householdId"='${hh}'::uuid limit 2`)).map((r) => r.u));
      const keys = [row.id, row.sellerOrganizationId, row.providerOrganizationId, row.organizationId, row.insuranceProviderId].filter((v): v is string => typeof v === "string");
      for (const { t, c } of memberCols) {
        if (out.length >= 4) break;
        const hit = await q<{ u: string }>(`select "userId"::text as u from "${t}" where "${c}" = any(array[${keys.map((k) => `'${k}'`).join(",")}]::uuid[]) and "userId" is not null limit 1`).catch(() => []);
        if (hit[0]) out.push(hit[0].u);
      }
      return [...new Set(out)].slice(0, 4);
    }
    function tablesForHint(hint: string): string[] {
      const stem = singular(snake(hint.replace(/Id$/, "")));
      if (!stem || stem === "id") return [];
      const direct = (HINT_TABLES[stem] ?? []).filter((t) => tables.has(t));
      return [...new Set([...direct, ...[...tables].filter((t) => t === `${stem}s` || t.endsWith(`_${stem}s`) || t === stem)])];
    }
    function fill(params: string[], last: string, row: Row): Record<string, string> | null {
      const values: Record<string, string> = {};
      for (const p of params) {
        if (p === last) values[p] = row.id;
        else {
          const k = [p, ...(PARAM_ALIASES[p] ?? [])].find((key) => typeof row[key] === "string");
          if (!k) return null;
          values[p] = row[k] as string;
        }
      }
      return values;
    }

    const attacker = await cookieFor(attackerId);
    const leaks: string[] = [];
    const serverErrors: string[] = [];
    let proven = 0, exercised = 0;
    for (const { method, path: route } of routes().filter((r) => methods.includes(r.method))) {
      const params = [...route.matchAll(/:(\w+)/g)].map((m) => m[1]!);
      const last = params[params.length - 1]!;
      const hint = last !== "id" ? last : route.split("/:id")[0]!.split("/").filter(Boolean).pop() ?? "";
      const candidates = last === "petId" ? ["pets"] : last === "householdId" ? ["households"] : tablesForHint(hint);
      let tried = false, ok = false;
      for (const t of candidates) {
        for (const row of await rowsOf(t)) {
          const values = fill(params, last, row);
          if (!values) continue;
          const target = route.replace(/:(\w+)/g, (_, p: string) => values[p]!);
          tried = true;
          if (method === "GET" && !ok) {
            for (const u of route.startsWith("/admin") ? [adminUser].filter((v): v is string => !!v) : await relatedUsers(row)) {
              if ((await call("GET", target, await cookieFor(u))).status < 300) {
                ok = true;
                break;
              }
            }
          }
          for (const who of method === "GET" ? ["anon", "attacker"] : ["attacker"]) {
            const res = await call(method, target, who === "attacker" ? attacker : undefined);
            if (res.status >= 500) serverErrors.push(`${who} ${method} ${target} → ${res.status}`);
            else if (res.status < 300 && !(method === "GET" ? PUBLIC_GET.has(route) : OWN_ACTION.has(`${method} ${route}`))) leaks.push(`${who} ${method} ${target} → ${res.status}`);
          }
        }
      }
      if (tried) exercised++;
      if (ok) proven++;
    }
    return { leaks, serverErrors, proven, exercised };
  }

  it("payment and financing reconciliation are the payer's only — anyone else gets the same 404 as a missing id", async () => {
    const intent = await db.paymentIntent.findFirstOrThrow({ include: { checkout: true } });
    const owner = await cookieFor(intent.checkout.userId);
    const stranger = await cookieFor(attackerId);
    const before = await db.reconciliationLog.count();

    await call("POST", `/payments/reconcile/${intent.id}`, owner).expect(201);
    const denied = await call("POST", `/payments/reconcile/${intent.id}`, stranger).expect(404);
    expect(denied.body.error.code).toBe("PAYMENT_INTENT_NOT_FOUND");
    await call("POST", `/payments/reconcile/${randomUUID()}`, stranger).expect(404);
    await call("POST", `/payments/reconcile/not-a-uuid`, stranger).expect(404);
    expect([401, 403]).toContain((await call("POST", `/payments/reconcile/${intent.id}`)).status);
    expect(await db.reconciliationLog.count()).toBe(before + 1);

    const financing = await db.financingIntent.create({ data: { checkoutId: intent.checkoutId, provider: "SNAPP_PAY", amount: intent.amount } });
    await call("POST", `/financing/reconcile/${financing.id}`, stranger).expect(404);
    await call("POST", `/financing/reconcile/${financing.id}`, owner).expect(201);
  });

  it("a client can't point content at a file it didn't upload for that item — private keys, other pets' keys, traversal", async () => {
    const grant = await db.petAccessGrant.findFirstOrThrow({ where: { canManageAccess: true, revokedAt: null, reason: null } });
    const other = await db.pet.findFirstOrThrow({ where: { id: { not: grant.petId } } });
    const owner = await cookieFor(grant.userId);
    const foreignDoc = `health-documents/${other.id}/${randomUUID()}.pdf`;

    // Public feed: one post referencing a private key used to 500 the feed for everyone.
    const post = await call("POST", "/community/posts", owner).send({ type: "GENERAL", body: "A walk in the park today", mediaObjectKeys: [foreignDoc] });
    expect(post.status).toBe(400);
    await call("POST", "/community/posts", owner).send({ type: "GENERAL", body: "A walk", mediaObjectKeys: [`community-media/../health-documents/${other.id}/${randomUUID()}.pdf`] }).expect(400);
    await request(server()).get("/community/posts").expect(200);

    // Private files: another pet's key can't be attached to your own pet and then downloaded.
    const doc = await call("POST", `/pets/${grant.petId}/health/documents`, owner).send({ key: foreignDoc, documentType: "OTHER", title: "x", mimeType: "application/pdf", fileSizeBytes: 12 });
    expect(doc.status).toBe(400);
    expect(doc.body.error.code).toBe("INVALID_UPLOAD_KEY");
    const upload = await call("POST", `/pets/${grant.petId}/health/documents/upload-url`, owner).send({ contentType: "application/pdf", fileSizeBytes: 12 });
    expect(upload.status).toBe(201);
    await call("POST", `/pets/${grant.petId}/health/documents`, owner).send({ key: upload.body.key, documentType: "OTHER", title: "Own file", mimeType: "application/pdf", fileSizeBytes: 12 }).expect(201);
    const memory = await call("POST", `/pets/${grant.petId}/memories`, owner).send({ type: "PHOTO", title: "Beach", occurredAt: new Date().toISOString(), mediaObjectKeys: [`pet-memories-private/${other.id}/${randomUUID()}.jpg`] });
    expect(memory.status).toBe(400);
  });

  it("an upload can't be larger than the size declared for it, and a bad body is a 4xx, not a 500", async () => {
    const user = await cookieFor((await db.petAccessGrant.findFirstOrThrow({ where: { canManageAccess: true, revokedAt: null } })).userId);
    const target = await call("POST", "/community/posts/upload-url", user).send({ contentType: "image/jpeg", fileSizeBytes: 1000 }).expect(201);
    const token = String(target.body.uploadUrl).split("/uploads/")[1]!;
    const put = (bytes: number) => request(server()).put(`/uploads/${token}`).set("Cookie", user).set("x-csrf-token", csrf).set("Content-Type", "image/jpeg").send(Buffer.alloc(bytes));
    const tooBig = await put(64 * 1024);
    expect(tooBig.status).toBe(413);
    expect(tooBig.body.error.code).toBe("PAYLOAD_TOO_LARGE");
    await put(1000).expect(200);

    const malformed = await request(server()).post("/community/posts").set("Cookie", user).set("x-csrf-token", csrf).set("Content-Type", "application/json").send("{not json");
    expect(malformed.status).toBe(400);
  });

  it("no parametrised GET reveals anything private to an anonymous visitor or an unrelated account, and none crashes", async () => {
    const result = await sweep(["GET"]);
    expect(result.serverErrors).toEqual([]);
    expect(result.leaks).toEqual([]);
    // Coverage guard: on the QA seeds ~145 routes are proven readable by their real owner.
    expect(result.proven).toBeGreaterThanOrEqual(130);
  }, 900_000);

  it("no mutation succeeds on someone else's object, and none crashes", async () => {
    const result = await sweep(["POST", "PATCH", "PUT", "DELETE"]);
    expect(result.serverErrors).toEqual([]);
    expect(result.leaks).toEqual([]);
    expect(result.exercised).toBeGreaterThanOrEqual(200);
  }, 900_000);
});
