import {
  LocationMode,
  PetFriendlyPlaceCategory,
  PetFriendlyPlaceStatus,
  Prisma,
  ProductStatus,
  ProviderServiceType,
  ProviderType,
  ProviderVerificationStatus,
  SellerOfferModerationStatus,
  SellerOfferStatus,
  SellerStatus,
  SellerVerificationStatus,
  ServiceCategory,
  SubscriptionPlanStatus,
} from "@prisma/client";
import request from "supertest";
import type { INestApplication } from "@nestjs/common";
import { createTestApp } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";
import { SubscriptionPlanReadService } from "../src/modules/subscriptions/subscription-plan-read.service";

/** Regression guard for the actual customer-facing public catalog reads. */
describe("production public reads exclude seed-origin records", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it("hides demo vet, product, place, and paid membership records while retaining reviewed records", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const [demoVet, realVet] = await Promise.all([
      prisma.providerOrganization.create({
        data: {
          name: `QA-${suffix} Demo Vet`,
          type: ProviderType.VET_CLINIC,
          verificationStatus: ProviderVerificationStatus.VERIFIED,
          isDemoRecord: true,
        },
      }),
      prisma.providerOrganization.create({
        data: {
          name: `QA-${suffix} Reviewed Vet`,
          type: ProviderType.VET_CLINIC,
          verificationStatus: ProviderVerificationStatus.VERIFIED,
        },
      }),
    ]);
    const serviceIds = new Map<string, string>();
    for (const org of [demoVet, realVet]) {
      const location = await prisma.providerLocation.create({
        data: {
          providerOrganizationId: org.id,
          name: "Clinic",
          addressLine: "QA street 1",
          city: "Tehran",
          countryCode: "IR",
          timezone: "Asia/Tehran",
        },
      });
      const service = await prisma.providerService.create({
        data: {
          providerOrganizationId: org.id,
          locationId: location.id,
          name: "Consultation",
          type: ProviderServiceType.GENERAL_VET_VISIT,
          category: ServiceCategory.VET,
          durationMinutes: 30,
          priceAmount: new Prisma.Decimal(1000),
          currency: "IRR",
          locationMode: LocationMode.AT_PROVIDER,
        },
      });
      serviceIds.set(org.id, service.id);
    }

    const category = await prisma.productCategory.create({
      data: { name: `Public QA ${suffix}`, slug: `public-qa-${suffix}` },
    });
    const [demoProduct, realProduct] = await Promise.all([
      prisma.product.create({
        data: {
          isDemoRecord: true,
          categoryId: category.id,
          title: `Demo Product ${suffix}`,
          slug: `demo-product-${suffix}`,
          status: ProductStatus.ACTIVE,
          variants: { create: { sku: `DEMO-${suffix}`, title: "1 unit" } },
        },
        include: { variants: true },
      }),
      prisma.product.create({
        data: {
          categoryId: category.id,
          title: `Reviewed Product ${suffix}`,
          slug: `reviewed-product-${suffix}`,
          status: ProductStatus.ACTIVE,
          variants: { create: { sku: `REAL-${suffix}`, title: "1 unit" } },
        },
        include: { variants: true },
      }),
    ]);
    const seller = await prisma.sellerOrganization.create({
      data: {
        name: `Reviewed seller ${suffix}`,
        verificationStatus: SellerVerificationStatus.VERIFIED,
        status: SellerStatus.ACTIVE,
        countryCode: "IR",
      },
    });
    for (const variant of [demoProduct.variants[0]!, realProduct.variants[0]!] as const) {
      const offer = await prisma.sellerOffer.create({
        data: {
          sellerOrganizationId: seller.id,
          productVariantId: variant.id,
          priceAmount: 100_000,
          status: SellerOfferStatus.ACTIVE,
          moderationStatus: SellerOfferModerationStatus.APPROVED,
        },
      });
      await prisma.inventoryItem.create({ data: { sellerOfferId: offer.id, onHand: 3 } });
    }

    const [demoPlace, realPlace] = await Promise.all([
      prisma.petFriendlyPlace.create({
        data: {
          isDemoRecord: true,
          name: `Demo Park ${suffix}`,
          category: PetFriendlyPlaceCategory.PARK,
          country: "IR",
          city: "Tehran",
          latitude: 35.7,
          longitude: 51.4,
          status: PetFriendlyPlaceStatus.VERIFIED,
          isPubliclyListed: true,
        },
      }),
      prisma.petFriendlyPlace.create({
        data: {
          name: `Reviewed Park ${suffix}`,
          category: PetFriendlyPlaceCategory.PARK,
          country: "IR",
          city: "Tehran",
          latitude: 35.7,
          longitude: 51.4,
          status: PetFriendlyPlaceStatus.VERIFIED,
          isPubliclyListed: true,
        },
      }),
    ]);

    const demoPlanCode = `demo-${suffix}`;
    const realPlanCode = `reviewed-${suffix}`;
    await Promise.all([
      prisma.subscriptionPlan.create({
        data: {
          isDemoRecord: true,
          code: demoPlanCode,
          nameFa: "نمونه",
          nameEn: "Demo",
          isFree: false,
          status: SubscriptionPlanStatus.ACTIVE,
          countryAvailability: { create: { countryCode: "IR" } },
        },
      }),
      prisma.subscriptionPlan.create({
        data: {
          code: realPlanCode,
          nameFa: "واقعی",
          nameEn: "Reviewed",
          isFree: false,
          status: SubscriptionPlanStatus.ACTIVE,
          countryAvailability: { create: { countryCode: "IR" } },
        },
      }),
    ]);

    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const vets = await request(app.getHttpServer()).get("/providers/vets").expect(200);
      expect(vets.body.map((row: { id: string }) => row.id)).toContain(realVet.id);
      expect(vets.body.map((row: { id: string }) => row.id)).not.toContain(demoVet.id);
      await request(app.getHttpServer()).get(`/providers/vets/${demoVet.id}`).expect(404);

      const services = await request(app.getHttpServer()).get("/providers/services").expect(200);
      expect(services.body.map((row: { provider: { id: string } }) => row.provider.id)).toContain(realVet.id);
      expect(services.body.map((row: { provider: { id: string } }) => row.provider.id)).not.toContain(
        demoVet.id,
      );
      await request(app.getHttpServer())
        .get(`/provider-services/${serviceIds.get(demoVet.id)}`)
        .expect(404);

      const discoveryQuery = new URLSearchParams({ q: `QA-${suffix}` }).toString();
      const discovery = await request(app.getHttpServer()).get(`/discovery/providers?${discoveryQuery}`).expect(200);
      expect(discovery.body.items.map((row: { id: string }) => row.id)).toContain(realVet.id);
      expect(discovery.body.items.map((row: { id: string }) => row.id)).not.toContain(demoVet.id);
      await request(app.getHttpServer()).get(`/discovery/providers/${demoVet.id}`).expect(404);

      const products = await request(app.getHttpServer()).get("/shop/products").expect(200);
      const productRows = products.body.items ?? products.body.data ?? products.body;
      expect(productRows.map((row: { id: string }) => row.id)).toContain(realProduct.id);
      expect(productRows.map((row: { id: string }) => row.id)).not.toContain(demoProduct.id);
      await request(app.getHttpServer()).get(`/shop/products/${demoProduct.id}`).expect(404);
      await request(app.getHttpServer()).get(`/shop/products/${realProduct.id}`).expect(200);

      const places = await request(app.getHttpServer()).get("/places").expect(200);
      const placeRows = places.body.items ?? places.body.data ?? places.body;
      expect(placeRows.map((row: { id: string }) => row.id)).toContain(realPlace.id);
      expect(placeRows.map((row: { id: string }) => row.id)).not.toContain(demoPlace.id);

      const plans = await app.get(SubscriptionPlanReadService).listForCountry("IR");
      expect(plans.map((plan) => plan.code)).toContain(realPlanCode);
      expect(plans.map((plan) => plan.code)).not.toContain(demoPlanCode);
    } finally {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnv;
    }
  });
});
