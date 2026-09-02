import { hashPassword } from "../src/common/password/password-hash.util";
import {
  AdminMembershipStatus,
  AdminRole,
  DietType,
  HealthAreaKnowledgeState,
  HouseholdRole,
  InternalNoteEntityType,
  LocationMode,
  PetSpecies,
  PrismaClient,
  ProviderServiceType,
  ProviderType,
  ProviderUserRole,
  ProviderVerificationStatus,
  SellerStatus,
  SellerVerificationStatus,
  ServiceCategory,
  SetupStatus,
  SupportCaseCategory,
  SupportMessageAuthorType,
  SupportMessageVisibility,
  VaccinationStatus,
} from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Commerce Core fixtures (Handoff 06): two VERIFIED+ACTIVE sellers so every
 * variant with more than one offer proves the multi-seller cart/order split,
 * one seller still under review (never purchasable, proving the
 * verification gate), a Food product that only supports dogs and only
 * adults with a CHICKEN allergen tag (a real POTENTIAL_SAFETY_CONFLICT/
 * SPECIES_MISMATCH fixture once a test pet's own allergy or species is
 * checked against it), a kitten-only Food product (a real AGE_TOO_OLD/
 * NOT_RECOMMENDED fixture against Milo, who is already 18 months old), an
 * unrestricted Treats product (LIKELY_COMPATIBLE — nothing to actively
 * confirm), a Grooming product that requires a completed Health Basics
 * review (NEEDS_REVIEW until then), and an Accessories product old enough
 * for both Luna and Milo to be a genuine, actively-confirmed COMPATIBLE
 * example.
 */
