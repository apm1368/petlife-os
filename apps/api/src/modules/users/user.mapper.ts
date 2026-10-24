import type { User } from "@prisma/client";
import type { UserDto } from "@petlife/types";

/** The only shape a user record ever leaves the API in — never the raw row (it carries the password hash). */
export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    phone: user.phone,
    emailVerified: Boolean(user.email && user.emailVerifiedAt),
    phoneVerified: Boolean(user.phone && user.phoneVerifiedAt),
    hasPassword: Boolean(user.passwordHash),
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    locale: user.locale as UserDto["locale"],
    themePreference: user.themePreference as UserDto["themePreference"],
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
