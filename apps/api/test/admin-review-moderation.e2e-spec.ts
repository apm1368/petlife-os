import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AdminMembershipStatus, AdminRole, AdminVertical, ProviderType } from "@prisma/client";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { createTestApp, extractCookie } from "./test-app";

type Actor = { adminUserId: string; cookie: string; csrf: string };

describe("Admin review moderation (W2-9)", () => {
  let app: INestApplication;
  let db: PrismaService;
  const server = () => app.getHttpServer();
  const get = (actor: Actor, url: string) => request(server()).get(url).set("Cookie", actor.cookie);
  const post = (actor: Actor, url: string) =>
    request(server()).post(url).set("Cookie", actor.cookie).set("x-csrf-token", actor.csrf);

  async function actor(role: AdminRole, serviceScopes: AdminVertical[] = []): Promise<Actor> {
    const user = await db.user.create({
      data: { displayName: `review ${role}`, email: `review-${randomUUID()}@example.com` },
    });
    const admin = await db.adminUser.create({
      data: { userId: user.id, role, status: AdminMembershipStatus.ACTIVE, serviceScopes },
    });
    const session = await db.session.create({
      data: { userId: user.id, expiresAt: new Date(Date.now() + 86_400_000) },
    });
    const csrf = extractCookie(
      (await request(server()).get("/health/live")).headers["set-cookie"],
      "petlife_csrf",
    )!;
    return {
      adminUserId: admin.id,
      csrf,
      cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}`,
    };
  }

  async function customer() {
    const user = await db.user.create({
      data: { displayName: "Review Customer", email: `customer-${randomUUID()}@example.com` },
    });
    const household = await db.household.create({
      data: { name: "Review household", members: { create: { userId: user.id, role: "OWNER" } } },
    });
    const pet = await db.pet.create({ data: { householdId: household.id, name: "Rex", species: "DOG" } });
    return { user, household, pet };
  }

  async function serviceReview(type: ProviderType = ProviderType.VET_CLINIC) {
    const c = await customer();
    const org = await db.providerOrganization.create({
      data: { name: `Review ${type} ${randomUUID().slice(0, 5)}`, type, verificationStatus: "VERIFIED" },
    });
    const location = await db.providerLocation.create({
      data: {
        providerOrganizationId: org.id,
        addressLine: "Review street",
        city: "Tehran",
        countryCode: "IR",
        timezone: "UTC",
      },
    });
    const grooming = type === ProviderType.GROOMER;
    const service = await db.providerService.create({
      data: {
        providerOrganizationId: org.id,
        locationId: location.id,
        name: "Review service",
        type: grooming ? "CONSULTATION" : "GENERAL_VET_VISIT",
        category: grooming ? "GROOMING" : "VET",
        locationMode: "AT_PROVIDER",
        durationMinutes: 30,
      },
    });
    const booking = await db.booking.create({
      data: {
        householdId: c.household.id,
        petId: c.pet.id,
        userId: c.user.id,
        providerOrganizationId: org.id,
        providerLocationId: location.id,
        providerServiceId: service.id,
        category: grooming ? "GROOMING" : "VET",
        locationMode: "AT_PROVIDER",
        startAt: new Date(Date.now() - 7_200_000),
        endAt: new Date(Date.now() - 5_400_000),
        timezone: "UTC",
        bookingStatus: "COMPLETED",
      },
    });
    const review = await db.providerReview.create({
      data: {
        bookingId: booking.id,
        providerOrganizationId: org.id,
        userId: c.user.id,
        rating: 5,
        body: "Helpful team",
      },
    });
    return { review, org };
  }

  async function productReview() {
    const c = await customer();
    const category = await db.productCategory.create({
      data: { name: "Review category", slug: `review-${randomUUID()}` },
    });
    const product = await db.product.create({
      data: {
        categoryId: category.id,
        title: "Review food",
        slug: `review-food-${randomUUID()}`,
        allergenTags: [],
      },
    });
    const variant = await db.productVariant.create({
      data: { productId: product.id, sku: `review-${randomUUID()}`, title: "1 kg" },
    });
    const seller = await db.sellerOrganization.create({
      data: { name: "Review seller", countryCode: "IR", verificationStatus: "VERIFIED" },
    });
    const offer = await db.sellerOffer.create({
      data: { sellerOrganizationId: seller.id, productVariantId: variant.id, priceAmount: 100_000 },
    });
    const order = await db.order.create({
      data: {
        sellerOrganizationId: seller.id,
        userId: c.user.id,
        householdId: c.household.id,
        status: "CONFIRMED",
        subtotalAmount: 100_000,
        deliveryAmount: 0,
        discountAmount: 0,
        totalAmount: 100_000,
        currency: "IRR",
        shippingAddressSnapshot: {},
      },
    });
    const item = await db.orderItem.create({
      data: {
        orderId: order.id,
        productId: product.id,
        productVariantId: variant.id,
        sellerOfferId: offer.id,
        productTitleSnapshot: product.title,
        variantTitleSnapshot: variant.title,
        skuSnapshot: variant.sku,
        quantity: 1,
        unitPrice: 100_000,
        totalPrice: 100_000,
        compatibilitySnapshot: {},
      },
    });
    const review = await db.productReview.create({
      data: {
        orderItemId: item.id,
        productId: product.id,
        productVariantId: variant.id,
        userId: c.user.id,
        rating: 4,
        body: "My dog liked it",
      },
    });
    return { review, product };
  }

  async function travelReview() {
    const c = await customer();
    const org = await db.providerOrganization.create({
      data: { name: "Review stay", type: "TRAVEL_ACCOMMODATION", verificationStatus: "VERIFIED" },
    });
    const listing = await db.travelListing.create({
      data: {
        organizationId: org.id,
        type: "HOTEL",
        title: "Pet hotel",
        description: "A calm stay",
        country: "IR",
        city: "Tehran",
        status: "PUBLISHED",
        isPubliclyListed: true,
      },
    });
    const unit = await db.travelInventoryUnit.create({
      data: { listingId: listing.id, name: "Room", basePriceIrr: 500_000 },
    });
    const checkIn = new Date(Date.now() - 3 * 86_400_000);
    const booking = await db.travelBooking.create({
      data: {
        listingId: listing.id,
        unitId: unit.id,
        reference: `REV-${randomUUID()}`,
        householdId: c.household.id,
        bookedByUserId: c.user.id,
        status: "COMPLETED",
        checkIn,
        checkOut: new Date(checkIn.getTime() + 86_400_000),
        nights: 1,
        baseAmountIrr: 500_000,
        totalAmountIrr: 500_000,
      },
    });
    const review = await db.travelReview.create({
      data: {
        bookingId: booking.id,
        listingId: listing.id,
        userId: c.user.id,
        overall: 3,
        petFriendliness: 4,
        body: "Clean room",
      },
    });
    return { review, listing };
  }

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    db = app.get(PrismaService);
  });
  afterAll(async () => app.close());

  it("keeps all new reviews pending and out of public lists until approval", async () => {
    const admin = await actor(AdminRole.SUPER_ADMIN);
    const service = await serviceReview();
    const product = await productReview();
    const travel = await travelReview();
    expect([service.review.status, product.review.status, travel.review.status]).toEqual([
      "PENDING",
      "PENDING",
      "PENDING",
    ]);

    expect(
      (await request(server()).get(`/providers/${service.org.id}/reviews`).expect(200)).body.summary.count,
    ).toBe(0);
    expect(
      (await request(server()).get(`/shop/products/${product.product.id}/reviews`).expect(200)).body.total,
    ).toBe(0);
    expect(
      (await request(server()).get(`/travel/listings/${travel.listing.id}/reviews`).expect(200)).body.total,
    ).toBe(0);
    const travelByAuthor = await get(
      admin,
      "/admin/review-moderation?vertical=TRAVEL&q=Review%20Customer",
    ).expect(200);
    expect(travelByAuthor.body.items.map((row: { id: string }) => row.id)).toContain(travel.review.id);

    for (const [vertical, id] of [
      ["SERVICE", service.review.id],
      ["PRODUCT", product.review.id],
      ["TRAVEL", travel.review.id],
    ] as const) {
      const queue = await get(admin, `/admin/review-moderation?vertical=${vertical}`).expect(200);
      expect(queue.body.items.map((row: { id: string }) => row.id)).toContain(id);
      const approved = await post(admin, `/admin/review-moderation/${vertical}/${id}/approve`)
        .send({ labels: ["verified", "quality"] })
        .expect(201);
      expect(approved.body).toMatchObject({ id, status: "APPROVED", labels: ["verified", "quality"] });
    }

    expect(
      (await request(server()).get(`/providers/${service.org.id}/reviews`).expect(200)).body.summary.count,
    ).toBe(1);
    expect(
      (await request(server()).get(`/shop/products/${product.product.id}/reviews`).expect(200)).body.total,
    ).toBe(1);
    expect(
      (await request(server()).get(`/travel/listings/${travel.listing.id}/reviews`).expect(200)).body.total,
    ).toBe(1);
    expect(
      await db.adminAuditLog.count({ where: { adminUserId: admin.adminUserId, action: "review.approved" } }),
    ).toBe(3);
  });

  it("requires a rejection reason, records it and supports reconsideration", async () => {
    const admin = await actor(AdminRole.SUPER_ADMIN);
    const { review } = await productReview();
    await post(admin, `/admin/review-moderation/PRODUCT/${review.id}/reject`)
      .send({ labels: ["spam"] })
      .expect(400);
    const rejected = await post(admin, `/admin/review-moderation/PRODUCT/${review.id}/reject`)
      .send({ reason: "Contains promotional spam", labels: ["spam"] })
      .expect(201);
    expect(rejected.body).toMatchObject({
      status: "REJECTED",
      moderationReason: "Contains promotional spam",
      labels: ["spam"],
    });
    await post(admin, `/admin/review-moderation/PRODUCT/${review.id}/approve`)
      .send({ reason: "Reviewed after appeal" })
      .expect(201);
    expect((await db.productReview.findUniqueOrThrow({ where: { id: review.id } })).status).toBe("APPROVED");
    await post(admin, `/admin/review-moderation/PRODUCT/${review.id}/approve`).send({}).expect(400);
  });

  it("enforces both role permission and service row scope", async () => {
    const clinic = await serviceReview(ProviderType.VET_CLINIC);
    const groomer = await serviceReview(ProviderType.GROOMER);
    const clinicAdmin = await actor(AdminRole.SERVICE_ADMIN, [AdminVertical.CLINIC]);
    const queue = await get(clinicAdmin, "/admin/review-moderation?vertical=SERVICE").expect(200);
    expect(queue.body.items.map((row: { id: string }) => row.id)).toContain(clinic.review.id);
    expect(queue.body.items.map((row: { id: string }) => row.id)).not.toContain(groomer.review.id);
    await post(clinicAdmin, `/admin/review-moderation/SERVICE/${groomer.review.id}/approve`)
      .send({})
      .expect(403);

    const shopAdmin = await actor(AdminRole.SHOP_ADMIN);
    const product = await productReview();
    await post(shopAdmin, `/admin/review-moderation/PRODUCT/${product.review.id}/approve`)
      .send({})
      .expect(201);
    await get(shopAdmin, "/admin/review-moderation?vertical=SERVICE").expect(403);

    const stayAdmin = await actor(AdminRole.SERVICE_ADMIN, [AdminVertical.ACCOMMODATION]);
    const travel = await travelReview();
    await post(stayAdmin, `/admin/review-moderation/TRAVEL/${travel.review.id}/approve`).send({}).expect(201);
  });
});
