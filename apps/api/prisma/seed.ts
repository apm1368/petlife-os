import {
  DietType,
  HealthAreaKnowledgeState,
  HouseholdRole,
  PetSpecies,
  PrismaClient,
  ProviderServiceType,
  ProviderType,
  ProviderUserRole,
  ProviderVerificationStatus,
  SetupStatus,
  VaccinationStatus,
} from "@prisma/client";

const prisma = new PrismaClient();

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
