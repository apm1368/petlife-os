import { Injectable } from "@nestjs/common";
import { resolveObjectUrl } from "../storage/object-url.util";
import {
  LocationMode,
  PartnerSubjectType,
  Prisma,
  ProviderServiceType,
  ProviderType,
  ProviderUserRole,
  ProviderVerificationStatus,
  SellerMembershipRole,
  SellerMembershipStatus,
  SellerOfferModerationStatus,
  SellerOfferStatus,
  SellerStatus,
  ServiceCategory,
  type PartnerDocumentKind,
} from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ValidationApiException } from "../../common/errors/api-exception";
import { StorageService } from "../storage/storage.service";
import { PartnerVerificationService } from "../partner-verification/partner-verification.service";
import type {
  PartnerAddressDto,
  PartnerBusinessDto,
  PartnerCalendarDto,
  PartnerOwnerDto,
  PartnerProductsDto,
  PartnerRegisterDocumentDto,
  PartnerServiceKind,
  PartnerServicesDto,
  StartPartnerOnboardingDto,
} from "./partner-onboarding.dto";

/** Marks a seller organization created by partner signup (provider orgs carry `serviceKinds` instead). */
export const PARTNER_ONBOARDING_SOURCE = "PARTNER_ONBOARDING";
/** Statuses in which the partner may still change what they submit (same as verification's SUBMITTABLE). */
const EDITABLE = ["NOT_STARTED", "NEEDS_INFORMATION", "REJECTED"];

/** What a service of each kind is in the booking model. */
const KIND_SERVICE: Record<PartnerServiceKind, { type: ProviderServiceType; category: ServiceCategory; locationMode: LocationMode }> = {
  VET_CLINIC: { type: ProviderServiceType.GENERAL_VET_VISIT, category: ServiceCategory.VET, locationMode: LocationMode.AT_PROVIDER },
  VETERINARIAN: { type: ProviderServiceType.GENERAL_VET_VISIT, category: ServiceCategory.VET, locationMode: LocationMode.AT_PROVIDER },
  GROOMER: { type: ProviderServiceType.GROOMING_SESSION, category: ServiceCategory.GROOMING, locationMode: LocationMode.AT_PROVIDER },
  BOARDING: { type: ProviderServiceType.BOARDING_STAY, category: ServiceCategory.BOARDING, locationMode: LocationMode.AT_PROVIDER },
  SITTER: { type: ProviderServiceType.PET_SITTING, category: ServiceCategory.SITTING, locationMode: LocationMode.AT_CUSTOMER },
  TRAINER: { type: ProviderServiceType.TRAINING_SESSION, category: ServiceCategory.TRAINING, locationMode: LocationMode.AT_PROVIDER },
  WALKER: { type: ProviderServiceType.DOG_WALK, category: ServiceCategory.WALKING, locationMode: LocationMode.AT_CUSTOMER },
  PET_TAXI: { type: ProviderServiceType.PET_TAXI_RIDE, category: ServiceCategory.PET_TAXI, locationMode: LocationMode.TRANSPORT },
};

const toLatinDigits = (v: string) => v.replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/**
 * Partner signup ("ثبت‌نام همکار"): one wizard that creates the partner's own service business and/or shop, owned by
 * the signing-up user, and hands them to KYC. Everything it creates stays off the site until staff verify it:
 * organizations start NOT_STARTED, services inactive, offers PAUSED and pending moderation. The partner can never
 * reach these rows through ids they pass in — each call resolves the caller's own onboarding organizations.
 */
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
/** Exactly the shape StorageService.createPartnerLogoUploadTarget issues for this user. */
const logoKeyPattern = (userId: string) => new RegExp(`^partner-logos/${userId.replace(/[^0-9a-f-]/gi, "")}/${UUID}\\.(jpg|png|webp)$`);

