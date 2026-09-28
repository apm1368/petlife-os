import { PrismaClient, type FulfillmentStatus, type OrderStatus, type Prisma } from "@prisma/client";
import { createHash } from "node:crypto";

/**
 * Batch 4 QA scenarios — commerce. Two verified sellers and one pending
 * seller, six products (variants, multiple sellers per product, low/out of
 * stock, a platform promotion and a seller promotion, repeat-delivery
 * eligible offers), verified reviews, and one demo customer with orders in
 * every state the UI must handle: in transit, delivered + reviewed,
 * delivered with an open refund request, cancelled & refunded, plus an
 * active and a paused repeat delivery and a cart with a changed price.
 *
 * Idempotent (deterministic ids + upserts). Runs only against a *_test
 * database, or a staging database named in PETLIFE_QA_SEED_DATABASE —
 * never the live database by default. All names are marked as demo data;
 * brands are fictional; images are repository-owned SVGs under
 * /images/products.
 */
const db = new PrismaClient();
const id = (key: string) => {
  const h = createHash("sha256").update(`petlife-batch4-qa:${key}`).digest("hex").slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20)}`;
};
const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);

interface VariantSeed {
  key: string;
  title: string;
  sku: string;
  attributes?: Record<string, string>;
  weightKg?: number;
  offers: { seller: "A" | "B" | "C"; price: number; onHand: number; repeat?: number[] }[];
}

interface ProductSeed {
  key: string;
  title: string;
  brand: string;
  category: string;
  image: string;
  description: string;
  dog: boolean;
  cat: boolean;
  minAge?: number;
  specs: { label: string; value: string }[];
  variants: VariantSeed[];
}

const PRODUCTS: ProductSeed[] = [
  {
    key: "dry-dog",
    title: "غذای خشک سگ بالغ — مرغ و برنج (نمایشی)",
    brand: "آوا پت",
    category: "dog-food",
    image: "/images/products/dry-dog-food.svg",
    description: "غذای کامل روزانه برای سگ‌های بالغ نژاد متوسط. پروتئین اصلی مرغ، بدون رنگ و طعم‌دهنده مصنوعی.\nمیزان مصرف روزانه را بر اساس وزن و فعالیت روی بسته تنظیم کنید.",
    dog: true,
    cat: false,
    minAge: 12,
    specs: [
      { label: "پروتئین خام", value: "۲۶٪" },
      { label: "چربی خام", value: "۱۴٪" },
      { label: "کشور سازنده", value: "ایران" },
    ],
    variants: [
      { key: "3kg", title: "۳ کیلوگرم", sku: "QA-AVA-DOG-3KG", attributes: { وزن: "۳ کیلوگرم" }, weightKg: 3, offers: [{ seller: "A", price: 6_900_000, onHand: 40, repeat: [14, 30, 45] }, { seller: "B", price: 7_200_000, onHand: 12 }] },
      { key: "10kg", title: "۱۰ کیلوگرم", sku: "QA-AVA-DOG-10KG", attributes: { وزن: "۱۰ کیلوگرم" }, weightKg: 10, offers: [{ seller: "A", price: 19_500_000, onHand: 4, repeat: [30, 60] }] },
    ],
  },
  {
    key: "cat-pouch",
    title: "پوچ گربه — تکه‌های ماهی در سس، بسته ۱۲ عددی (نمایشی)",
    brand: "مهرپت",
    category: "cat-food",
    image: "/images/products/cat-wet-pouch.svg",
    description: "غذای مرطوب کامل برای گربه‌های بالغ؛ هر پوچ ۸۵ گرم. برای گربه‌هایی که آب کم می‌نوشند مناسب است.",
    dog: false,
    cat: true,
    minAge: 12,
    specs: [
      { label: "وزن هر پوچ", value: "۸۵ گرم" },
      { label: "رطوبت", value: "۸۰٪" },
    ],
    variants: [{ key: "12x85", title: "۱۲ × ۸۵ گرم", sku: "QA-MEHR-CAT-12", offers: [{ seller: "A", price: 2_880_000, onHand: 25, repeat: [14, 30] }, { seller: "B", price: 2_790_000, onHand: 0 }] }],
  },
  {
    key: "litter",
    title: "خاک گربه گرانولی کلوخه‌شو — ۱۰ لیتری (نمایشی)",
    brand: "کیمیا",
    category: "hygiene",
    image: "/images/products/cat-litter.svg",
    description: "خاک بنتونیت کم‌گرد با کلوخه‌بندی سریع و کنترل بو.",
    dog: false,
    cat: true,
    specs: [{ label: "حجم", value: "۱۰ لیتر" }],
    variants: [{ key: "10l", title: "۱۰ لیتر", sku: "QA-KIMIA-LITTER-10L", offers: [{ seller: "B", price: 1_650_000, onHand: 3, repeat: [30] }] }],
  },
  {
    key: "harness",
    title: "قلاده سینه‌ای ضدکشش با بند بازتابنده (نمایشی)",
    brand: "راهرو",
    category: "walking",
    image: "/images/products/dog-harness.svg",
    description: "قلاده سینه‌ای با حلقه جلو برای کاهش کشیدن و نوار بازتابنده برای پیاده‌روی شبانه. اندازه را با دور سینه انتخاب کنید.",
    dog: true,
    cat: false,
    specs: [{ label: "جنس", value: "نایلون با آستر نرم" }],
    variants: [
      { key: "s", title: "کوچک (۳۵–۵۰ سانتی‌متر)", sku: "QA-RAHRO-HARNESS-S", attributes: { اندازه: "کوچک" }, offers: [{ seller: "A", price: 1_450_000, onHand: 9 }] },
      { key: "m", title: "متوسط (۵۰–۶۵ سانتی‌متر)", sku: "QA-RAHRO-HARNESS-M", attributes: { اندازه: "متوسط" }, offers: [{ seller: "A", price: 1_550_000, onHand: 0 }] },
      { key: "l", title: "بزرگ (۶۵–۸۵ سانتی‌متر)", sku: "QA-RAHRO-HARNESS-L", attributes: { اندازه: "بزرگ" }, offers: [{ seller: "A", price: 1_650_000, onHand: 6 }] },
    ],
  },
  {
    key: "omega",
    title: "مکمل امگا ۳ روغن ماهی برای سگ و گربه — ۱۲۰ میلی‌لیتر (نمایشی)",
    brand: "آوا پت",
    category: "supplements",
    image: "/images/products/omega-supplement.svg",
    description: "مکمل مایع امگا ۳ برای سلامت پوست و مو. پیش از مصرف در حیوانات دارای بیماری، با دامپزشک مشورت کنید.",
    dog: true,
    cat: true,
    specs: [{ label: "حجم", value: "۱۲۰ میلی‌لیتر" }],
    variants: [{ key: "120ml", title: "۱۲۰ میلی‌لیتر", sku: "QA-AVA-OMEGA-120", offers: [{ seller: "B", price: 980_000, onHand: 30, repeat: [30, 60] }, { seller: "C", price: 850_000, onHand: 50 }] }],
  },
  {
    key: "shampoo",
    title: "شامپوی پوست حساس بدون عطر (نمایشی)",
    brand: "کیمیا",
    category: "grooming",
    image: "/images/products/grooming-shampoo.svg",
    description: "شامپوی ملایم با pH متعادل برای پوست حساس. از تماس با چشم خودداری کنید.",
    dog: true,
    cat: true,
    specs: [{ label: "حجم", value: "۲۵۰ میلی‌لیتر" }],
    variants: [{ key: "250ml", title: "۲۵۰ میلی‌لیتر", sku: "QA-KIMIA-SHAMPOO-250", offers: [{ seller: "B", price: 640_000, onHand: 18 }] }],
  },
];

const CATEGORIES = [
  { key: "food", name: "غذا (نمایشی)", parent: null },
  { key: "dog-food", name: "غذای سگ", parent: "food" },
  { key: "cat-food", name: "غذای گربه", parent: "food" },
  { key: "hygiene", name: "بهداشت و خاک", parent: null },
  { key: "walking", name: "قلاده و گردش", parent: null },
  { key: "supplements", name: "مکمل و سلامت", parent: null },
  { key: "grooming", name: "آرایش و نظافت", parent: null },
];

async function user(email: string, name: string) {
  return db.user.upsert({ where: { email }, create: { id: id(`user:${email}`), email, displayName: name, locale: "fa" }, update: {} });
}

async function main() {
  const database = new URL(process.env.DATABASE_URL ?? "").pathname;
  if (!database.endsWith("_test") && process.env.PETLIFE_QA_SEED_DATABASE !== database.slice(1)) {
    throw new Error("This QA seed runs against a *_test database, or a staging database named in PETLIFE_QA_SEED_DATABASE.");
  }

  // ---- Sellers (two verified, one still in verification — never shown to shoppers)
  const sellerDefs = {
    A: { name: "پت‌شاپ آوا — ونک (نمایشی)", city: "تهران", verified: true, owner: "batch4-seller-a@example.test", ownerName: "مینا رستمی" },
    B: { name: "فروشگاه حیوانات مهر — کرج (نمایشی)", city: "کرج", verified: true, owner: "batch4-seller-b@example.test", ownerName: "بهرام نادری" },
    C: { name: "تأمین‌کننده در انتظار تأیید (نمایشی)", city: "تهران", verified: false, owner: "batch4-seller-c@example.test", ownerName: "کاربر نمایشی" },
  } as const;
  const sellerIds: Record<"A" | "B" | "C", string> = { A: id("seller:A"), B: id("seller:B"), C: id("seller:C") };
  for (const [key, s] of Object.entries(sellerDefs) as ["A" | "B" | "C", (typeof sellerDefs)["A"]][]) {
    await db.sellerOrganization.upsert({
      where: { id: sellerIds[key] },
      create: { id: sellerIds[key], name: s.name, city: s.city, countryCode: "IR", verificationStatus: s.verified ? "VERIFIED" : "SUBMITTED", status: "ACTIVE" },
      update: {},
    });
    const owner = await user(s.owner, s.ownerName);
    await db.sellerMembership.upsert({
      where: { sellerOrganizationId_userId: { sellerOrganizationId: sellerIds[key], userId: owner.id } },
      create: { sellerOrganizationId: sellerIds[key], userId: owner.id, role: "OWNER", status: "ACTIVE", acceptedAt: new Date() },
      update: {},
    });
  }

  // ---- Catalog
  const categoryIds: Record<string, string> = {};
  for (const c of CATEGORIES) {
    categoryIds[c.key] = id(`category:${c.key}`);
    await db.productCategory.upsert({
      where: { id: categoryIds[c.key] },
      create: { id: categoryIds[c.key], name: c.name, slug: `qa-b4-${c.key}`, parentId: c.parent ? categoryIds[c.parent] : null },
      update: {},
    });
  }
  const brandIds: Record<string, string> = {};
  for (const name of [...new Set(PRODUCTS.map((p) => p.brand))]) {
    brandIds[name] = id(`brand:${name}`);
    await db.brand.upsert({ where: { id: brandIds[name] }, create: { id: brandIds[name], name, slug: `qa-b4-brand-${Object.keys(brandIds).length}` }, update: {} });
  }

  const offerIds: Record<string, string> = {};
  for (const [pi, p] of PRODUCTS.entries()) {
    const productId = id(`product:${p.key}`);
    await db.product.upsert({
      where: { id: productId },
      create: {
        id: productId,
        title: p.title,
        slug: `qa-b4-${p.key}`,
        description: p.description,
        brandId: brandIds[p.brand],
        categoryId: categoryIds[p.category]!,
        supportsDog: p.dog,
        supportsCat: p.cat,
        minAgeMonths: p.minAge ?? null,
        allergenTags: [],
        specifications: p.specs as unknown as Prisma.InputJsonValue,
        // Staggered creation so "Newest" has a stable, explainable order.
        createdAt: ago(30 - pi),
      },
      update: {},
    });
    await db.productMedia.upsert({ where: { id: id(`media:${p.key}`) }, create: { id: id(`media:${p.key}`), productId, url: p.image, alt: p.title, sortOrder: 0 }, update: {} });
    for (const v of p.variants) {
      const variantId = id(`variant:${p.key}:${v.key}`);
      await db.productVariant.upsert({
        where: { id: variantId },
        create: { id: variantId, productId, sku: v.sku, title: v.title, attributes: (v.attributes ?? undefined) as Prisma.InputJsonValue | undefined, weightValue: v.weightKg ?? null, weightUnit: v.weightKg ? "KG" : null },
        update: {},
      });
      for (const o of v.offers) {
        const offerId = id(`offer:${p.key}:${v.key}:${o.seller}`);
        offerIds[`${p.key}:${v.key}:${o.seller}`] = offerId;
        await db.sellerOffer.upsert({
          where: { id: offerId },
          create: { id: offerId, sellerOrganizationId: sellerIds[o.seller], productVariantId: variantId, priceAmount: o.price, currency: "IRR", status: "ACTIVE", repeatDeliveryEligible: Boolean(o.repeat), repeatIntervalsDays: o.repeat ?? [], sellerSku: `${o.seller}-${v.sku}` },
          update: {},
        });
        await db.inventoryItem.upsert({ where: { sellerOfferId: offerId }, create: { sellerOfferId: offerId, onHand: o.onHand }, update: {} });
      }
    }
  }

  // ---- Promotions: one platform (supplements −15%, ends in 20 days), one seller-funded (seller A dry food −10%)
  const admin = await user("batch4-merch-admin@example.test", "مدیر فروشگاه (نمایشی)");
  await db.promotion.upsert({
    where: { id: id("promo:platform") },
    create: { id: id("promo:platform"), name: "جشنواره پاییز", discountType: "PERCENT", value: 15, maxDiscountAmount: 500_000, scope: "CATEGORY", categoryIds: [categoryIds.supplements!], startsAt: ago(3), endsAt: new Date(Date.now() + 20 * DAY), status: "ACTIVE", fundedBy: "PLATFORM", usageLimit: 500, createdByUserId: admin.id },
    update: {},
  });
  const sellerAOwner = await user(sellerDefs.A.owner, sellerDefs.A.ownerName);
  await db.promotion.upsert({
    where: { id: id("promo:seller-a") },
    create: { id: id("promo:seller-a"), name: "تخفیف غذای خشک آوا", discountType: "PERCENT", value: 10, scope: "PRODUCT", productIds: [id("product:dry-dog")], startsAt: ago(5), endsAt: new Date(Date.now() + 10 * DAY), status: "ACTIVE", fundedBy: "SELLER", ownerSellerOrganizationId: sellerIds.A, createdByUserId: sellerAOwner.id },
    update: {},
  });

  // ---- Demo customer and household
  const customer = await user("batch4-customer@example.test", "الهام صالحی (حساب نمایشی)");
  const householdId = id("household");
  await db.household.upsert({ where: { id: householdId }, create: { id: householdId, name: "خانواده صالحی (نمایشی)", countryCode: "IR", city: "تهران" }, update: {} });
  await db.householdMember.upsert({ where: { householdId_userId: { householdId, userId: customer.id } }, create: { householdId, userId: customer.id, role: "OWNER" }, update: {} });
  await db.pet.upsert({ where: { id: id("pet:dog") }, create: { id: id("pet:dog"), householdId, name: "هاپو", species: "DOG", approximateAgeMonths: 30, latestWeightValue: 18, latestWeightUnit: "KG" }, update: {} });
  await db.pet.upsert({ where: { id: id("pet:cat") }, create: { id: id("pet:cat"), householdId, name: "پیشی", species: "CAT", approximateAgeMonths: 40, latestWeightValue: 4.2, latestWeightUnit: "KG" }, update: {} });
  const addressId = id("address:home");
  await db.customerAddress.upsert({
    where: { id: addressId },
    create: { id: addressId, householdId, label: "خانه", recipient: "الهام صالحی", phone: "09120000000", addressLine: "خیابان شریعتی، کوچه نمونه، پلاک ۱۲، واحد ۳", city: "تهران", region: "تهران", countryCode: "IR", postalCode: "1234567890", isDefault: true },
    update: {},
  });
  const addressSnapshot = { addressLine: "خیابان شریعتی، کوچه نمونه، پلاک ۱۲، واحد ۳", city: "تهران", region: "تهران", countryCode: "IR", recipient: "الهام صالحی", phone: "09120000000" };

  // ---- Orders in every customer-facing state
  interface OrderSeed {
    key: string;
    seller: "A" | "B";
    items: { product: string; variant: string; quantity: number; unitPrice: number; listUnitPrice?: number; promotion?: string }[];
    daysAgo: number;
    fulfillment: FulfillmentStatus;
    status: OrderStatus;
    cancelled?: string;
  }
  const ORDERS: OrderSeed[] = [
    { key: "in-transit", seller: "A", items: [{ product: "harness", variant: "s", quantity: 1, unitPrice: 1_450_000 }], daysAgo: 1, fulfillment: "IN_TRANSIT", status: "CONFIRMED" },
    { key: "delivered-reviewed", seller: "A", items: [{ product: "dry-dog", variant: "3kg", quantity: 2, unitPrice: 6_210_000, listUnitPrice: 6_900_000, promotion: "promo:seller-a" }], daysAgo: 12, fulfillment: "DELIVERED", status: "CONFIRMED" },
    { key: "delivered-refund-request", seller: "B", items: [{ product: "litter", variant: "10l", quantity: 1, unitPrice: 1_650_000 }], daysAgo: 4, fulfillment: "DELIVERED", status: "CONFIRMED" },
    { key: "cancelled", seller: "B", items: [{ product: "shampoo", variant: "250ml", quantity: 1, unitPrice: 640_000 }], daysAgo: 6, fulfillment: "CANCELED", status: "REFUNDED", cancelled: "سفارش تکراری ثبت شده بود" },
  ];
  for (const o of ORDERS) {
    const checkoutId = id(`checkout:${o.key}`);
    const cartId = id(`cart:${o.key}`);
    const orderId = id(`order:${o.key}`);
    const subtotal = o.items.reduce((s, i) => s + (i.listUnitPrice ?? i.unitPrice) * i.quantity, 0);
    const discount = o.items.reduce((s, i) => s + ((i.listUnitPrice ?? i.unitPrice) - i.unitPrice) * i.quantity, 0);
    const total = subtotal - discount;
    const placed = ago(o.daysAgo);
    await db.cart.upsert({ where: { id: cartId }, create: { id: cartId, userId: customer.id, householdId, status: "CONVERTED" }, update: {} });
    await db.checkout.upsert({
      where: { id: checkoutId },
      create: { id: checkoutId, userId: customer.id, householdId, cartId, addressId, status: "CONFIRMED", paymentMethodType: "ONLINE_PAYMENT", subtotalAmount: subtotal, discountAmount: discount, deliveryAmount: 0, totalAmount: total, currency: "IRR", createdAt: placed },
      update: {},
    });
    const intentId = id(`intent:${o.key}`);
    await db.paymentIntent.upsert({ where: { id: intentId }, create: { id: intentId, checkoutId, amount: total, currency: "IRR", status: "CAPTURED", provider: "DEV_SIMULATED", createdAt: placed }, update: {} });
    await db.paymentAttempt.upsert({ where: { id: id(`attempt:${o.key}`) }, create: { id: id(`attempt:${o.key}`), paymentIntentId: intentId, provider: "DEV_SIMULATED", providerReference: `qa-dev-${o.key}`, status: "SUCCEEDED", completedAt: placed }, update: {} });
    await db.order.upsert({
      where: { id: orderId },
      create: {
        id: orderId,
        checkoutId,
        sellerOrganizationId: sellerIds[o.seller],
        userId: customer.id,
        householdId,
        status: o.status,
        subtotalAmount: subtotal,
        discountAmount: discount,
        deliveryAmount: 0,
        totalAmount: total,
        currency: "IRR",
        shippingAddressId: addressId,
        shippingAddressSnapshot: addressSnapshot,
        confirmedAt: placed,
        createdAt: placed,
        cancelledAt: o.cancelled ? new Date(placed.getTime() + 3600_000) : null,
        cancelReason: o.cancelled ?? null,
        cancelledBy: o.cancelled ? "CUSTOMER" : null,
      },
      update: {},
    });
    for (const [ii, item] of o.items.entries()) {
      const variantId = id(`variant:${item.product}:${item.variant}`);
      const product = PRODUCTS.find((p) => p.key === item.product)!;
      const itemId = id(`order-item:${o.key}:${ii}`);
      await db.orderItem.upsert({
        where: { id: itemId },
        create: {
          id: itemId,
          orderId,
          productId: id(`product:${item.product}`),
          productVariantId: variantId,
          sellerOfferId: offerIds[`${item.product}:${item.variant}:${o.seller}`]!,
          productTitleSnapshot: product.title,
          variantTitleSnapshot: product.variants.find((v) => v.key === item.variant)!.title,
          skuSnapshot: product.variants.find((v) => v.key === item.variant)!.sku,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.unitPrice * item.quantity,
          listUnitPrice: item.listUnitPrice ?? item.unitPrice,
          unitDiscount: (item.listUnitPrice ?? item.unitPrice) - item.unitPrice,
          promotionId: item.promotion ? id(item.promotion) : null,
          promotionName: item.promotion ? "تخفیف غذای خشک آوا" : null,
          compatibilitySnapshot: {},
        },
        update: {},
      });
      if (item.promotion) {
        await db.promotionRedemption.upsert({ where: { orderItemId: itemId }, create: { promotionId: id(item.promotion), orderId, orderItemId: itemId, userId: customer.id, amount: ((item.listUnitPrice ?? item.unitPrice) - item.unitPrice) * item.quantity }, update: {} });
      }
    }
    const f = o.fulfillment;
    await db.fulfillment.upsert({
      where: { orderId_sequenceNumber: { orderId, sequenceNumber: 1 } },
      create: {
        orderId,
        sellerOrgId: sellerIds[o.seller],
        status: f,
        pickupAddressSnapshot: { city: sellerDefs[o.seller].city },
        deliveryAddressSnapshot: addressSnapshot,
        readyAt: f === "CANCELED" ? null : new Date(placed.getTime() + 4 * 3600_000),
        pickedUpAt: f === "IN_TRANSIT" || f === "DELIVERED" ? new Date(placed.getTime() + 6 * 3600_000) : null,
        deliveredAt: f === "DELIVERED" ? new Date(placed.getTime() + 26 * 3600_000) : null,
        canceledAt: f === "CANCELED" ? new Date(placed.getTime() + 3600_000) : null,
      },
      update: {},
    });
    await db.orderStatusEvent.upsert({ where: { id: id(`event:${o.key}:confirmed`) }, create: { id: id(`event:${o.key}:confirmed`), orderId, fromStatus: null, toStatus: "CONFIRMED", actorType: "SYSTEM", reason: "PAYMENT_CONFIRMED", createdAt: placed }, update: {} });
    if (o.status === "REFUNDED") {
      const refundedAt = new Date(placed.getTime() + 3600_000);
      await db.orderStatusEvent.upsert({ where: { id: id(`event:${o.key}:refunded`) }, create: { id: id(`event:${o.key}:refunded`), orderId, fromStatus: "CONFIRMED", toStatus: "REFUNDED", actorType: "CUSTOMER", actorId: customer.id, reason: o.cancelled ?? null, createdAt: refundedAt }, update: {} });
      await db.refund.upsert({ where: { id: id(`refund:${o.key}`) }, create: { id: id(`refund:${o.key}`), paymentIntentId: intentId, orderId, amount: total, currency: "IRR", status: "SUCCEEDED", reason: o.cancelled ?? null, providerReference: `qa-dev-refund-${o.key}`, requestedByUserId: customer.id, createdAt: refundedAt, completedAt: refundedAt }, update: {} });
    }
  }

  // Verified reviews: the demo customer's delivered order plus two other verified buyers.
  await db.productReview.upsert({
    where: { orderItemId: id("order-item:delivered-reviewed:0") },
    create: { orderItemId: id("order-item:delivered-reviewed:0"), productId: id("product:dry-dog"), productVariantId: id("variant:dry-dog:3kg"), userId: customer.id, rating: 5, body: "هاپو با اشتها می‌خورد و مدفوعش هم منظم‌تر شده. بسته‌بندی سالم رسید.", createdAt: ago(8) },
    update: {},
  });
  for (const [i, r] of [
    { email: "batch4-buyer-1@example.test", name: "رضا", product: "dry-dog", variant: "3kg", seller: "B" as const, rating: 4, body: "کیفیت خوب؛ فقط کاش بسته درِ زیپی داشت." },
    { email: "batch4-buyer-2@example.test", name: "سمانه", product: "cat-pouch", variant: "12x85", seller: "A" as const, rating: 5, body: "گربه‌ام که غذای مرطوب نمی‌خورد این را دوست دارد." },
  ].entries()) {
    const buyer = await user(r.email, r.name);
    const hh = id(`buyer-household:${i}`);
    await db.household.upsert({ where: { id: hh }, create: { id: hh, name: `خانوار نمایشی ${i + 1}`, countryCode: "IR", city: "تهران" }, update: {} });
    await db.householdMember.upsert({ where: { householdId_userId: { householdId: hh, userId: buyer.id } }, create: { householdId: hh, userId: buyer.id, role: "OWNER" }, update: {} });
    const product = PRODUCTS.find((p) => p.key === r.product)!;
    const variant = product.variants.find((v) => v.key === r.variant)!;
    const price = variant.offers.find((o) => o.seller === r.seller)!.price;
    const cartId = id(`buyer-cart:${i}`);
    const checkoutId = id(`buyer-checkout:${i}`);
    const orderId = id(`buyer-order:${i}`);
    const itemId = id(`buyer-item:${i}`);
    await db.cart.upsert({ where: { id: cartId }, create: { id: cartId, userId: buyer.id, householdId: hh, status: "CONVERTED" }, update: {} });
    await db.checkout.upsert({ where: { id: checkoutId }, create: { id: checkoutId, userId: buyer.id, householdId: hh, cartId, status: "CONFIRMED", subtotalAmount: price, totalAmount: price, currency: "IRR" }, update: {} });
    await db.order.upsert({ where: { id: orderId }, create: { id: orderId, checkoutId, sellerOrganizationId: sellerIds[r.seller], userId: buyer.id, householdId: hh, status: "CONFIRMED", subtotalAmount: price, discountAmount: 0, deliveryAmount: 0, totalAmount: price, currency: "IRR", shippingAddressSnapshot: { city: "تهران" }, confirmedAt: ago(20), createdAt: ago(20) }, update: {} });
    await db.orderItem.upsert({
      where: { id: itemId },
      create: { id: itemId, orderId, productId: id(`product:${r.product}`), productVariantId: id(`variant:${r.product}:${r.variant}`), sellerOfferId: offerIds[`${r.product}:${r.variant}:${r.seller}`]!, productTitleSnapshot: product.title, variantTitleSnapshot: variant.title, skuSnapshot: variant.sku, quantity: 1, unitPrice: price, totalPrice: price, listUnitPrice: price, compatibilitySnapshot: {} },
      update: {},
    });
    await db.fulfillment.upsert({ where: { orderId_sequenceNumber: { orderId, sequenceNumber: 1 } }, create: { orderId, sellerOrgId: sellerIds[r.seller], status: "DELIVERED", pickupAddressSnapshot: {}, deliveryAddressSnapshot: { city: "تهران" }, deliveredAt: ago(18) }, update: {} });
    await db.productReview.upsert({ where: { orderItemId: itemId }, create: { orderItemId: itemId, productId: id(`product:${r.product}`), productVariantId: id(`variant:${r.product}:${r.variant}`), userId: buyer.id, rating: r.rating, body: r.body, createdAt: ago(15 - i) }, update: {} });
  }

  // Open refund request on the delivered litter order.
  await db.orderRefundRequest.upsert({
    where: { id: id("refund-request:litter") },
    create: { id: id("refund-request:litter"), orderId: id("order:delivered-refund-request"), userId: customer.id, reason: "DAMAGED", description: "کیسه پاره رسید و حدود یک‌سوم خاک ریخته بود.", requestedAmount: 1_650_000, orderItemIds: [id("order-item:delivered-refund-request:0")] },
    update: {},
  });

  // Repeat deliveries: one active (due in 5 days), one paused. The dry-food one uses today's discounted price.
  await db.repeatDeliverySchedule.upsert({
    where: { id: id("repeat:dry-dog") },
    create: { id: id("repeat:dry-dog"), userId: customer.id, householdId, productVariantId: id("variant:dry-dog:3kg"), sellerOfferId: offerIds["dry-dog:3kg:A"]!, quantity: 1, intervalDays: 30, nextCycleAt: new Date(Date.now() + 5 * DAY), addressId, acceptedUnitPrice: 6_210_000, lastOrderId: id("order:delivered-reviewed") },
    update: {},
  });
  await db.repeatDeliveryEvent.upsert({ where: { id: id("repeat-event:dry-dog:created") }, create: { id: id("repeat-event:dry-dog:created"), scheduleId: id("repeat:dry-dog"), type: "CREATED", actorId: customer.id, createdAt: ago(12) }, update: {} });
  await db.repeatDeliverySchedule.upsert({
    where: { id: id("repeat:cat-pouch") },
    create: { id: id("repeat:cat-pouch"), userId: customer.id, householdId, productVariantId: id("variant:cat-pouch:12x85"), sellerOfferId: offerIds["cat-pouch:12x85:A"]!, quantity: 2, intervalDays: 14, nextCycleAt: new Date(Date.now() + 9 * DAY), addressId, acceptedUnitPrice: 2_880_000, status: "PAUSED" },
    update: {},
  });

  // A live cart: the omega supplement was added before the platform promotion started (price changed).
  const liveCartId = id("cart:live");
  await db.cart.upsert({ where: { id: liveCartId }, create: { id: liveCartId, userId: customer.id, householdId, status: "ACTIVE" }, update: {} });
  await db.cartLine.upsert({
    where: { id: id("cart-line:omega") },
    create: { id: id("cart-line:omega"), cartId: liveCartId, sellerOfferId: offerIds["omega:120ml:B"]!, quantity: 1, unitPriceSnapshot: 980_000, currency: "IRR", targetPetId: id("pet:dog") },
    update: {},
  });

  console.log(`Batch 4 QA seed ready on ${database.slice(1)}: 3 sellers, ${PRODUCTS.length} products, 2 promotions, customer batch4-customer@example.test`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
