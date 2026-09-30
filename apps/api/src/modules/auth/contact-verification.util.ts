import type { Prisma, PrismaClient, User } from "@prisma/client";

type Client = PrismaClient | Prisma.TransactionClient;

/**
 * Batch 8 — records that `user` just proved control of their email or phone
 * (OTP code, or an email Google itself verified).
 *
 * Pre-account-takeover guard: an email typed at password sign-up is never
 * proven. If someone registered with another person's address, the real
 * owner proving that address must not inherit an account a stranger still
 * holds a password and live sessions for — so the first proof of an
 * unverified email clears the unproven password and ends every existing
 * session before the owner is signed in. Returns whether that happened, so
 * the caller can record it.
 */
export async function markContactVerified(client: Client, user: Pick<User, "id" | "email" | "passwordHash" | "emailVerifiedAt" | "phoneVerifiedAt">, kind: "email" | "phone"): Promise<{ clearedUnverifiedCredentials: boolean }> {
  const now = new Date();
  if (kind === "phone") {
    if (!user.phoneVerifiedAt) await client.user.update({ where: { id: user.id }, data: { phoneVerifiedAt: now } });
    return { clearedUnverifiedCredentials: false };
  }
  if (user.emailVerifiedAt) return { clearedUnverifiedCredentials: false };
  const clear = Boolean(user.passwordHash);
  await client.user.update({ where: { id: user.id }, data: { emailVerifiedAt: now, ...(clear ? { passwordHash: null } : {}) } });
  if (clear) {
    await client.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now } });
    await client.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } });
  }
  return { clearedUnverifiedCredentials: clear };
}