async function seedCommerce() {
  const [royalCanin, petLifeBasics] = await Promise.all([
    prisma.brand.create({ data: { name: "Royal Canin", slug: "royal-canin" } }),
    prisma.brand.create({ data: { name: "PetLife Basics", slug: "petlife-basics" } }),
  ]);

  const [foodCategory, treatsCategory, groomingCategory, accessoriesCategory] = await Promise.all([
    prisma.productCategory.create({ data: { name: "Food", slug: "food" } }),
    prisma.productCategory.create({ data: { name: "Treats", slug: "treats" } }),
    prisma.productCategory.create({ data: { name: "Grooming", slug: "grooming" } }),
    prisma.productCategory.create({ data: { name: "Accessories", slug: "accessories" } }),
  ]);

  const [petBazaar, golestan, underReviewSeller] = await Promise.all([
    prisma.sellerOrganization.create({ data: { name: "Pet Bazaar Tehran", verificationStatus: SellerVerificationStatus.VERIFIED, status: SellerStatus.ACTIVE, countryCode: "IR", city: "Tehran" } }),
    prisma.sellerOrganization.create({ data: { name: "Golestan Pet Supplies", verificationStatus: SellerVerificationStatus.VERIFIED, status: SellerStatus.ACTIVE, countryCode: "IR", city: "Tehran" } }),
    prisma.sellerOrganization.create({ data: { name: "New Pet Shop (Under Review)", verificationStatus: SellerVerificationStatus.SUBMITTED, status: SellerStatus.ACTIVE, countryCode: "IR", city: "Tehran" } }),
  ]);

  const adultDogFood = await prisma.product.create({
    data: {
      brandId: royalCanin.id,
      categoryId: foodCategory.id,
      title: "Royal Canin Adult Dog Food",
      slug: "royal-canin-adult-dog-food",
      description: "Complete dry food for adult dogs.",
      supportsDog: true,
      supportsCat: false,
      minAgeMonths: 12,
      allergenTags: ["CHICKEN"],
      variants: {
        create: [
          { sku: "RC-ADULT-DOG-2KG", title: "2kg", weightValue: 2, weightUnit: "KG" },
          { sku: "RC-ADULT-DOG-5KG", title: "5kg", weightValue: 5, weightUnit: "KG" },
        ],
      },
    },
    include: { variants: true },
  });

  const kittenFood = await prisma.product.create({
    data: {
      brandId: royalCanin.id,
      categoryId: foodCategory.id,
      title: "Royal Canin Kitten Food",
      slug: "royal-canin-kitten-food",
      description: "Complete dry food for kittens up to 12 months.",
      supportsDog: false,
      supportsCat: true,
      maxAgeMonths: 12,
      variants: { create: [{ sku: "RC-KITTEN-CAT-2KG", title: "2kg", weightValue: 2, weightUnit: "KG" }] },
    },
    include: { variants: true },
  });

  const trainingTreats = await prisma.product.create({
    data: {
      brandId: petLifeBasics.id,
      categoryId: treatsCategory.id,
      title: "Grain-Free Training Treats",
      slug: "grain-free-training-treats",
      description: "Small, soft training treats for dogs and cats.",
      variants: { create: [{ sku: "PLB-TREATS-200G", title: "200g", weightValue: 0.2, weightUnit: "KG" }] },
    },
    include: { variants: true },
  });

  const groomingWipes = await prisma.product.create({
    data: {
      brandId: petLifeBasics.id,
      categoryId: groomingCategory.id,
      title: "Calming Grooming Wipes",
      slug: "calming-grooming-wipes",
      description: "Fragrance-light wipes for sensitive skin.",
      requiresHealthReview: true,
      variants: { create: [{ sku: "PLB-WIPES-30", title: "Pack of 30" }] },
    },
    include: { variants: true },
  });

  const travelCarrier = await prisma.product.create({
    data: {
      brandId: petLifeBasics.id,
      categoryId: accessoriesCategory.id,
      title: "Soft-Sided Travel Carrier",
      slug: "soft-sided-travel-carrier",
      description: "Ventilated carrier for car rides and vet visits.",
      minAgeMonths: 3,
      variants: { create: [{ sku: "PLB-CARRIER-M", title: "Medium" }] },
    },
    include: { variants: true },
  });

  async function createOffer(sellerId: string, variantId: string, priceAmount: number, onHand: number) {
    const offer = await prisma.sellerOffer.create({ data: { sellerOrganizationId: sellerId, productVariantId: variantId, priceAmount, currency: "IRR" } });
    await prisma.inventoryItem.create({ data: { sellerOfferId: offer.id, onHand } });
    return offer;
  }

  await Promise.all([
    createOffer(petBazaar.id, adultDogFood.variants[0]!.id, 1_200_000, 50),
    createOffer(golestan.id, adultDogFood.variants[0]!.id, 1_150_000, 30),
    createOffer(petBazaar.id, adultDogFood.variants[1]!.id, 2_800_000, 20),
    createOffer(golestan.id, kittenFood.variants[0]!.id, 1_100_000, 25),
    createOffer(petBazaar.id, trainingTreats.variants[0]!.id, 180_000, 100),
    createOffer(golestan.id, groomingWipes.variants[0]!.id, 220_000, 40),
    createOffer(petBazaar.id, travelCarrier.variants[0]!.id, 3_500_000, 15),
    createOffer(golestan.id, travelCarrier.variants[0]!.id, 3_650_000, 10),
    // Never discoverable — the seller is still under review.
    createOffer(underReviewSeller.id, trainingTreats.variants[0]!.id, 150_000, 20),
  ]);

  console.log(`Seeded commerce: sellers=[${petBazaar.id}, ${golestan.id}] products=[${adultDogFood.id}, ${kittenFood.id}, ${trainingTreats.id}, ${groomingWipes.id}, ${travelCarrier.id}]`);
}

/**
 * Handoff 04: one verified provider per non-vet ServiceCategory, each with a
 * single service and open-ended weekly availability (same "always bookable
 * today or tomorrow" rationale as the Tehran Pet Care Clinic seed above).
 * Sitting/Boarding are booked as a date range rather than a picked slot (see
 * BookingsService), so their availability rule/durationMinutes only feed the
 * discovery "next available" preview, never the actual booked range.
 */
