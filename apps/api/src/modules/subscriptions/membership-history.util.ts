import { Prisma, SubscriptionBillingAttemptStatus, SubscriptionChangeType } from "@prisma/client";
import type { PrismaService } from "../../common/prisma/prisma.service";

type QueryClient = PrismaService | Prisma.TransactionClient;

/** The household ever paid for a membership (any successful charge: first purchase, upgrade or renewal). */
export async function householdHasPaid(client: QueryClient, householdId: string): Promise<boolean> {
  return (await client.subscriptionBillingAttempt.count({ where: { status: SubscriptionBillingAttemptStatus.SUCCEEDED, subscription: { householdId } } })) > 0;
}

/** The account ever bought or upgraded a membership itself, in any household (changes are written on success only). */
export async function userHasPaid(client: QueryClient, userId: string): Promise<boolean> {
  return (await client.subscriptionChange.count({ where: { initiatedByUserId: userId, type: { in: [SubscriptionChangeType.INITIAL_PURCHASE, SubscriptionChangeType.UPGRADE] } } })) > 0;
}
