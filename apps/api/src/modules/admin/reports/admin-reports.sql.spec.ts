import { PrismaClient } from "@prisma/client";
import { AdminReportsService } from "./admin-reports.service";
import { AdminUsersService } from "../users/admin-users.service";
import type { ResolvedAdminContext } from "../auth/admin-context.types";

/**
 * SQL smoke test for the raw report and directory queries. They are hand-written PostgreSQL, so a column or
 * cast typo only shows up against a real schema: point ERP_SQL_DATABASE_URL at a fully migrated, disposable
 * database to run it (it writes a few users and sessions). Skipped otherwise.
 */
const url = process.env.ERP_SQL_DATABASE_URL;
const maybe = url ? describe : describe.skip;

maybe("ERP report SQL against a migrated database", () => {
  // Jest still runs a skipped describe's body to collect tests, so nothing may touch the database out here.
  let prisma: PrismaClient;
  let reports: AdminReportsService;
  let users: AdminUsersService;
  const admin = { adminUserId: "a", userId: "u", displayName: "x", role: "SUPER_ADMIN", status: "ACTIVE", serviceScopes: [] } as unknown as ResolvedAdminContext;
  const now = new Date();
  const tag = `erp-sql-${Date.now()}`;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url } } });
    reports = new AdminReportsService(prisma as never);
    users = new AdminUsersService(prisma as never, {} as never, {} as never, {} as never);
    const day = 86_400_000;
    await prisma.user.createMany({
      data: [
        { displayName: `${tag}-new`, email: `${tag}-new@example.test`, createdAt: new Date(now.getTime() - 3 * day), lastActiveAt: now },
        { displayName: `${tag}-old`, email: `${tag}-old@example.test`, createdAt: new Date(now.getTime() - 200 * day), lastActiveAt: new Date(now.getTime() - 120 * day) },
        { displayName: `${tag}-risk`, email: `${tag}-risk@example.test`, createdAt: new Date(now.getTime() - 200 * day), lastActiveAt: new Date(now.getTime() - 45 * day) },
      ],
    });
    const created = await prisma.user.findMany({ where: { displayName: { startsWith: tag } } });
    await prisma.session.createMany({ data: created.map((u) => ({ userId: u.id, expiresAt: new Date(now.getTime() + day), lastSeenAt: u.lastActiveAt ?? now })) });
  });

  afterAll(async () => {
    const created = await prisma.user.findMany({ where: { displayName: { startsWith: tag } }, select: { id: true } });
    await prisma.session.deleteMany({ where: { userId: { in: created.map((u) => u.id) } } });
    await prisma.user.deleteMany({ where: { id: { in: created.map((u) => u.id) } } });
    await prisma.$disconnect();
  });

  it.each(["day", "week", "month"] as const)("builds the overview by %s", async (granularity) => {
    const range = reports.resolveRange({ granularity, from: undefined, to: undefined });
    const overview = await reports.overview(admin, range, now);
    expect(overview.series.length).toBeGreaterThan(0);
    expect(overview.kpis.newUsers.value).toBeGreaterThanOrEqual(1);
    expect(overview.breakdowns.customerSegments.map((s) => s.key)).toEqual(["NEW", "VIP", "ACTIVE", "AT_RISK", "DORMANT", "NEVER_PURCHASED"]);
    expect(overview.cohorts.length).toBe(6);
    expect(overview.top.customers).not.toBeNull();
  });

  it("filters, sorts and segments the users directory in SQL", async () => {
    const all = await users.list({ q: tag, pageSize: 50 }, now);
    expect(all.total).toBe(3);
    const segments = Object.fromEntries(all.items.map((u) => [u.displayName.replace(`${tag}-`, ""), u.behavior?.segment]));
    // No purchases yet: everyone past their first 30 days is NEVER_PURCHASED, whatever their activity.
    expect(segments).toEqual({ new: "NEW", old: "NEVER_PURCHASED", risk: "NEVER_PURCHASED" });
    expect((await users.list({ q: tag, segment: "NEVER_PURCHASED" }, now)).total).toBe(2);
    expect((await users.list({ q: tag, inactiveForDays: 90 }, now)).total).toBe(1);
    expect((await users.list({ q: tag, activeWithinDays: 7 }, now)).total).toBe(1);
    expect((await users.list({ q: tag, minOrders: 1 }, now)).total).toBe(0);
    expect((await users.list({ q: tag, hasServiceBooking: false, hasCancellations: false, sort: "lastActive" }, now)).items[0]?.displayName).toBe(`${tag}-new`);
    expect((await users.list({ q: tag, kind: "CUSTOMER", status: "ACTIVE", joinedFrom: "2000-01-01", joinedTo: "2999-12-31", sort: "spend" }, now)).total).toBe(0);
  });

  it("builds one user's behaviour timeline", async () => {
    const [user] = await prisma.user.findMany({ where: { displayName: `${tag}-new` } });
    const behavior = await users.getBehavior(user!.id, now);
    expect(behavior.summary.segment).toBe("NEW");
    expect(behavior.monthlyActivity).toHaveLength(12);
    expect(behavior.timeline.map((e) => e.kind)).toEqual(expect.arrayContaining(["SIGN_UP", "SIGN_IN"]));
  });
});
