import type { PrismaService } from "../prisma/prisma.service";

/**
 * Whether the user belongs to the household the pet currently lives in. A pet-access grant alone is not
 * enough for household-private facts (spending, trips, bookings): vets hold temporary grants and a pet
 * can be shared into another household's view.
 */
export async function isHouseholdMember(prisma: PrismaService, householdId: string, userId: string): Promise<boolean> {
  const member = await prisma.householdMember.findUnique({
    where: { householdId_userId: { householdId, userId } },
    select: { id: true },
  });
  return member !== null;
}
