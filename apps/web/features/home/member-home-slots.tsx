import type { ComponentType } from "react";

/**
 * Named places on the member home for other owner items (2026-11-13), so each can land without reworking the page:
 *  - "offers":         #1 first-purchase gift code and "start the 7-day free trial" card (X's subscription work)
 *  - "location-nudge": #9 a gentle "pin your location" nudge for members without a pinned address
 *  - "social":         #7 the admin's social profile icons
 * Register a component here (one line) and it renders in its slot; an empty slot renders nothing. "offers" is
 * never shown for a pet in memorial mode.
 */
export type MemberHomeSlotName = "offers" | "location-nudge" | "social";

export const MEMBER_HOME_SLOTS: Partial<Record<MemberHomeSlotName, ComponentType>> = {};

export function MemberHomeSlot({ name, slots = MEMBER_HOME_SLOTS }: { name: MemberHomeSlotName; slots?: Partial<Record<MemberHomeSlotName, ComponentType>> }) {
  const Component = slots[name];
  return Component ? (
    <div className="member-home__slot" data-slot={name}>
      <Component />
    </div>
  ) : null;
}
