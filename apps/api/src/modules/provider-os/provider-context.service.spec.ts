import { ProviderUserRole, ProviderVerificationStatus } from "@prisma/client";
import { ProviderContextService } from "./provider-context.service";

const userId = "bd89a13b-e6f8-4ac9-b3c8-11e4710fa79d";
const clinicA = "4a2180bd-988d-460f-9368-6863c1af4de5";
const clinicB = "d818efa4-94be-4350-b1dc-33ea9622a850";

function membership(providerOrganizationId: string) {
  return {
    id: `member-${providerOrganizationId}`,
    userId,
    providerOrganizationId,
    role: ProviderUserRole.VET,
    displayTitle: "Veterinarian",
    providerOrganization: {
      id: providerOrganizationId,
      name: `Clinic ${providerOrganizationId.slice(0, 4)}`,
      type: "VET_CLINIC",
      verificationStatus: ProviderVerificationStatus.VERIFIED,
    },
  };
}

function setup() {
  const tx = { providerContextPreference: { upsert: jest.fn() } };
  const prisma = {
    providerUser: { findMany: jest.fn(), findFirst: jest.fn() },
    providerContextPreference: { findUnique: jest.fn() },
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  };
  const events = { publish: jest.fn() };
  return { service: new ProviderContextService(prisma as never, events as never), prisma, tx, events };
}

describe("ProviderContextService tenant boundary", () => {
  it("fails closed when a multi-organization provider has not selected a valid context", async () => {
    const { service, prisma } = setup();
    prisma.providerUser.findMany.mockResolvedValue([membership(clinicA), membership(clinicB)]);
    prisma.providerContextPreference.findUnique.mockResolvedValue(null);

    await expect(service.resolveActiveMembership(userId)).rejects.toMatchObject({
      code: "PROVIDER_ACCESS_DENIED",
      details: { reason: "AMBIGUOUS_CONTEXT" },
    });
  });

  it("does not store a provider context for an organization outside the caller membership", async () => {
    const { service, prisma, tx, events } = setup();
    prisma.providerUser.findFirst.mockResolvedValue(null);

    await expect(service.setContext(userId, clinicB)).rejects.toMatchObject({
      code: "PROVIDER_ACCESS_DENIED",
      details: { reason: "CROSS_ORGANIZATION", providerOrganizationId: clinicB },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.providerContextPreference.upsert).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it("uses the sole valid membership without consulting a mutable preference", async () => {
    const { service, prisma } = setup();
    prisma.providerUser.findMany.mockResolvedValue([membership(clinicA)]);

    await expect(service.resolveActiveMembership(userId)).resolves.toMatchObject({
      organizationId: clinicA,
      userId,
      role: ProviderUserRole.VET,
    });
    expect(prisma.providerContextPreference.findUnique).not.toHaveBeenCalled();
  });
});