async function seedServiceProvider(opts: {
  orgName: string;
  orgType: ProviderType;
  staffEmail: string;
  staffName: string;
  serviceName: string;
  serviceType: ProviderServiceType;
  category: ServiceCategory;
  durationMinutes: number;
  priceAmount: number;
  locationMode: LocationMode;
  requiresCareProfile?: boolean;
  supportsCat?: boolean;
}) {
  const staffUser = await prisma.user.upsert({
    where: { email: opts.staffEmail },
    update: {},
    create: { email: opts.staffEmail, displayName: opts.staffName, locale: "en" },
  });

  const organization = await prisma.providerOrganization.create({
    data: { name: opts.orgName, type: opts.orgType, verificationStatus: ProviderVerificationStatus.VERIFIED },
  });

  const location = await prisma.providerLocation.create({
    data: {
      providerOrganizationId: organization.id,
      name: `${opts.orgName} — Tehran`,
      addressLine: "1 Valiasr St.",
      city: "Tehran",
      countryCode: "IR",
      timezone: "Asia/Tehran",
    },
  });

  const staff = await prisma.providerUser.create({
    data: { userId: staffUser.id, providerOrganizationId: organization.id, role: ProviderUserRole.STAFF },
  });

  const service = await prisma.providerService.create({
    data: {
      providerOrganizationId: organization.id,
      locationId: location.id,
      name: opts.serviceName,
      type: opts.serviceType,
      category: opts.category,
      durationMinutes: opts.durationMinutes,
      priceAmount: opts.priceAmount,
      currency: "IRR",
      locationMode: opts.locationMode,
      requiresCareProfile: opts.requiresCareProfile ?? false,
      supportsCat: opts.supportsCat ?? true,
    },
  });

  await prisma.providerAvailabilityRule.createMany({
    data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      providerOrganizationId: organization.id,
      locationId: location.id,
      providerUserId: staff.id,
      dayOfWeek,
      startLocalTime: "09:00",
      endLocalTime: "18:00",
      timezone: "Asia/Tehran",
    })),
  });

  return { organization, location, staff, service };
}

/**
 * Admin CRM + Support + Disputes + Trust Operations fixtures (Handoff 11).
 * Two dedicated AdminUser identities — never Sarah's own consumer account,
 * mirroring the spec's "no implicit access through normal user session
 * alone" requirement even in seed data — plus one representative, already
 * OPEN SupportCase (with a public reply and an internal note) so a manual
 * QA session lands on real content in the Support workspace immediately,
 * without first having to create a case through the API. Both admin emails
 * sign in through the same OTP flow as any consumer account (DevOtpProvider
 * logs the code) — there is no separate admin credential system.
 */