@Injectable()
export class PartnerOnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly verification: PartnerVerificationService,
  ) {}

  // ------------------------------------------------------------------ the caller's own organizations
  private async orgs(userId: string, db: Prisma.TransactionClient | PrismaService = this.prisma) {
    const [pu, sm] = await Promise.all([
      db.providerUser.findFirst({
        where: { userId, role: ProviderUserRole.OWNER, removedAt: null, providerOrganization: { serviceKinds: { isEmpty: false } } },
        orderBy: { createdAt: "asc" },
        include: { providerOrganization: { include: { locations: { orderBy: { createdAt: "asc" }, take: 1 } } } },
      }),
      db.sellerMembership.findFirst({
        where: { userId, role: SellerMembershipRole.OWNER, status: SellerMembershipStatus.ACTIVE, sellerOrganization: { businessMetadata: { path: ["source"], equals: PARTNER_ONBOARDING_SOURCE } } },
        orderBy: { createdAt: "asc" },
        include: { sellerOrganization: true },
      }),
    ]);
    return { provider: pu?.providerOrganization ?? null, seller: sm?.sellerOrganization ?? null };
  }

  private assertEditable(...statuses: (string | null | undefined)[]) {
    if (statuses.some((s) => s && !EDITABLE.includes(s))) throw new ValidationApiException({ field: "status", reason: "UNDER_REVIEW_LOCKED" });
  }

  private async requireAny(userId: string) {
    const o = await this.orgs(userId);
    if (!o.provider && !o.seller) throw new ValidationApiException({ field: "onboarding", reason: "NOT_STARTED" });
    this.assertEditable(o.provider?.verificationStatus, o.seller?.verificationStatus);
    return o;
  }

  private subjectFor(o: Awaited<ReturnType<PartnerOnboardingService["orgs"]>>, which: "PROVIDER" | "SELLER") {
    const id = which === "PROVIDER" ? o.provider?.id : o.seller?.id;
    if (!id) throw new ValidationApiException({ field: "subject", reason: "NOT_PART_OF_THIS_BUSINESS" });
    return { type: which === "PROVIDER" ? PartnerSubjectType.PROVIDER : PartnerSubjectType.SELLER, id };
  }

  // ------------------------------------------------------------------ steps
  /** Step 1: what the business is. Creates (or extends) the partner's own organizations and marks the account PARTNER. */
  async start(userId: string, dto: StartPartnerOnboardingDto) {
    const kinds = [...new Set(dto.serviceKinds)];
    if (!kinds.length && !dto.shop) throw new ValidationApiException({ field: "serviceKinds", reason: "PICK_AT_LEAST_ONE" });
    const name = dto.businessName.trim();
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { signupIntent: "PARTNER" } });
      const o = await this.orgs(userId, tx);
      this.assertEditable(o.provider?.verificationStatus, o.seller?.verificationStatus);
      // A business type already started stays (its documents and data hang off it); others can be added.
      if (o.provider && !kinds.length) throw new ValidationApiException({ field: "serviceKinds", reason: "CANNOT_REMOVE_STARTED_BUSINESS" });
      if (o.seller && !dto.shop) throw new ValidationApiException({ field: "shop", reason: "CANNOT_REMOVE_STARTED_BUSINESS" });
      let providerId = o.provider?.id ?? null;
      if (kinds.length) {
        const typed = kinds as ProviderType[];
        if (o.provider) {
          await tx.providerOrganization.update({ where: { id: o.provider.id }, data: { type: typed[0], serviceKinds: typed } });
        } else {
          const created = await tx.providerOrganization.create({
            data: { name, type: typed[0]!, serviceKinds: typed, providerUsers: { create: { userId, role: ProviderUserRole.OWNER, isBookable: true } } },
          });
          providerId = created.id;
        }
      }
      let sellerId = o.seller?.id ?? null;
      if (dto.shop && !o.seller) {
        const created = await tx.sellerOrganization.create({
          data: {
            name,
            countryCode: "IR",
            status: SellerStatus.PENDING,
            businessMetadata: { source: PARTNER_ONBOARDING_SOURCE } as Prisma.InputJsonValue,
            memberships: { create: { userId, role: SellerMembershipRole.OWNER, status: SellerMembershipStatus.ACTIVE, acceptedAt: new Date() } },
          },
        });
        sellerId = created.id;
      }
      if (providerId && sellerId) await tx.providerOrganization.update({ where: { id: providerId }, data: { linkedSellerOrganizationId: sellerId } });
    });
    return this.state(userId);
  }

  logoUpload(userId: string, contentType: string, fileSizeBytes: number) {
    return this.storage.createPartnerLogoUploadTarget(userId, contentType, fileSizeBytes);
  }

  /**
   * Step 2: name, description and logo. The logo is identified by the object key this user's upload target issued
   * (never a URL from the client); the public URL is built here, so nothing external can end up on a partner page.
   */
  async business(userId: string, dto: PartnerBusinessDto) {
    const o = await this.requireAny(userId);
    const key = dto.logoObjectKey?.trim() || null;
    if (key && !logoKeyPattern(userId).test(key)) throw new ValidationApiException({ field: "logoObjectKey", reason: "NOT_ISSUED_FOR_THIS_ACCOUNT" });
    const logoUrl = key ? resolveObjectUrl(key) : null;
    const data = { name: dto.name.trim(), description: dto.description?.trim() || null, ...(logoUrl ? { logoUrl } : {}) };
    await this.prisma.$transaction(async (tx) => {
      if (o.provider) await tx.providerOrganization.update({ where: { id: o.provider.id }, data });
      if (o.seller) await tx.sellerOrganization.update({ where: { id: o.seller.id }, data });
    });
    return this.state(userId);
  }

  /** Step 3: the owner's name and the business phone, as the verification profile of each business (mobile = the account's verified mobile). */
  async owner(userId: string, dto: PartnerOwnerDto) {
    const o = await this.requireAny(userId);
    const phone = toLatinDigits(dto.phone).replace(/\s+/g, " ").trim();
    for (const which of ["PROVIDER", "SELLER"] as const) {
      if ((which === "PROVIDER" && !o.provider) || (which === "SELLER" && !o.seller)) continue;
      await this.verification.saveProfile(this.subjectFor(o, which), userId, { firstName: dto.firstName, lastName: dto.lastName, landline: phone });
    }
    await this.prisma.$transaction(async (tx) => {
      if (o.provider) await tx.providerOrganization.update({ where: { id: o.provider.id }, data: { phone } });
      if (o.seller) await tx.sellerOrganization.update({ where: { id: o.seller.id }, data: { supportContactPhone: phone } });
    });
    return this.state(userId);
  }

  /** Step 4: private KYC evidence (national ID, licences) — the same private upload/registration path as the panels. */
  async documentUpload(userId: string, which: "PROVIDER" | "SELLER", contentType: string, fileSizeBytes: number) {
    const o = await this.requireAny(userId);
    return this.verification.requestUpload(this.subjectFor(o, which), contentType, fileSizeBytes);
  }

  async registerDocument(userId: string, dto: PartnerRegisterDocumentDto) {
    const o = await this.requireAny(userId);
    await this.verification.registerDocument(this.subjectFor(o, dto.subject), userId, {
      objectKey: dto.objectKey,
      kind: dto.kind as PartnerDocumentKind,
      mimeType: dto.contentType,
      fileSizeBytes: dto.fileSizeBytes,
      expiresAt: dto.expiresAt,
    });
    return this.state(userId);
  }

  /** Step 5: postal address with province and city (+ map point): the service business's location and/or the shop's address. */
  async address(userId: string, dto: PartnerAddressDto) {
    const o = await this.requireAny(userId);
    const fields = {
      province: dto.province.trim(),
      city: dto.city.trim(),
      addressLine: dto.addressLine.trim(),
      postalCode: dto.postalCode ? toLatinDigits(dto.postalCode) : null,
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
    };
    await this.prisma.$transaction(async (tx) => {
      if (o.provider) {
        const location = o.provider.locations[0];
        const data = { addressLine: fields.addressLine, city: fields.city, region: fields.province, latitude: fields.latitude, longitude: fields.longitude, phone: o.provider.phone };
        if (location) await tx.providerLocation.update({ where: { id: location.id }, data });
        else await tx.providerLocation.create({ data: { ...data, providerOrganizationId: o.provider.id, name: o.provider.name, countryCode: "IR", timezone: "Asia/Tehran" } });
      }
      if (o.seller) await tx.sellerOrganization.update({ where: { id: o.seller.id }, data: fields });
    });
    return this.state(userId);
  }

  /** Step 6a (services): weekly working hours → availability rules of the business location. Slots come from each service's duration. */
  async calendar(userId: string, dto: PartnerCalendarDto) {
    const o = await this.requireAny(userId);
    if (!o.provider) throw new ValidationApiException({ field: "calendar", reason: "SERVICES_ONLY" });
    const location = o.provider.locations[0];
    if (!location) throw new ValidationApiException({ field: "calendar", reason: "ADDRESS_FIRST" });
    for (const d of dto.days) if (minutesOf(d.start) >= minutesOf(d.end)) throw new ValidationApiException({ field: "days", reason: "START_BEFORE_END", dayOfWeek: d.dayOfWeek });
    await this.prisma.$transaction(async (tx) => {
      await tx.providerAvailabilityRule.deleteMany({ where: { providerOrganizationId: o.provider!.id, locationId: location.id, providerUserId: null, serviceId: null } });
      if (dto.days.length) {
        await tx.providerAvailabilityRule.createMany({
          data: dto.days.map((d) => ({ providerOrganizationId: o.provider!.id, locationId: location.id, dayOfWeek: d.dayOfWeek, startLocalTime: d.start, endLocalTime: d.end, timezone: "Asia/Tehran" })),
        });
      }
    });
    return this.state(userId);
  }

  /** Step 6b (services): each service with its price per pet, duration and how many pets per booking — saved inactive. */
  async services(userId: string, dto: PartnerServicesDto) {
    const o = await this.requireAny(userId);
    if (!o.provider) throw new ValidationApiException({ field: "services", reason: "SERVICES_ONLY" });
    const kinds = new Set<string>(o.provider.serviceKinds);
    for (const s of dto.services) if (!kinds.has(s.kind)) throw new ValidationApiException({ field: "services", reason: "KIND_NOT_SELECTED", kind: s.kind });
    const locationId = o.provider.locations[0]?.id ?? null;
    await this.prisma.$transaction(async (tx) => {
      // Before verification nothing can have been booked, so the draft list is simply replaced.
      await tx.providerService.deleteMany({ where: { providerOrganizationId: o.provider!.id, isActive: false, bookings: { none: {} } } });
      for (const s of dto.services) {
        const shape = KIND_SERVICE[s.kind];
        await tx.providerService.create({
          data: {
            providerOrganizationId: o.provider!.id,
            locationId,
            name: s.name.trim(),
            type: shape.type,
            category: shape.category,
            locationMode: shape.locationMode,
            durationMinutes: s.durationMinutes,
            priceAmount: new Prisma.Decimal(s.priceIrr),
            currency: "IRR",
            maxPetsPerBooking: s.maxPets,
            isActive: false,
          },
        });
      }
    });
    return this.state(userId);
  }

  /** Step 7a (shop): opening hours, shown on the shop page only (no booking). */
  async openingHours(userId: string, dto: PartnerCalendarDto) {
    const o = await this.requireAny(userId);
    if (!o.seller) throw new ValidationApiException({ field: "openingHours", reason: "SHOP_ONLY" });
    for (const d of dto.days) if (minutesOf(d.start) >= minutesOf(d.end)) throw new ValidationApiException({ field: "days", reason: "START_BEFORE_END", dayOfWeek: d.dayOfWeek });
    const hours = dto.days.map((d) => ({ dayOfWeek: d.dayOfWeek, open: d.start, close: d.end }));
    await this.prisma.sellerOrganization.update({ where: { id: o.seller.id }, data: { openingHours: hours as unknown as Prisma.InputJsonValue } });
    return this.state(userId);
  }

  /** Step 7b (shop): products picked from the directory with price and stock → offers, PAUSED and pending moderation. */
  async products(userId: string, dto: PartnerProductsDto) {
    const o = await this.requireAny(userId);
    if (!o.seller) throw new ValidationApiException({ field: "products", reason: "SHOP_ONLY" });
    const ids = [...new Set(dto.items.map((i) => i.productVariantId))];
    if (ids.length !== dto.items.length) throw new ValidationApiException({ field: "items", reason: "DUPLICATE_VARIANT" });
    const variants = await this.prisma.productVariant.findMany({ where: { id: { in: ids }, isActive: true, product: { status: "ACTIVE" } }, select: { id: true } });
    if (variants.length !== ids.length) throw new ValidationApiException({ field: "items", reason: "CATALOG_PRODUCT_NOT_AVAILABLE" });
    const sellerId = o.seller.id;
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.sellerOffer.findMany({ where: { sellerOrganizationId: sellerId }, select: { id: true, productVariantId: true, status: true, inventoryItem: { select: { id: true } } } });
      const byVariant = new Map(existing.map((e) => [e.productVariantId, e]));
      // Drop draft offers the partner removed from the list (never sold: the shop isn't live yet).
      const removed = existing.filter((e) => e.status === SellerOfferStatus.PAUSED && !ids.includes(e.productVariantId));
      if (removed.length) {
        await tx.inventoryItem.deleteMany({ where: { sellerOfferId: { in: removed.map((r) => r.id) } } });
        await tx.sellerOffer.deleteMany({ where: { id: { in: removed.map((r) => r.id) }, orderItems: { none: {} } } });
      }
      for (const item of dto.items) {
        const prior = byVariant.get(item.productVariantId);
        if (prior) {
          await tx.sellerOffer.update({ where: { id: prior.id }, data: { priceAmount: item.priceIrr } });
          if (prior.inventoryItem) await tx.inventoryItem.update({ where: { id: prior.inventoryItem.id }, data: { onHand: item.stock } });
          else await tx.inventoryItem.create({ data: { sellerOfferId: prior.id, onHand: item.stock, reserved: 0 } });
        } else {
          await tx.sellerOffer.create({
            data: {
              sellerOrganizationId: sellerId,
              productVariantId: item.productVariantId,
              priceAmount: item.priceIrr,
              currency: "IRR",
              status: SellerOfferStatus.PAUSED,
              moderationStatus: SellerOfferModerationStatus.PENDING_REVIEW,
              inventoryItem: { create: { onHand: item.stock, reserved: 0 } },
            },
          });
        }
      }
    });
    return this.state(userId);
  }

  /** Step 8: hand every business of this signup to KYC (the existing verification submit, per organization). */
  async submit(userId: string) {
    const o = await this.requireAny(userId);
    const missing = await this.missing(o);
    if (missing.length) throw new ValidationApiException({ field: "onboarding", reason: "STEPS_INCOMPLETE", missing });
    if (o.provider) await this.verification.submit(this.subjectFor(o, "PROVIDER"), userId);
    if (o.seller) await this.verification.submit(this.subjectFor(o, "SELLER"), userId);
    return this.state(userId);
  }

  private async missing(o: Awaited<ReturnType<PartnerOnboardingService["orgs"]>>): Promise<string[]> {
    const missing: string[] = [];
    if (o.provider) {
      if (!o.provider.locations[0]) missing.push("ADDRESS");
      const [rules, services] = await Promise.all([
        this.prisma.providerAvailabilityRule.count({ where: { providerOrganizationId: o.provider.id } }),
        this.prisma.providerService.count({ where: { providerOrganizationId: o.provider.id } }),
      ]);
      if (!rules) missing.push("CALENDAR");
      if (!services) missing.push("SERVICES");
    }
    if (o.seller) {
      if (!o.seller.addressLine || !o.seller.province) missing.push("ADDRESS");
      if (!o.seller.openingHours) missing.push("OPENING_HOURS");
    }
    return [...new Set(missing)];
  }

  // ------------------------------------------------------------------ state for the wizard
  async state(userId: string) {
    const [user, o] = await Promise.all([this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { signupIntent: true, phone: true, phoneVerifiedAt: true } }), this.orgs(userId)]);
    const subjects = [o.provider ? this.subjectFor(o, "PROVIDER") : null, o.seller ? this.subjectFor(o, "SELLER") : null].filter((s): s is { type: PartnerSubjectType; id: string } => !!s);
    const [verification, profile, services, rules, offers] = await Promise.all([
      Promise.all(subjects.map(async (s) => ({ subject: s.type, ...(await this.verification.status(s)) }))),
      subjects[0] ? this.verification.profile(subjects[0]) : Promise.resolve(null),
      o.provider ? this.prisma.providerService.findMany({ where: { providerOrganizationId: o.provider.id }, orderBy: { createdAt: "asc" } }) : Promise.resolve([]),
      o.provider ? this.prisma.providerAvailabilityRule.findMany({ where: { providerOrganizationId: o.provider.id, providerUserId: null, serviceId: null }, orderBy: [{ dayOfWeek: "asc" }] }) : Promise.resolve([]),
      o.seller
        ? this.prisma.sellerOffer.findMany({ where: { sellerOrganizationId: o.seller.id }, include: { inventoryItem: true, productVariant: { select: { id: true, title: true, product: { select: { id: true, title: true } } } } }, orderBy: { createdAt: "asc" } })
        : Promise.resolve([]),
    ]);
    const kindOf = (type: ProviderServiceType) => (Object.entries(KIND_SERVICE).find(([k, v]) => v.type === type && (o.provider?.serviceKinds as string[] | undefined)?.includes(k))?.[0] ?? null);
    const location = o.provider?.locations[0] ?? null;
    return {
      signupIntent: user.signupIntent,
      mobileVerified: !!user.phoneVerifiedAt && !!user.phone,
      started: !!(o.provider || o.seller),
      serviceKinds: (o.provider?.serviceKinds ?? []) as string[],
      shop: !!o.seller,
      linked: !!(o.provider?.linkedSellerOrganizationId && o.seller && o.provider.linkedSellerOrganizationId === o.seller.id),
      business: o.provider || o.seller ? { name: (o.provider ?? o.seller)!.name, description: (o.provider ?? o.seller)!.description, logoUrl: (o.provider ?? o.seller)!.logoUrl } : null,
      owner: profile ? { firstName: profile.firstName, lastName: profile.lastName, phone: profile.landline } : null,
      address: location
        ? { province: location.region, city: location.city, addressLine: location.addressLine, postalCode: o.seller?.postalCode ?? null, latitude: location.latitude, longitude: location.longitude }
        : o.seller?.addressLine
          ? { province: o.seller.province, city: o.seller.city, addressLine: o.seller.addressLine, postalCode: o.seller.postalCode, latitude: o.seller.latitude, longitude: o.seller.longitude }
          : null,
      calendar: rules.map((r) => ({ dayOfWeek: r.dayOfWeek, start: r.startLocalTime, end: r.endLocalTime })),
      services: services.map((s) => ({ id: s.id, kind: kindOf(s.type), name: s.name, priceIrr: s.priceAmount ? Number(s.priceAmount) : 0, durationMinutes: s.durationMinutes, maxPets: s.maxPetsPerBooking, isActive: s.isActive })),
      openingHours: (o.seller?.openingHours as { dayOfWeek: number; open: string; close: string }[] | null) ?? [],
      products: offers.map((f) => ({ offerId: f.id, productVariantId: f.productVariantId, productTitle: f.productVariant.product.title, variantTitle: f.productVariant.title, priceIrr: f.priceAmount, stock: f.inventoryItem?.onHand ?? 0, status: f.status, moderationStatus: f.moderationStatus })),
      // Documents as the verification status reports them: kind/status/dates only — never object keys or URLs.
      verification: verification.map((v) => ({ subject: v.subject, status: v.status, lifecycle: v.lifecycle, canSubmit: v.canSubmit, documents: v.documents, missingProfileFields: v.policy.missingProfileFields, missingForSubmission: v.policy.missingForSubmission })),
      missing: o.provider || o.seller ? await this.missing(o) : [],
      providerOrganizationId: o.provider?.id ?? null,
      sellerOrganizationId: o.seller?.id ?? null,
      submitted: [o.provider?.verificationStatus, o.seller?.verificationStatus].some((s) => s && !EDITABLE.includes(s)),
      verified: [o.provider?.verificationStatus, o.seller?.verificationStatus].filter(Boolean).every((s) => s === ProviderVerificationStatus.VERIFIED) && !!(o.provider || o.seller),
    };
  }
}
