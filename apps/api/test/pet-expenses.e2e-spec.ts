import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { createTestApp, extractCookie } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { signSessionCookie } from "../src/common/session/session-cookie.util";

describe("Pet expense tracker", () => {
  let app: INestApplication;
  let db: PrismaService;
  let petId: string;
  let otherPetId: string;
  let householdId: string;
  let bookingId: string;
  let orderId: string;
  const actors: Record<string, { id: string; cookie: string; csrf: string }> = {};
  const year = new Date().getUTCFullYear();
  const day = (m: number, d: number) => `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const range = `from=${day(1, 1)}&to=${day(12, 31)}`;

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
    for (const name of ["OWNER", "MEMBER", "VET_TEMPORARY", "OTHER_HOUSEHOLD", "REVOKED"]) {
      const user = await db.user.create({ data: { displayName: name, email: `expenses-${randomUUID()}@example.com` } });
      const session = await db.session.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 86_400_000) } });
      const res = await request(app.getHttpServer()).get("/health/live");
      const csrf = extractCookie(res.headers["set-cookie"], "petlife_csrf")!;
      actors[name] = { id: user.id, csrf, cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}` };
    }
    const household = await db.household.create({
      data: { name: "خانواده هزینه", members: { create: [{ userId: actors.OWNER!.id, role: "OWNER" }, { userId: actors.MEMBER!.id, role: "FAMILY" }] } },
    });
    householdId = household.id;
    const other = await db.household.create({ data: { name: "خانواده دیگر", members: { create: { userId: actors.OTHER_HOUSEHOLD!.id, role: "OWNER" } } } });
    petId = (await db.pet.create({ data: { householdId, name: "کوکی", species: "DOG" } })).id;
    otherPetId = (await db.pet.create({ data: { householdId: other.id, name: "میلو", species: "CAT" } })).id;

    await db.petAccessGrant.create({ data: { petId, userId: actors.OWNER!.id, canEditIdentity: true, canManageAccess: true } });
    await db.petAccessGrant.create({ data: { petId, userId: actors.MEMBER!.id } });
    // A vet with an active temporary health grant: may see the pet, never the household's spending.
    await db.petAccessGrant.create({ data: { petId, userId: actors.VET_TEMPORARY!.id, canViewHealth: true, source: "TEMPORARY", expiresAt: new Date(Date.now() + 86_400_000) } });
    // Shared into another household's view of this pet — still not a member of this household.
    await db.petAccessGrant.create({ data: { petId, userId: actors.OTHER_HOUSEHOLD!.id, source: "MANUAL" } });
    await db.petAccessGrant.create({ data: { petId: otherPetId, userId: actors.OTHER_HOUSEHOLD!.id, canEditIdentity: true } });
    await db.petAccessGrant.create({ data: { petId, userId: actors.REVOKED!.id, revokedAt: new Date() } });

    // A completed vet booking (700k − 100k discount) and a cancelled one that must not count.
    const org = await db.providerOrganization.create({ data: { name: `Expense clinic ${randomUUID().slice(0, 6)}`, type: "VET_CLINIC", verificationStatus: "VERIFIED" } });
    const loc = await db.providerLocation.create({ data: { providerOrganizationId: org.id, addressLine: "x", city: "Tehran", countryCode: "IR", timezone: "UTC" } });
    const svc = await db.providerService.create({ data: { providerOrganizationId: org.id, locationId: loc.id, name: "ویزیت عمومی", type: "GENERAL_VET_VISIT", category: "VET", locationMode: "AT_PROVIDER", durationMinutes: 30 } });
    const base = { householdId, petId, userId: actors.OWNER!.id, providerOrganizationId: org.id, providerLocationId: loc.id, providerServiceId: svc.id, category: "VET" as const, locationMode: "AT_PROVIDER" as const, timezone: "UTC", currency: "IRR" };
    const start = new Date(`${day(3, 10)}T09:00:00.000Z`);
    bookingId = (await db.booking.create({ data: { ...base, startAt: start, endAt: new Date(start.getTime() + 1_800_000), bookingStatus: "COMPLETED", priceAmount: 700_000, discountAmount: 100_000 } })).id;
    await db.booking.create({ data: { ...base, startAt: new Date(start.getTime() + 86_400_000), endAt: new Date(start.getTime() + 88_200_000), bookingStatus: "CANCELLED_BY_USER", priceAmount: 999_000 } });

    // A shop order with one line for this pet and one for nobody.
    const seller = await db.sellerOrganization.create({ data: { name: `Expense shop ${randomUUID().slice(0, 6)}`, verificationStatus: "VERIFIED", status: "ACTIVE", countryCode: "IR" } });
    const cat = await db.productCategory.create({ data: { name: "غذا", slug: `food-${randomUUID()}` } });
    const product = await db.product.create({ data: { categoryId: cat.id, title: "غذای خشک سگ", slug: `dry-food-${randomUUID()}` } });
    const variant = await db.productVariant.create({ data: { productId: product.id, sku: `SKU-${randomUUID()}` } });
    const offer = await db.sellerOffer.create({ data: { sellerOrganizationId: seller.id, productVariantId: variant.id, priceAmount: 450_000, currency: "IRR" } });
    const order = await db.order.create({ data: { userId: actors.OWNER!.id, householdId, sellerOrganizationId: seller.id, status: "FULFILLED", subtotalAmount: 1_100_000, deliveryAmount: 0, discountAmount: 0, totalAmount: 1_100_000, currency: "IRR", shippingAddressSnapshot: {}, createdAt: new Date(`${day(4, 2)}T10:00:00.000Z`) } });
    orderId = order.id;
    const line = { orderId: order.id, productId: product.id, productVariantId: variant.id, sellerOfferId: offer.id, productTitleSnapshot: "غذای خشک سگ", skuSnapshot: "SKU", unitPrice: 450_000, compatibilitySnapshot: {} };
    await db.orderItem.create({ data: { ...line, quantity: 2, totalPrice: 900_000, targetPetId: petId } });
    await db.orderItem.create({ data: { ...line, quantity: 1, totalPrice: 200_000 } });
  });

  afterAll(async () => {
    await app?.close();
  });

  const get = (actor: string, url: string) => request(app.getHttpServer()).get(url).set("Cookie", actors[actor]!.cookie);
  const send = (method: "post" | "patch" | "delete", actor: string, url: string) =>
    request(app.getHttpServer())[method](url).set("Cookie", actors[actor]!.cookie).set("x-csrf-token", actors[actor]!.csrf);

  it("lets household members read spending and keeps vets, other households, revoked and anonymous out", async () => {
    await get("OWNER", `/pets/${petId}/expenses?${range}`).expect(200);
    await get("MEMBER", `/pets/${petId}/expenses?${range}`).expect(200);
    for (const actor of ["VET_TEMPORARY", "OTHER_HOUSEHOLD", "REVOKED"]) await get(actor, `/pets/${petId}/expenses?${range}`).expect(403);
    await request(app.getHttpServer()).get(`/pets/${petId}/expenses?${range}`).expect(401);
    await get("OWNER", `/pets/${otherPetId}/expenses?${range}`).expect(403);
    await send("post", "VET_TEMPORARY", `/pets/${petId}/expenses`).send({ category: "VET", amountIrr: 10_000, spentOn: day(5, 1) }).expect(403);
  });

  it("derives committed bookings and pet-targeted shop lines without copying them", async () => {
    const res = await get("OWNER", `/pets/${petId}/expenses?${range}`).expect(200);
    const booking = res.body.entries.find((e: { source: string }) => e.source === "BOOKING");
    expect(booking).toMatchObject({ id: `booking:${bookingId}`, category: "VET", amountIrr: 600_000, spentOn: day(3, 10), label: "ویزیت عمومی", sourceRecordId: bookingId });
    const shop = res.body.entries.filter((e: { source: string }) => e.source === "SHOP");
    expect(shop).toHaveLength(1);
    expect(shop[0]).toMatchObject({ category: "SUPPLIES", amountIrr: 900_000, spentOn: day(4, 2), sourceRecordId: orderId });
    expect(res.body.totalIrr).toBe(1_500_000);
    expect(await db.petExpense.count({ where: { petId } })).toBe(0);
  });

  it("records, edits and deletes a manual expense, with totals by category and source", async () => {
    const created = await send("post", "MEMBER", `/pets/${petId}/expenses`).send({ category: "FOOD", amountIrr: 2_500_000, spentOn: day(6, 15), note: "  کیسه ۱۵ کیلویی  " }).expect(201);
    expect(created.body).toMatchObject({ source: "MANUAL", category: "FOOD", amountIrr: 2_500_000, spentOn: day(6, 15), note: "کیسه ۱۵ کیلویی" });
    const row = await db.petExpense.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(row).toMatchObject({ householdId, createdByUserId: actors.MEMBER!.id });

    const edited = await send("patch", "OWNER", `/pets/${petId}/expenses/${created.body.id}`).send({ amountIrr: 3_000_000, note: "" }).expect(200);
    expect(edited.body).toMatchObject({ amountIrr: 3_000_000, note: null, category: "FOOD" });

    const res = await get("OWNER", `/pets/${petId}/expenses?${range}`).expect(200);
    expect(res.body.totalIrr).toBe(4_500_000);
    expect(res.body.byCategory[0]).toEqual({ category: "FOOD", amountIrr: 3_000_000 });
    expect(res.body.bySource).toEqual(expect.arrayContaining([{ source: "MANUAL", amountIrr: 3_000_000 }, { source: "BOOKING", amountIrr: 600_000 }, { source: "SHOP", amountIrr: 900_000 }]));
    expect(res.body.entries.map((e: { spentOn: string }) => e.spentOn)).toEqual([...res.body.entries.map((e: { spentOn: string }) => e.spentOn)].sort().reverse());

    await send("delete", "OWNER", `/pets/${petId}/expenses/${created.body.id}`).expect(200);
    expect(await db.petExpense.count({ where: { id: created.body.id } })).toBe(0);
  });

  it("treats another pet's expense id, derived ids and garbage ids as not found", async () => {
    const foreign = await db.petExpense.create({ data: { petId: otherPetId, householdId: (await db.pet.findUniqueOrThrow({ where: { id: otherPetId } })).householdId, createdByUserId: actors.OTHER_HOUSEHOLD!.id, category: "VET", amountIrr: 50_000, spentOn: new Date(`${day(2, 2)}T00:00:00.000Z`) } });
    await send("patch", "OWNER", `/pets/${petId}/expenses/${foreign.id}`).send({ amountIrr: 1 }).expect(404);
    await send("delete", "OWNER", `/pets/${petId}/expenses/${foreign.id}`).expect(404);
    await send("delete", "OWNER", `/pets/${petId}/expenses/booking:${bookingId}`).expect(404);
    await send("delete", "OWNER", `/pets/${petId}/expenses/not-a-uuid`).expect(404);
    expect((await db.petExpense.findUniqueOrThrow({ where: { id: foreign.id } })).amountIrr).toBe(50_000);
  });

  it("filters by date range and rejects invalid amounts, categories, dates and ranges", async () => {
    const march = await get("OWNER", `/pets/${petId}/expenses?from=${day(3, 1)}&to=${day(3, 31)}`).expect(200);
    expect(march.body.entries.map((e: { source: string }) => e.source)).toEqual(["BOOKING"]);
    const url = `/pets/${petId}/expenses`;
    await send("post", "OWNER", url).send({ category: "FOOD", amountIrr: 0, spentOn: day(1, 1) }).expect(400);
    await send("post", "OWNER", url).send({ category: "FOOD", amountIrr: 1.5, spentOn: day(1, 1) }).expect(400);
    await send("post", "OWNER", url).send({ category: "FOOD", amountIrr: 3_000_000_000, spentOn: day(1, 1) }).expect(400);
    await send("post", "OWNER", url).send({ category: "TOYS", amountIrr: 1000, spentOn: day(1, 1) }).expect(400);
    await send("post", "OWNER", url).send({ category: "FOOD", amountIrr: 1000, spentOn: `${year}-02-31` }).expect(400);
    await get("OWNER", `${url}?from=${day(5, 1)}&to=${day(4, 1)}`).expect(400);
    await get("OWNER", `${url}?from=${year - 2}-01-01&to=${day(12, 31)}`).expect(400);
  });
});
