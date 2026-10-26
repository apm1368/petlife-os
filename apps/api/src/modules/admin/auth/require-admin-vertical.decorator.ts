import { SetMetadata } from "@nestjs/common";
import type { AdminVertical } from "@prisma/client";

export const ADMIN_VERTICAL_KEY = "adminVertical";

/**
 * Marks a handler as belonging to one business vertical, so a scoped role (a SHOP_ADMIN, or a
 * SERVICE_ADMIN who runs grooming) cannot reach another vertical's rows through it. Any one of the
 * listed verticals is sufficient, mirroring RequireAdminPermission's own "any of these" shape — a
 * route that genuinely serves two verticals lists both.
 *
 * This is a second axis, not a replacement: a handler still declares the permission it needs. An
 * undecorated handler is not vertical-specific (the dashboard, the audit log) and stays reachable by
 * whichever roles its permission allows.
 */
export const RequireAdminVertical = (...verticals: AdminVertical[]) => SetMetadata(ADMIN_VERTICAL_KEY, verticals);
