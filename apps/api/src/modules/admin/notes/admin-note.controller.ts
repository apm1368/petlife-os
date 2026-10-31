import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { RequireAdminPermission } from "../auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { AdminAuthedRequest, ResolvedAdminContext } from "../auth/admin-context.types";
import { InternalNoteService } from "./internal-note.service";
import { AddNoteDto } from "./dto/add-note.dto";

/**
 * The generic internal-note entry point (Customer 360's USER-scoped notes,
 * for USER/HOUSEHOLD/PET. Case notes such as /admin/support/:id/notes have
 * their domain-specific routes and stronger action permissions. It is
 * customer-context work today, so an active admin also needs customer.view;
 * auditability is not authorization.
 */
@Controller("admin/notes")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminNoteController {
  constructor(private readonly notes: InternalNoteService) {}

  @Post()
  @RequireAdminPermission("customer.view")
  add(@Body() dto: AddNoteDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.notes.add(admin, dto.entityType, dto.entityId, dto.body, request.requestId);
  }
}
