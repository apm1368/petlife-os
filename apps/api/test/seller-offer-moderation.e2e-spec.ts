import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import {
  AdminMembershipStatus,
  AdminRole,
  SellerMembershipRole,
  SellerMembershipStatus,
  SellerStatus,
  SellerVerificationStatus,
} from "@prisma/client";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { signSessionCookie } from "../src/common/session/session-cookie.util";
import { createTestApp, extractCookie } from "./test-app";

type Actor = { cookie: string; csrf: string; userId: string };

describe("Seller offer moderation (W2-10)", () => {
  let app: INestApplication;
  let db: PrismaService;
  const server = () => app.getHttpServer();

  async function actor(): Promise<Actor> {
    const user = await db.user.create({
      data: { displayName: "Moderation actor", email: `moderation-${randomUUID()}@example.com` },
    });
    const session = await db.session.create({
      data: { userId: user.id, expiresAt: new Date(Date.now() + 86_400_000) },
    });
    const csrf = extractCookie(
      (await request(server()).get("/health/live")).headers["set-cookie"],
      "petlife_csrf",
    )!;
    return {
      userId: user.id,
      csrf,
      cookie: `petlife_session=${signSessionCookie(session.id, process.env.SESSION_SECRET!)}; petlife_csrf=${csrf}`,
    };
  }

  const get = (who: Actor, url: string) => request(server()).get(url).set("Cookie", who.cookie);
  const post = (who: Actor, url: string) =>
    request(server()).post(url).set("Cookie", who.cookie).set("x-csrf-token", who.csrf);
  const patch = (who: Actor, url: string) =>
    request(server()).patch(url).set("Cookie", who.cookie).set("x-csrf-token", who.csrf);

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    db = app.get(PrismaService);
  });

  afterAll(async () => app.close());

  it("keeps new and edited offers private until an audited admin decision", async () => {
    const sellerActor = await actor();
    const customer = await actor();
    const superAdmin = await actor();
    const readOnlyAdmin = await actor();
    await db.adminUser.create({
      data: { userId: superAdmin.userId, role: AdminRole.SUPER_ADMIN, status: AdminMembershipStatus.ACTIVE },
    });
    await db.adminUser.create({
      data: { userId: readOnlyAdmin.userId, role: AdminRole.SUPPORT, status: AdminMembershipStatus.ACTIVE },
    });

    const seller = await db.sellerOrganization.create({
      data: {
        name: `Moderated seller ${randomUUID()}`,
        countryCode: "IR",
        status: SellerStatus.ACTIVE,
        verificationStatus: SellerVerificationStatus.VERIFIED,
      },
    });
    await db.sellerMembership.create({
      data: {
        sellerOrganizationId: seller.id,
        userId: sellerActor.userId,
        role: SellerMembershipRole.OWNER,
        status: SellerMembershipStatus.ACTIVE,
        acceptedAt: new Date(),
      },
    });
    const category = await db.productCategory.create({
      data: { name: `Moderated category ${randomUUID()}`, slug: `moderated-${randomUUID()}` },
    });
    const product = await db.product.create({
      data: {
        categoryId: category.id,
        title: "Moderated food",
        slug: `moderated-food-${randomUUID()}`,
        allergenTags: [],
      },
    });
    const variant = await db.productVariant.create({
      data: { productId: product.id, sku: `MOD-${randomUUID()}`, title: "1 kg" },
    });

    const created = await post(sellerActor, `/seller-organizations/${seller.id}/offers`)
      .send({
        productVariantId: variant.id,
        priceAmount: 350_000,
        sellerSku: `SELLER-${randomUUID()}`,
        initialOnHand: 10,
      })
      .expect(201);
    expect(created.body.moderationStatus).toBe("PENDING_REVIEW");
    expect(created.body.moderationReason).toBeNull();

    const hiddenBeforeApproval = await request(server()).get(`/shop/products/${product.id}`).expect(200);
    expect(hiddenBeforeApproval.body.offers).toHaveLength(0);
    await post(customer, "/cart/items").send({ offerId: created.body.id, quantity: 1 }).expect(400);

    const queue = await get(superAdmin, "/admin/commerce/offers/moderation?status=PENDING_REVIEW").expect(
      200,
    );
    expect(queue.body.items.map((row: { id: string }) => row.id)).toContain(created.body.id);
    await post(readOnlyAdmin, `/admin/commerce/offers/moderation/${created.body.id}/decision`)
      .send({ decision: "APPROVED", reason: "Looks correct", expectedUpdatedAt: created.body.updatedAt })
      .expect(403);

    const approved = await post(superAdmin, `/admin/commerce/offers/moderation/${created.body.id}/decision`)
      .send({
        decision: "APPROVED",
        reason: "Price and terms verified",
        expectedUpdatedAt: created.body.updatedAt,
      })
      .expect(201);
    expect(approved.body.moderationStatus).toBe("APPROVED");
    await request(server()).get(`/shop/products/${product.id}`).expect(200);
    await post(customer, "/cart/items").send({ offerId: created.body.id, quantity: 1 }).expect(201);

    const edited = await patch(sellerActor, `/seller-organizations/${seller.id}/offers/${created.body.id}`)
      .send({ priceAmount: 375_000 })
      .expect(200);
    expect(edited.body.moderationStatus).toBe("PENDING_REVIEW");
    const hiddenAfterEdit = await request(server()).get(`/shop/products/${product.id}`).expect(200);
    expect(hiddenAfterEdit.body.offers).toHaveLength(0);
    await post(customer, "/checkout").send({}).expect(400);

    await post(superAdmin, `/admin/commerce/offers/moderation/${created.body.id}/decision`)
      .send({ decision: "REJECTED", reason: "Stale decision", expectedUpdatedAt: approved.body.updatedAt })
      .expect(409);
    const rejected = await post(superAdmin, `/admin/commerce/offers/moderation/${created.body.id}/decision`)
      .send({
        decision: "REJECTED",
        reason: "Price evidence is incomplete",
        expectedUpdatedAt: edited.body.updatedAt,
      })
      .expect(201);
    expect(rejected.body.moderationStatus).toBe("REJECTED");

    const sellerView = await get(
      sellerActor,
      `/seller-organizations/${seller.id}/offers/${created.body.id}`,
    ).expect(200);
    expect(sellerView.body).toMatchObject({
      moderationStatus: "REJECTED",
      moderationReason: "Price evidence is incomplete",
    });
    expect(
      await db.adminAuditLog.count({ where: { entityType: "SELLER_OFFER", entityId: created.body.id } }),
    ).toBe(2);
    const eventTypes = (
      await db.domainEvent.findMany({
        where: { aggregateType: "SellerOffer", aggregateId: created.body.id },
        select: { type: true },
      })
    ).map((event) => event.type);
    expect(eventTypes).toEqual(
      expect.arrayContaining([
        "SellerOfferSubmittedForModeration",
        "SellerOfferModerationApproved",
        "SellerOfferActivated",
        "SellerOfferModerationRejected",
      ]),
    );
  });
});
