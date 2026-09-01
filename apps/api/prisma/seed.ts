import {
  DietType,
  HealthAreaKnowledgeState,
  HouseholdRole,
  LocationMode,
  PetSpecies,
  PrismaClient,
  ProviderServiceType,
  ProviderType,
  ProviderUserRole,
  ProviderVerificationStatus,
  ServiceCategory,
  SetupStatus,
  VaccinationStatus,
} from "@prisma/client";

const prisma = new PrismaClient();

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
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
