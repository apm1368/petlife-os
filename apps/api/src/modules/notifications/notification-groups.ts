import type { NotificationCategory, Prisma } from "@prisma/client";

/** The ten member-facing notification groups (plus OTHER for account/system notices). */
export const NOTIFICATION_GROUPS = ["HEALTH", "CARE", "BOOKING", "ORDER", "TRAVEL", "COMMUNITY", "SUPPORT", "CLINIC", "SUBSCRIPTION", "SECURITY", "OTHER"] as const;
export type NotificationGroup = (typeof NOTIFICATION_GROUPS)[number];

/**
 * Stored categories stay as they are; groups are a deterministic view over (category, type). Clinic and care
 * notices are recognised by type because they travel under broader categories (HEALTH, BOOKING, SYSTEM).
 */
const CATEGORY_GROUP: Record<NotificationCategory, NotificationGroup> = {
  SECURITY: "SECURITY", HEALTH: "HEALTH", BOOKING: "BOOKING", SERVICE: "BOOKING", PAYMENT: "ORDER", COMMERCE: "ORDER", DELIVERY: "ORDER",
  SELLER: "ORDER", MARKETPLACE: "ORDER", HOUSEHOLD: "OTHER", PET_ACCESS: "OTHER", SYSTEM: "OTHER", MARKETING: "OTHER", SUPPORT: "SUPPORT",
  SUBSCRIPTION: "SUBSCRIPTION", LOST_PET: "COMMUNITY", ANIMAL_SUPPORT: "SUPPORT", COMMUNITY: "COMMUNITY", TRAVEL: "TRAVEL", INSURANCE: "TRAVEL",
};
const isClinic = (type: string) => type.startsWith("clinic.");
const isCare = (type: string) => type === "health.reminder" || type.startsWith("care.") || type.startsWith("pet.care_handoff");

export function notificationGroup(category: NotificationCategory, type: string): NotificationGroup {
  if (isClinic(type)) return "CLINIC";
  if (isCare(type)) return "CARE";
  return CATEGORY_GROUP[category] ?? "OTHER";
}

/** The same mapping as a Prisma filter, for listing or marking one group read. */
export function notificationGroupWhere(group: NotificationGroup): Prisma.NotificationWhereInput {
  const clinic: Prisma.NotificationWhereInput = { type: { startsWith: "clinic." } };
  const care: Prisma.NotificationWhereInput = { OR: [{ type: "health.reminder" }, { type: { startsWith: "care." } }, { type: { startsWith: "pet.care_handoff" } }] };
  if (group === "CLINIC") return clinic;
  if (group === "CARE") return care;
  const categories = (Object.keys(CATEGORY_GROUP) as NotificationCategory[]).filter((c) => CATEGORY_GROUP[c] === group);
  return { category: { in: categories }, NOT: [clinic, care] };
}
