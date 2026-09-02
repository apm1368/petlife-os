import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { SessionAuthGuard } from "../../../common/auth/session-auth.guard";
import { AdminAuthGuard } from "../auth/admin-auth.guard";
import { CurrentAdmin } from "../auth/current-admin.decorator";
import type { AdminAuthedRequest, ResolvedAdminContext } from "../auth/admin-context.types";
import { InternalNoteService } from "./internal-note.service";
import { AddNoteDto } from "./dto/add-note.dto";

/**
 * The generic internal-note entry point (Customer 360's USER-scoped notes,
 * and any other entity type not already covered by a domain-specific route
 * like /admin/support/:id/notes). No @RequireAdminPermission — reachable by
 * any ACTIVE admin, consistent with notes being low-risk and always
 * audited (spec: "do not allow silent deletion without audit" implies the
 * write side itself is meant to be lightweight, not gatekept per-role).
 */
@Controller("admin/notes")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminNoteController {
  constructor(private readonly notes: InternalNoteService) {}

  @Post()
  add(@Body() dto: AddNoteDto, @CurrentAdmin() admin: ResolvedAdminContext, @Req() request: AdminAuthedRequest) {
    return this.notes.add(admin, dto.entityType, dto.entityId, dto.body, request.requestId);
  }
}
