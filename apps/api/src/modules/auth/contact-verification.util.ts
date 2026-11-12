import type { Prisma, PrismaClient, User } from "@prisma/client";

type Client = PrismaClient | Prisma.TransactionClient;
type ContactState = Pick<User, "id" | "email" | "phone" | "emailVerifiedAt" | "phoneVerifiedAt">;

/**
 * Pre-account-takeover guard, part 1. A contact typed at password sign-up (an email or a phone) is never proven.
 * When the account that holds it already belongs to someone who proved the *other* contact, the person now
 * proving this one is a different person — they must not be signed into that account. The unproven contact is
 * taken off it (it was never that account's to keep) and the caller signs the prover into an account of their own.
 * Returns whether the contact was released.
 */
export async function releaseUnprovenContact(client: Client, user: ContactState, kind: "email" | "phone"): Promise<boolean> {
  const unproven = kind === "email" ? !user.emailVerifiedAt : !user.phoneVerifiedAt;
  const otherProven = kind === "email" ? Boolean(user.phone && user.phoneVerifiedAt) : Boolean(user.email && user.emailVerifiedAt);
  if (!unproven || !otherProven) return false;
  await client.user.update({ where: { id: user.id }, data: kind === "email" ? { email: null } : { phone: null } });
  return true;
}

/**
 * Pre-account-takeover guard, part 2 — records that `user` just proved control of their email or phone (OTP code,
 * or an email Google itself verified). If someone registered with another person's contact, the real owner proving
 * it must not inherit an account a stranger still holds a password and live sessions for — so the first proof of
 * an unverified contact clears the unproven password and ends every existing session before the owner is signed
 * in. The same rule holds for email and phone. Returns whether that happened, so the caller can record it.
 */
export async function markContactVerified(client: Client, user: Pick<User, "id" | "passwordHash" | "emailVerifiedAt" | "phoneVerifiedAt">, kind: "email" | "phone"): Promise<{ clearedUnverifiedCredentials: boolean }> {
  if (kind === "email" ? user.emailVerifiedAt : user.phoneVerifiedAt) return { clearedUnverifiedCredentials: false };
  const now = new Date();
  const clear = Boolean(user.passwordHash);
  await client.user.update({ where: { id: user.id }, data: { ...(kind === "email" ? { emailVerifiedAt: now } : { phoneVerifiedAt: now }), ...(clear ? { passwordHash: null } : {}) } });
  if (clear) {
    await client.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now } });
    await client.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } });
  }
  return { clearedUnverifiedCredentials: clear };
}