async function seedAdmin(requesterUserId: string, requesterDisplayName: string) {
  const [rootAdminUser, supportAdminUser] = await Promise.all([
    prisma.user.upsert({ where: { email: "admin@example.com" }, update: {}, create: { email: "admin@example.com", displayName: "Root Admin", locale: "en" } }),
    prisma.user.upsert({ where: { email: "support-admin@example.com" }, update: {}, create: { email: "support-admin@example.com", displayName: "Support Agent", locale: "en" } }),
  ]);

  const [rootAdmin, supportAdmin] = await Promise.all([
    prisma.adminUser.upsert({ where: { userId: rootAdminUser.id }, update: {}, create: { userId: rootAdminUser.id, role: AdminRole.SUPER_ADMIN, status: AdminMembershipStatus.ACTIVE } }),
    prisma.adminUser.upsert({ where: { userId: supportAdminUser.id }, update: {}, create: { userId: supportAdminUser.id, role: AdminRole.SUPPORT, status: AdminMembershipStatus.ACTIVE } }),
  ]);

  const existingCase = await prisma.supportCase.findFirst({ where: { requesterUserId, caseNumber: "CASE-000001" } });
  if (!existingCase) {
    const seqRows = await prisma.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('support_case_number_seq') AS nextval`;
    const supportCase = await prisma.supportCase.create({
      data: {
        caseNumber: `CASE-${seqRows[0]!.nextval.toString().padStart(6, "0")}`,
        requesterUserId,
        subject: "Trouble booking a grooming appointment",
        description: "The booking calendar shows no available slots for the next two weeks.",
        category: SupportCaseCategory.BOOKING,
        assignedAdminId: supportAdmin.id,
        createdByAdminId: supportAdmin.id,
      },
    });
    await prisma.supportMessage.create({
      data: { caseId: supportCase.id, authorType: SupportMessageAuthorType.ADMIN, authorAdminId: supportAdmin.id, body: `Hi ${requesterDisplayName}, looking into this now.`, visibility: SupportMessageVisibility.PUBLIC },
    });
    await prisma.internalNote.create({
      data: { entityType: InternalNoteEntityType.SUPPORT_CASE, entityId: supportCase.id, authorAdminId: supportAdmin.id, body: "Looks like a slot-generation bug for this provider — escalate to engineering if not resolved by EOD." },
    });
  }

  console.log(`Seeded admin: root=${rootAdminUser.email} support=${supportAdminUser.email} (both sign in via OTP, same as any consumer account)`);
  return { rootAdmin, supportAdmin };
}

async function main() {
  const sarah = await prisma.user.upsert({
    where: { email: "sarah@example.com" },
    update: {},
    create: {
      email: "sarah@example.com",
      displayName: "Sarah",
      locale: "en",
    },
  });

  const household = await prisma.household.create({
    data: {
      name: "Sarah's Home",
      city: "Tehran",
      countryCode: "IR",
      members: { create: { userId: sarah.id, role: HouseholdRole.OWNER } },
    },
  });

  const luna = await prisma.pet.create({
    data: {
      householdId: household.id,
      name: "Luna",
      species: PetSpecies.DOG,
      breed: "Golden Retriever",
      birthDate: new Date("2022-03-15"),
      lifecycleStatus: "ACTIVE",
    },
  });

  const milo = await prisma.pet.create({
    data: {
      householdId: household.id,
      name: "Milo",
      species: PetSpecies.CAT,
      breed: "Domestic Shorthair",
      approximateAgeMonths: 18,
      lifecycleStatus: "ACTIVE",
    },
  });

  for (const pet of [luna, milo]) {
    await prisma.petAccessGrant.create({
      data: {
        petId: pet.id,
        userId: sarah.id,
        canViewIdentity: true,
        canEditIdentity: true,
        canViewHealth: true,
        canEditHealth: true,
        canBookCare: true,
        canViewCareProfile: true,
        canEditCareProfile: true,
        canViewLocation: true,
        canManageAccess: true,
        source: "HOUSEHOLD",
      },
    });
  }

  // Luna: vaccination due soon, no known allergies, a filled-in diet profile, a partially
  // filled care profile — enough Health Basics answered to demonstrate PARTIAL, not empty.
  await prisma.healthProfile.create({
    data: { petId: luna.id, allergiesOverallState: HealthAreaKnowledgeState.NONE_KNOWN, status: SetupStatus.PARTIAL },
  });
  await prisma.vaccinationSummary.create({
    data: {
      petId: luna.id,
      status: VaccinationStatus.DUE_SOON,
      nextDueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      lastKnownDate: new Date("2025-08-01"),
    },
  });
  await prisma.nutritionProfile.create({
    data: {
      petId: luna.id,
      dietType: DietType.DRY,
      currentFoodText: "Premium dry kibble, chicken formula",
      feedingFrequencyText: "Twice daily, morning and evening",
      status: SetupStatus.COMPLETE,
    },
  });
  await prisma.careProfile.create({
    data: {
      petId: luna.id,
      temperamentText: "Calm and friendly, great with children",
      feedingRoutineText: "Fed twice a day at fixed times",
      status: SetupStatus.PARTIAL,
    },
  });

  // Milo: everything still Unknown/unanswered except a single care-profile note —
  // deliberately the least-set-up pet, to exercise Unknown (not Known Negative) states.
  await prisma.healthProfile.create({
    data: { petId: milo.id, allergiesOverallState: HealthAreaKnowledgeState.UNKNOWN, status: SetupStatus.PARTIAL },
  });
  await prisma.vaccinationSummary.create({
    data: { petId: milo.id, status: VaccinationStatus.UNKNOWN },
  });
  await prisma.careProfile.create({
    data: { petId: milo.id, temperamentText: "Shy around new people", status: SetupStatus.PARTIAL },
  });

  await prisma.activePetPreference.create({
    data: { userId: sarah.id, householdId: household.id, petId: luna.id },
  });

  await prisma.onboardingProgress.create({
    data: {
      userId: sarah.id,
      householdId: household.id,
      petId: luna.id,
      chapter: "READY",
      step: "ready",
      status: "COMPLETED",
      completedSteps: ["welcome", "account", "household", "pet-identity", "personalization", "ready"],
      lastCompletedAt: new Date(),
    },
  });

  // Tehran Pet Care Clinic: a single VERIFIED provider with one vet, one
  // location, three services, and open-ended weekly availability on all
  // seven days so a slot is always bookable "today or tomorrow" regardless
  // of when this seed (or the browser E2E against it) actually runs.
  const drSaraUser = await prisma.user.upsert({
    where: { email: "dr.sara.vet@example.com" },
    update: {},
    create: { email: "dr.sara.vet@example.com", displayName: "Dr. Sara Vet", locale: "en" },
  });

  const clinic = await prisma.providerOrganization.create({
    data: {
      name: "Tehran Pet Care Clinic",
      type: ProviderType.VET_CLINIC,
      verificationStatus: ProviderVerificationStatus.VERIFIED,
      description: "General veterinary care for dogs and cats.",
      phone: "+98 21 5555 0100",
    },
  });

  const clinicLocation = await prisma.providerLocation.create({
    data: {
      providerOrganizationId: clinic.id,
      name: "Tehran Pet Care Clinic — Vanak",
      addressLine: "12 Vanak St.",
      city: "Tehran",
      countryCode: "IR",
      timezone: "Asia/Tehran",
      phone: "+98 21 5555 0100",
    },
  });

  const drSara = await prisma.providerUser.create({
    data: {
      userId: drSaraUser.id,
      providerOrganizationId: clinic.id,
      role: ProviderUserRole.VET,
      displayTitle: "DVM",
    },
  });

  const [generalVisit] = await Promise.all([
    prisma.providerService.create({
      data: {
        providerOrganizationId: clinic.id,
        locationId: clinicLocation.id,
        name: "General Vet Visit",
        type: ProviderServiceType.GENERAL_VET_VISIT,
        category: ServiceCategory.VET,
        locationMode: LocationMode.AT_PROVIDER,
        durationMinutes: 30,
        priceAmount: 450000,
        currency: "IRR",
      },
    }),
    prisma.providerService.create({
      data: {
        providerOrganizationId: clinic.id,
        locationId: clinicLocation.id,
        name: "Vaccination",
        type: ProviderServiceType.VACCINATION,
        category: ServiceCategory.VET,
        locationMode: LocationMode.AT_PROVIDER,
        durationMinutes: 20,
        priceAmount: 300000,
        currency: "IRR",
      },
    }),
    prisma.providerService.create({
      data: {
        providerOrganizationId: clinic.id,
        locationId: clinicLocation.id,
        name: "Follow-up",
        type: ProviderServiceType.FOLLOW_UP,
        category: ServiceCategory.VET,
        locationMode: LocationMode.AT_PROVIDER,
        durationMinutes: 15,
        priceAmount: 200000,
        currency: "IRR",
      },
    }),
  ]);

  await prisma.providerAvailabilityRule.createMany({
    data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      providerOrganizationId: clinic.id,
      locationId: clinicLocation.id,
      providerUserId: drSara.id,
      dayOfWeek,
      startLocalTime: "09:00",
      endLocalTime: "18:00",
      timezone: "Asia/Tehran",
    })),
  });

  console.log(
    `Seeded provider: clinic=${clinic.id} location=${clinicLocation.id} vet=${drSara.id} generalVisitService=${generalVisit.id}`,
  );

  // Handoff 05: a second ProviderUser on the same organization — front-desk
  // staff with no availability rules of their own (they don't personally
  // perform bookable services) — gives the Provider OS's team view a real
  // multi-person roster and a STAFF-vs-VET role contrast to test against.
  const receptionUser = await prisma.user.upsert({
    where: { email: "reception@example.com" },
    update: {},
    create: { email: "reception@example.com", displayName: "Reception Staff", locale: "en" },
  });
  const receptionStaff = await prisma.providerUser.create({
    data: {
      userId: receptionUser.id,
      providerOrganizationId: clinic.id,
      role: ProviderUserRole.STAFF,
      displayTitle: "Front Desk",
    },
  });
  console.log(`Seeded provider team member: clinic=${clinic.id} reception=${receptionStaff.id}`);

  // Handoff 04: one verified provider per remaining ServiceCategory.
  const groomer = await seedServiceProvider({
    orgName: "Happy Paws Grooming",
    orgType: ProviderType.GROOMER,
    staffEmail: "groomer@example.com",
    staffName: "Happy Paws Groomer",
    serviceName: "Full Groom & Bath",
    serviceType: ProviderServiceType.GROOMING_SESSION,
    category: ServiceCategory.GROOMING,
    durationMinutes: 60,
    priceAmount: 550000,
    locationMode: LocationMode.AT_PROVIDER,
  });

  const trainer = await seedServiceProvider({
    orgName: "Good Dog Training",
    orgType: ProviderType.TRAINER,
    staffEmail: "trainer@example.com",
    staffName: "Good Dog Trainer",
    serviceName: "Basic Obedience Session",
    serviceType: ProviderServiceType.TRAINING_SESSION,
    category: ServiceCategory.TRAINING,
    durationMinutes: 45,
    priceAmount: 700000,
    locationMode: LocationMode.AT_PROVIDER,
    requiresCareProfile: true,
    supportsCat: false,
  });

  const walker = await seedServiceProvider({
    orgName: "City Paws Walking",
    orgType: ProviderType.WALKER,
    staffEmail: "walker@example.com",
    staffName: "City Paws Walker",
    serviceName: "30-Minute Walk",
    serviceType: ProviderServiceType.DOG_WALK,
    category: ServiceCategory.WALKING,
    durationMinutes: 30,
    priceAmount: 250000,
    locationMode: LocationMode.AT_CUSTOMER,
    supportsCat: false,
  });

  const sitter = await seedServiceProvider({
    orgName: "Cozy Home Sitting",
    orgType: ProviderType.SITTER,
    staffEmail: "sitter@example.com",
    staffName: "Cozy Home Sitter",
    serviceName: "In-Home Pet Sitting",
    serviceType: ProviderServiceType.PET_SITTING,
    category: ServiceCategory.SITTING,
    durationMinutes: 60,
    priceAmount: 400000,
    locationMode: LocationMode.AT_CUSTOMER,
  });

  const boarding = await seedServiceProvider({
    orgName: "Tehran Pet Boarding",
    orgType: ProviderType.BOARDING,
    staffEmail: "boarding@example.com",
    staffName: "Tehran Pet Boarding Staff",
    serviceName: "Overnight Boarding",
    serviceType: ProviderServiceType.BOARDING_STAY,
    category: ServiceCategory.BOARDING,
    durationMinutes: 60,
    priceAmount: 900000,
    locationMode: LocationMode.AT_PROVIDER,
  });

  const petTaxi = await seedServiceProvider({
    orgName: "PetGo Taxi",
    orgType: ProviderType.PET_TAXI,
    staffEmail: "taxi@example.com",
    staffName: "PetGo Driver",
    serviceName: "Vet Visit Ride",
    serviceType: ProviderServiceType.PET_TAXI_RIDE,
    category: ServiceCategory.PET_TAXI,
    durationMinutes: 30,
    priceAmount: 350000,
    locationMode: LocationMode.TRANSPORT,
  });

  console.log(
    [
      `groomer=${groomer.organization.id}`,
      `trainer=${trainer.organization.id}`,
      `walker=${walker.organization.id}`,
      `sitter=${sitter.organization.id}`,
      `boarding=${boarding.organization.id}`,
      `petTaxi=${petTaxi.organization.id}`,
    ].join(" "),
  );

  console.log(`Seeded: user=${sarah.email} household=${household.id} pets=[Luna:${luna.id}, Milo:${milo.id}]`);

  await seedCommerce();
  await seedAdmin(sarah.id, sarah.displayName);
  await seedDemoAccount();
}

/**
 * Handoff 12 (Authentication) — "run locally -> log in -> immediately see
 * real product" via username/password, with zero dependency on reading an
 * OTP code out of the server log. Written idempotently (existence-checked
 * before any create), unlike Sarah's own seed above, which pre-dates this
 * handoff and is documented separately as a known issue rather than fixed
 * here — see the H12 completion report.
 */
const DEMO_USERNAME = "demo";
const DEMO_PASSWORD = "dev-only-password";

async function seedDemoAccount(): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { normalizedUsername: DEMO_USERNAME } });
  if (existing) {
    console.log(`Demo account already seeded: username=${DEMO_USERNAME} password=${DEMO_PASSWORD}`);
    return;
  }

  const demoUser = await prisma.user.create({
    data: {
      username: DEMO_USERNAME,
      normalizedUsername: DEMO_USERNAME,
      passwordHash: await hashPassword(DEMO_PASSWORD),
      displayName: "Demo User",
      locale: "en",
    },
  });

  const household = await prisma.household.create({
    data: {
      name: "Demo Household",
      city: "Tehran",
      countryCode: "IR",
      members: { create: { userId: demoUser.id, role: HouseholdRole.OWNER } },
    },
  });

  const buddy = await prisma.pet.create({
    data: {
      householdId: household.id,
      name: "Buddy",
      species: PetSpecies.DOG,
      breed: "Labrador Retriever",
      birthDate: new Date("2021-06-01"),
      lifecycleStatus: "ACTIVE",
    },
  });

  await prisma.petAccessGrant.create({
    data: {
      petId: buddy.id,
      userId: demoUser.id,
      canViewIdentity: true,
      canEditIdentity: true,
      canViewHealth: true,
      canEditHealth: true,
      canBookCare: true,
      canViewCareProfile: true,
      canEditCareProfile: true,
      canViewLocation: true,
      canManageAccess: true,
      source: "HOUSEHOLD",
    },
  });

  await prisma.activePetPreference.create({
    data: { userId: demoUser.id, householdId: household.id, petId: buddy.id },
  });

  await prisma.onboardingProgress.create({
    data: {
      userId: demoUser.id,
      householdId: household.id,
      petId: buddy.id,
      chapter: "READY",
      step: "ready",
      status: "COMPLETED",
      completedSteps: ["welcome", "account", "household", "pet-identity", "personalization", "ready"],
      lastCompletedAt: new Date(),
    },
  });

  console.log(`Seeded demo account: username=${DEMO_USERNAME} password=${DEMO_PASSWORD} household=${household.id} pet=Buddy:${buddy.id}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
