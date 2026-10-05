import { Injectable } from "@nestjs/common";
import { BookingAttachmentSide, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotFoundApiException, PetAccessDeniedException, ValidationApiException } from "../../common/errors/api-exception";
import { assertObjectKeyUnder } from "../../common/storage-keys/object-key.validator";
import { DomainEventsService } from "../../common/events/domain-events.service";
import { StorageService } from "../storage/storage.service";
import { PetAccessService } from "../pet-access/pet-access.service";
import { NotificationOrchestratorService } from "../notifications/notification-orchestrator.service";
import { NotificationDeepLinks } from "../notifications/notification-deeplink.util";
import type { ResolvedProviderContext } from "../provider-os/auth/provider-context.types";
import { type IntakeQuestion, validateIntakeAnswers, validateIntakeQuestions } from "./service-intake.util";
import type { AttachBookingFileDto, AttachmentUploadUrlDto } from "./service-intake.dto";

const MAX_ATTACHMENTS_PER_SIDE = 10;

/**
 * Versioned intake forms for provider services, and private booking attachments in both directions.
 * The owner side is authorised like the booking itself (booker, or active pet access); the provider side only for
 * the booking's own organisation. Files live under booking-attachments/<bookingId>/ and are read through
 * short-lived signed URLs.
 */
