import type { INestApplication } from "@nestjs/common";
import { PetSpecies } from "@prisma/client";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { createTestApp } from "./test-app";
import { PrismaService } from "../src/common/prisma/prisma.service";

describe("All-species catalog filtering", () => {
  let app: INestApplication, db: PrismaService;
  const marker = `species-${randomUUID()}`;
  const products = new Map<PetSpecies, string>();
  const services = new Map<PetSpecies, string>();
  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(PrismaService);
    const category = await db.productCategory.create({ data: { name: marker, slug: marker } });
    const seller = await db.sellerOrganization.create({ data: { name: marker, status: "ACTIVE", verificationStatus: "VERIFIED", countryCode: "IR" } });
    for (const species of Object.values(PetSpecies)) {
      const targeting = { supportsDog: species === "DOG", supportsCat: species === "CAT", additionalSpecies: species === "DOG" || species === "CAT" ? [] : [species] };
      const product = await db.product.create({ data: { title: `${marker}-${species}`, slug: `${marker}-${species}`, categoryId: category.id, allergenTags: [], ...targeting } });
      const variant = await db.productVariant.create({ data: { productId: product.id, sku: `${marker}-${species}` } });
      await db.sellerOffer.create({ data: { sellerOrganizationId: seller.id, productVariantId: variant.id, priceAmount: 100000, inventoryItem: { create: { onHand: 10 } } } });
      products.set(species, product.id);
      const org = await db.providerOrganization.create({ data: { name: `${marker}-${species}`, type: "VET_CLINIC", verificationStatus: "VERIFIED" } });
      const service = await db.providerService.create({ data: { providerOrganizationId: org.id, name: marker, category: "VET", type: "GENERAL_VET_VISIT", durationMinutes: 30, ...targeting } });
      services.set(species, service.id);
    }
  });
  afterAll(async () => { await app?.close(); });

  it.each(Object.values(PetSpecies))("returns only products and services explicitly targeting %s", async (species) => {
    const productResult = await request(app.getHttpServer()).get("/shop/products").query({ species, search: marker }).expect(200);
    expect(productResult.body.items.map((p: { id: string }) => p.id)).toEqual([products.get(species)]);
    expect(productResult.body.items[0].supportedSpecies).toEqual([species]);
    const serviceResult = await request(app.getHttpServer()).get("/providers/services").query({ species, search: marker }).expect(200);
    expect(serviceResult.body.map((s: { service: { id: string } }) => s.service.id)).toEqual([services.get(species)]);
    expect(serviceResult.body[0].service.supportedSpecies).toEqual([species]);
    const discovery = await request(app.getHttpServer()).get("/discovery/providers").query({ species, q: marker }).expect(200);
    expect(discovery.body.items).toHaveLength(1);
    expect(discovery.body.items[0].petTypes).toEqual([species]);
    await request(app.getHttpServer()).get("/travel/listings").query({ species, q: marker }).expect(200);
  });

  it("rejects invalid species rather than silently ignoring the filter", async () => {
    await request(app.getHttpServer()).get("/shop/products?species=UNICORN").expect(400);
    await request(app.getHttpServer()).get("/providers/services?species=UNICORN").expect(400);
    await request(app.getHttpServer()).get("/travel/listings?species=UNICORN").expect(400);
  });
});
