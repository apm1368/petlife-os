import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ProviderUserRole } from "@prisma/client";
import { SessionAuthGuard } from "../../common/auth/session-auth.guard";
import { CurrentUser } from "../../common/auth/current-user.decorator";
import type { SessionUser } from "../../common/session/session.service";
import { ProviderAuthGuard } from "../provider-os/auth/provider-auth.guard";
import { CurrentProviderContext } from "../provider-os/auth/current-provider-context.decorator";
import { RequireProviderRole } from "../provider-os/auth/require-provider-role.decorator";
import type { ResolvedProviderContext } from "../provider-os/auth/provider-context.types";
import { AdminAuthGuard } from "../admin/auth/admin-auth.guard";
import { RequireAdminPermission } from "../admin/auth/require-admin-permission.decorator";
import { CurrentAdmin } from "../admin/auth/current-admin.decorator";
import type { ResolvedAdminContext } from "../admin/auth/admin-context.types";
import { ClinicSubscriptionService } from "./clinic-subscription.service";
import { ClinicCustomersService } from "./clinic-customers.service";
import { ClinicRemindersService } from "./clinic-reminders.service";
import { ClinicFinanceService } from "./clinic-finance.service";
import { ClinicTeamService } from "./clinic-team.service";
import { AddClinicBranchDto, AddClinicStaffDto, AssignClinicPlanDto, ClinicFinanceReportQueryDto, CreateClinicReminderDto, ListClinicCustomersQueryDto, ListClinicRemindersQueryDto } from "./dto/clinic-os.dto";

/** Clinic OS endpoints for the caller's active provider organisation. Appointments and medical records reuse /provider/bookings and /provider/clinical. */
@Controller("provider/clinic")
@UseGuards(SessionAuthGuard, ProviderAuthGuard)
export class ClinicOsController {
  constructor(
    private readonly subscriptions: ClinicSubscriptionService,
    private readonly customers: ClinicCustomersService,
    private readonly reminders: ClinicRemindersService,
    private readonly finance: ClinicFinanceService,
    private readonly team: ClinicTeamService,
  ) {}

  @Get("plans")
  plans() {
    return this.subscriptions.catalog();
  }

  @Get("staff")
  listStaff(@CurrentProviderContext() ctx: ResolvedProviderContext) {
    return this.team.listStaff(ctx);
  }

  /**
   * Owner-only: invites an existing account (PENDING; the invitee accepts or declines). A pending invitation
   * holds a seat under `clinic.staff.max`. Same path as before — it no longer creates membership directly.
   */
  @Post("staff")
  @RequireProviderRole(ProviderUserRole.OWNER)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  inviteStaff(@CurrentProviderContext() ctx: ResolvedProviderContext, @Body() dto: AddClinicStaffDto) {
    return this.team.invite(ctx, dto);
  }

  @Post("staff/invitations/:invitationId/revoke")
  @RequireProviderRole(ProviderUserRole.OWNER)
  revokeInvitation(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("invitationId", ParseUUIDPipe) invitationId: string) {
    return this.team.revokeInvitation(ctx, invitationId);
  }

  /** Owner-only soft removal of a VET/STAFF member (owners are not removable). */
  @Delete("staff/:providerUserId")
  @RequireProviderRole(ProviderUserRole.OWNER)
  removeStaff(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("providerUserId", ParseUUIDPipe) providerUserId: string) {
    return this.team.removeMember(ctx, providerUserId);
  }

  @Get("branches")
  listBranches(@CurrentProviderContext() ctx: ResolvedProviderContext) {
    return this.team.listBranches(ctx);
  }

  /** Owner-only; limited by `clinic.branches.max`. */
  @Post("branches")
  @RequireProviderRole(ProviderUserRole.OWNER)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  addBranch(@CurrentProviderContext() ctx: ResolvedProviderContext, @Body() dto: AddClinicBranchDto) {
    return this.team.addBranch(ctx, dto);
  }

  /** Owner-only; refused while the branch is the last one or anything operational still points at it. */
  @Delete("branches/:locationId")
  @RequireProviderRole(ProviderUserRole.OWNER)
  removeBranch(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("locationId", ParseUUIDPipe) locationId: string) {
    return this.team.removeBranch(ctx, locationId);
  }

  @Get("subscription")
  subscription(@CurrentProviderContext() ctx: ResolvedProviderContext) {
    return this.subscriptions.current(ctx.organizationId);
  }

  @Get("customers")
  listCustomers(@CurrentProviderContext() ctx: ResolvedProviderContext, @Query() query: ListClinicCustomersQueryDto) {
    return this.customers.list(ctx, query);
  }

  @Get("customers/:householdId")
  getCustomer(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("householdId", ParseUUIDPipe) householdId: string) {
    return this.customers.get(ctx, householdId);
  }

  @Get("reminders")
  listReminders(@CurrentProviderContext() ctx: ResolvedProviderContext, @Query() query: ListClinicRemindersQueryDto) {
    return this.reminders.list(ctx, query);
  }

  @Post("reminders")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  createReminder(@CurrentProviderContext() ctx: ResolvedProviderContext, @Body() dto: CreateClinicReminderDto) {
    return this.reminders.create(ctx, dto);
  }

  @Post("reminders/:id/cancel")
  cancelReminder(@CurrentProviderContext() ctx: ResolvedProviderContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.reminders.cancel(ctx, id);
  }

  /** Money is owner-only: VET and STAFF members get PROVIDER_ACCESS_DENIED. */
  @Get("reports/finance")
  @RequireProviderRole(ProviderUserRole.OWNER)
  financeReport(@CurrentProviderContext() ctx: ResolvedProviderContext, @Query() query: ClinicFinanceReportQueryDto) {
    return this.finance.report(ctx, query);
  }
}

@Controller("admin/clinic-subscriptions")
@UseGuards(SessionAuthGuard, AdminAuthGuard)
export class AdminClinicSubscriptionController {
  constructor(private readonly subscriptions: ClinicSubscriptionService) {}

  @Get("plans")
  @RequireAdminPermission("subscription.view")
  plans() {
    return this.subscriptions.catalog();
  }

  @Get(":organizationId")
  @RequireAdminPermission("subscription.view")
  get(@Param("organizationId", ParseUUIDPipe) organizationId: string) {
    return this.subscriptions.adminGet(organizationId);
  }

  @Post(":organizationId/assign")
  @RequireAdminPermission("subscription.manage")
  assign(@Param("organizationId", ParseUUIDPipe) organizationId: string, @Body() dto: AssignClinicPlanDto, @CurrentAdmin() admin: ResolvedAdminContext) {
    return this.subscriptions.adminAssign(admin, organizationId, dto);
  }
}

/** The invitee's side of clinic invitations — only ever their own (anyone else's is the same 404). */
@Controller("me/clinic-invitations")
@UseGuards(SessionAuthGuard)
export class MyClinicInvitationsController {
  constructor(private readonly team: ClinicTeamService) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.team.myInvitations(user.id);
  }

  @Post(":invitationId/accept")
  accept(@CurrentUser() user: SessionUser, @Param("invitationId", ParseUUIDPipe) invitationId: string) {
    return this.team.accept(user.id, invitationId);
  }

  @Post(":invitationId/decline")
  decline(@CurrentUser() user: SessionUser, @Param("invitationId", ParseUUIDPipe) invitationId: string) {
    return this.team.decline(user.id, invitationId);
  }
}