@Injectable()
export class ServiceIntakeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly access: PetAccessService,
    private readonly events: DomainEventsService,
    private readonly notifications: NotificationOrchestratorService,
  ) {}

  // ---------------------------------------------------------------- intake forms

  /** The public view: 404 for an unknown or inactive service, null when the service asks nothing. */
  async publicForm(serviceId: string) {
    if (!(await this.prisma.providerService.count({ where: { id: serviceId, isActive: true } }))) throw new NotFoundApiException("Service");
    return this.activeForm(serviceId);
  }

  async activeForm(serviceId: string) {
    const form = await this.prisma.serviceIntakeForm.findFirst({ where: { providerServiceId: serviceId, isActive: true, providerService: { isActive: true } } });
    return form ? { id: form.id, version: form.version, questions: form.questions as unknown as IntakeQuestion[] } : null;
  }

  async putForm(ctx: ResolvedProviderContext, serviceId: string, rawQuestions: unknown) {
    await this.ownService(ctx, serviceId);
    const { questions, errors } = validateIntakeQuestions(rawQuestions);
    if (!questions) throw new ValidationApiException({ field: "questions", errors });
    const form = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "provider_services" WHERE id = ${serviceId}::uuid FOR NO KEY UPDATE`;
      const last = await tx.serviceIntakeForm.findFirst({ where: { providerServiceId: serviceId }, orderBy: { version: "desc" }, select: { version: true } });
      await tx.serviceIntakeForm.updateMany({ where: { providerServiceId: serviceId, isActive: true }, data: { isActive: false } });
      return tx.serviceIntakeForm.create({ data: { providerServiceId: serviceId, version: (last?.version ?? 0) + 1, questions: questions as unknown as Prisma.InputJsonValue, createdByProviderUserId: ctx.providerUserId } });
    });
    return { id: form.id, version: form.version, questions };
  }

  async removeForm(ctx: ResolvedProviderContext, serviceId: string) {
    await this.ownService(ctx, serviceId);
    await this.prisma.serviceIntakeForm.updateMany({ where: { providerServiceId: serviceId, isActive: true }, data: { isActive: false } });
    return { active: null };
  }

  /** Used by booking confirmation: validates answers against the service's active form (if any). */
  async resolveAnswers(serviceId: string, rawAnswers: unknown): Promise<{ intakeFormId: string | null; intakeAnswers: Prisma.InputJsonValue | undefined }> {
    const form = await this.activeForm(serviceId);
    if (!form) {
      if (rawAnswers !== undefined && rawAnswers !== null && Object.keys(rawAnswers as object).length) throw new ValidationApiException({ field: "intakeAnswers", reason: "SERVICE_HAS_NO_INTAKE_FORM" });
      return { intakeFormId: null, intakeAnswers: undefined };
    }
    const { answers, errors } = validateIntakeAnswers(form.questions, rawAnswers);
    if (!answers) throw new ValidationApiException({ field: "intakeAnswers", errors, formVersion: form.version });
    return { intakeFormId: form.id, intakeAnswers: answers as Prisma.InputJsonValue };
  }

  /** The answered form as label/value pairs (owner and the booking's provider). */
  async describeIntake(intakeFormId: string | null, answers: Prisma.JsonValue | null) {
    if (!intakeFormId) return null;
    const form = await this.prisma.serviceIntakeForm.findUnique({ where: { id: intakeFormId } });
    if (!form) return null;
    const given = (answers ?? {}) as Record<string, unknown>;
    return { formVersion: form.version, answers: (form.questions as unknown as IntakeQuestion[]).map((q) => ({ key: q.key, label: q.label, type: q.type, value: given[q.key] ?? null })) };
  }

  async providerIntake(ctx: ResolvedProviderContext, bookingId: string) {
    const b = await this.providerBooking(ctx, bookingId);
    return this.describeIntake(b.intakeFormId, b.intakeAnswers);
  }

  // ---------------------------------------------------------------- attachments

  async ownerUploadUrl(userId: string, bookingId: string, dto: AttachmentUploadUrlDto) {
    await this.ownerBooking(userId, bookingId);
    return this.storage.createBookingAttachmentUploadTarget(bookingId, dto.contentType, dto.fileSizeBytes);
  }

  async ownerAttach(userId: string, bookingId: string, dto: AttachBookingFileDto) {
    await this.ownerBooking(userId, bookingId);
    return this.attach(bookingId, userId, BookingAttachmentSide.OWNER, dto);
  }

  async ownerList(userId: string, bookingId: string) {
    await this.ownerBooking(userId, bookingId);
    return this.list(bookingId);
  }

  async ownerDownload(userId: string, bookingId: string, attachmentId: string) {
    await this.ownerBooking(userId, bookingId);
    return this.download(bookingId, attachmentId);
  }

  /** The owner side can remove only files it added itself. */
  async ownerRemove(userId: string, bookingId: string, attachmentId: string) {
    await this.ownerBooking(userId, bookingId);
    const done = await this.prisma.bookingAttachment.updateMany({ where: { id: attachmentId, bookingId, side: BookingAttachmentSide.OWNER, uploadedByUserId: userId, removedAt: null }, data: { removedAt: new Date() } });
    if (!done.count) throw new NotFoundApiException("BookingAttachment");
    return this.list(bookingId);
  }

  async providerUploadUrl(ctx: ResolvedProviderContext, bookingId: string, dto: AttachmentUploadUrlDto) {
    await this.providerBooking(ctx, bookingId);
    return this.storage.createBookingAttachmentUploadTarget(bookingId, dto.contentType, dto.fileSizeBytes);
  }

  async providerAttach(ctx: ResolvedProviderContext, bookingId: string, dto: AttachBookingFileDto) {
    const b = await this.providerBooking(ctx, bookingId);
    const result = await this.attach(bookingId, ctx.userId, BookingAttachmentSide.PROVIDER, dto);
    await this.notifications.notify({ userId: b.userId, type: "booking.provider_document", category: "BOOKING", petId: b.petId, householdId: b.householdId, deepLink: NotificationDeepLinks.booking(bookingId), entityType: "Booking", entityId: bookingId, templateParams: { provider: ctx.organizationName } });
    return result;
  }

  async providerList(ctx: ResolvedProviderContext, bookingId: string) {
    await this.providerBooking(ctx, bookingId);
    return this.list(bookingId);
  }

  async providerDownload(ctx: ResolvedProviderContext, bookingId: string, attachmentId: string) {
    await this.providerBooking(ctx, bookingId);
    return this.download(bookingId, attachmentId);
  }

  // ---------------------------------------------------------------- helpers

  private async attach(bookingId: string, userId: string, side: BookingAttachmentSide, dto: AttachBookingFileDto) {
    assertObjectKeyUnder(dto.key, "booking-attachments", bookingId);
    const count = await this.prisma.bookingAttachment.count({ where: { bookingId, side, removedAt: null } });
    if (count >= MAX_ATTACHMENTS_PER_SIDE) throw new ValidationApiException({ field: "key", reason: "ATTACHMENT_LIMIT", limit: MAX_ATTACHMENTS_PER_SIDE });
    try {
      await this.prisma.bookingAttachment.create({ data: { bookingId, side, uploadedByUserId: userId, objectKey: dto.key, mimeType: dto.mimeType, sizeBytes: dto.sizeBytes, title: dto.title?.trim() || null } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new ValidationApiException({ field: "key", reason: "ALREADY_ATTACHED" });
      throw e;
    }
    await this.events.publish("BookingAttachmentAdded", { bookingId, side, actorUserId: userId }, { aggregateType: "Booking", aggregateId: bookingId });
    return this.list(bookingId);
  }

  private async list(bookingId: string) {
    const rows = await this.prisma.bookingAttachment.findMany({ where: { bookingId, removedAt: null }, orderBy: { createdAt: "asc" } });
    return rows.map((a) => ({ id: a.id, side: a.side, title: a.title, mimeType: a.mimeType, sizeBytes: a.sizeBytes, createdAt: a.createdAt.toISOString() }));
  }

  private async download(bookingId: string, attachmentId: string) {
    const a = await this.prisma.bookingAttachment.findFirst({ where: { id: attachmentId, bookingId, removedAt: null } });
    if (!a) throw new NotFoundApiException("BookingAttachment");
    return this.storage.createPrivateDownloadTarget(a.objectKey);
  }

  /** Same rule as reading the booking: the booker, or anyone with active access to its pet. Others get 404. */
  private async ownerBooking(userId: string, bookingId: string) {
    const b = await this.prisma.booking.findUnique({ where: { id: bookingId }, select: { id: true, userId: true, petId: true } });
    if (!b) throw new NotFoundApiException("Booking");
    if (b.userId !== userId && !(await this.access.hasActiveAccess(b.petId, userId))) throw new PetAccessDeniedException({ bookingId });
    return b;
  }

  private async providerBooking(ctx: ResolvedProviderContext, bookingId: string) {
    const b = await this.prisma.booking.findFirst({ where: { id: bookingId, providerOrganizationId: ctx.organizationId } });
    if (!b) throw new NotFoundApiException("Booking");
    return b;
  }

  private async ownService(ctx: ResolvedProviderContext, serviceId: string) {
    if (!(await this.prisma.providerService.count({ where: { id: serviceId, providerOrganizationId: ctx.organizationId } }))) throw new NotFoundApiException("Service");
  }
}
