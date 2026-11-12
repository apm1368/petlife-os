import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomBytes } from "node:crypto";
import { ClinicClientMessageKind, ClinicClientMessageStatus, ClinicClientSource, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { ApiException, NotFoundApiException, ValidationApiException } from "../../common/errors/api-exception";

const conflict = (details: Record<string, unknown>) => new ApiException("CLINIC_CLIENT_CONFLICT", "This clinic client change conflicts with existing data.", HttpStatus.CONFLICT, details);
import { normalizeIranianPhone } from "../../common/phone/phone-normalizer";
import { publicOrigin } from "../../common/email/email-layout";
import type { AppEnv } from "../../config/env";
import { MessagingProviderRegistry } from "../notifications/messaging/messaging-provider-registry.service";
import type { ResolvedProviderContext } from "../provider-os/auth/provider-context.types";
import { ClinicEntitlementService } from "./clinic-entitlement.service";

export type SmsMode = "LIVE" | "SANDBOX" | "OFF";
export interface ClientPetInput {
  name: string;
  species?: string;
  breed?: string;
  birthDate?: string;
  notes?: string;
}
export interface ClientInput {
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
  smsOptOut?: boolean;
  pets?: ClientPetInput[];
}

/** Anti-spam ceilings for clinic → client texts (on top of the plan's feature gate). */
const MAX_PER_CLIENT_PER_DAY = 5;
const MAX_PER_CLINIC_PER_DAY = 300;
/** Reminder texts have their own ceilings: a clinic (or one compromised staff account) cannot text one phone dozens of times. */
const MAX_REMINDERS_PER_CLIENT_PER_DAY = 3;
const MAX_REMINDERS_PER_CLINIC_PER_DAY = 500;
const MAX_BODY = 480;
const INVITE_TTL_MS = 14 * 86400e3;

/** 0912•••4567 — enough for an owner to recognise their own number on a forwarded invitation. */
function maskPhone(e164: string | null): string | null {
  if (!e164) return null;
  const national = e164.startsWith("+98") ? `0${e164.slice(3)}` : e164;
  return `${national.slice(0, 4)}•••${national.slice(-4)}`;
}

type ContactRow = Prisma.ClinicImportedContactGetPayload<{ include: { pets: true } }>;

/**
 * A clinic's own clients: owners it adds by hand (or imported from CSV) with their pets, the texts it sends them,
 * and the invitation that lets an owner connect the record to their opetlife account. Clinic-local data — the
 * clinic only ever sees its own rows, and the owner links their account only by accepting the invitation.
 *
 * Texts go out through the platform's MessagingGateway. While SMS is in sandbox they are recorded as SIMULATED and
 * the UI says so plainly; nothing claims a text was delivered when it was not.
 */
@Injectable()
export class ClinicClientsService {
  private readonly logger = new Logger(ClinicClientsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: ClinicEntitlementService,
    private readonly messaging: MessagingProviderRegistry,
    private readonly config: ConfigService<AppEnv, true>,
  ) {}

  smsMode(): SmsMode {
    const provider = this.config.get("MESSAGING_PROVIDER", { infer: true });
    const enabled = provider === "faraz" ? this.config.get("FARAZ_SMS_ENABLED", { infer: true }) : this.config.get("DEV_MESSAGING_ENABLED", { infer: true });
    if (!enabled) return "OFF";
    return provider === "faraz" && this.config.get("MESSAGING_SANDBOX_MODE", { infer: true }) === "production" ? "LIVE" : "SANDBOX";
  }

  async list(ctx: ResolvedProviderContext, q?: string) {
    await this.entitlements.assertFeature(ctx.organizationId, "clinic.customers");
    const term = q?.trim();
    const rows = await this.prisma.clinicImportedContact.findMany({
      where: {
        providerOrganizationId: ctx.organizationId,
        ...(term
          ? { OR: [{ name: { contains: term, mode: "insensitive" } }, { phone: { contains: normalizeIranianPhone(term)?.e164 ?? term } }, { petName: { contains: term, mode: "insensitive" } }, { pets: { some: { name: { contains: term, mode: "insensitive" } } } }] }
          : {}),
      },
      include: { pets: true, messages: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: [{ updatedAt: "desc" }],
      take: 300,
    });
    return { smsMode: this.smsMode(), items: rows.map((r) => ({ ...this.summary(r), lastMessageAt: r.messages[0]?.createdAt.toISOString() ?? null })) };
  }

  async get(ctx: ResolvedProviderContext, id: string) {
    const row = await this.prisma.clinicImportedContact.findFirst({
      where: { id, providerOrganizationId: ctx.organizationId },
      include: {
        pets: { orderBy: { createdAt: "asc" } },
        messages: { orderBy: { createdAt: "desc" }, take: 50 },
        reminders: { orderBy: { dueAt: "desc" }, take: 50, include: { clientPet: { select: { name: true } } } },
      },
    });
    if (!row) throw new NotFoundApiException("ClinicClient");
    return {
      ...this.summary(row),
      smsMode: this.smsMode(),
      messages: row.messages.map((m) => ({ id: m.id, kind: m.kind, body: m.body, status: m.status, failureReason: m.failureReason, createdAt: m.createdAt.toISOString() })),
      reminders: row.reminders.map((r) => ({ id: r.id, kind: r.kind, title: r.title, note: r.note, dueAt: r.dueAt.toISOString(), status: r.status, petName: r.clientPet?.name ?? null, sentAt: r.sentAt?.toISOString() ?? null })),
    };
  }

  async create(ctx: ResolvedProviderContext, input: ClientInput) {
    await this.entitlements.assertFeature(ctx.organizationId, "clinic.customers");
    const data = this.clean(input);
    if (data.phone) await this.assertPhoneFree(ctx.organizationId, data.phone);
    const row = await this.prisma.clinicImportedContact.create({
      data: {
        providerOrganizationId: ctx.organizationId,
        source: ClinicClientSource.MANUAL,
        name: data.name,
        phone: data.phone,
        email: data.email,
        notes: data.notes,
        smsOptOutAt: input.smsOptOut ? new Date() : null,
        pets: { create: (input.pets ?? []).map((p) => this.cleanPet(p)) },
      },
      include: { pets: true },
    });
    return this.summary(row);
  }

  async update(ctx: ResolvedProviderContext, id: string, input: ClientInput) {
    const current = await this.own(ctx, id);
    const data = this.clean(input);
    if (data.phone && data.phone !== current.phone) await this.assertPhoneFree(ctx.organizationId, data.phone, id);
    const row = await this.prisma.clinicImportedContact.update({
      where: { id },
      data: {
        name: data.name,
        phone: data.phone,
        email: data.email,
        notes: data.notes,
        ...(input.smsOptOut === undefined ? {} : { smsOptOutAt: input.smsOptOut ? (current.smsOptOutAt ?? new Date()) : null }),
      },
      include: { pets: true },
    });
    return this.summary(row);
  }

  async addPet(ctx: ResolvedProviderContext, id: string, pet: ClientPetInput) {
    await this.own(ctx, id);
    const count = await this.prisma.clinicClientPet.count({ where: { contactId: id } });
    if (count >= 30) throw new ValidationApiException({ field: "pets", reason: "TOO_MANY" });
    await this.prisma.clinicClientPet.create({ data: { contactId: id, ...this.cleanPet(pet) } });
    await this.prisma.clinicImportedContact.update({ where: { id }, data: { updatedAt: new Date() } });
    return this.get(ctx, id);
  }

  async removePet(ctx: ResolvedProviderContext, id: string, petId: string) {
    await this.own(ctx, id);
    const removed = await this.prisma.clinicClientPet.deleteMany({ where: { id: petId, contactId: id } });
    if (!removed.count) throw new NotFoundApiException("ClinicClientPet");
    return this.get(ctx, id);
  }

  /** A one-off text from the clinic to its client. The clinic's name always leads the message. */
  async sendMessage(ctx: ResolvedProviderContext, id: string, body: string) {
    await this.entitlements.assertFeature(ctx.organizationId, "clinic.reminders");
    const contact = await this.own(ctx, id);
    const text = body.trim();
    if (text.length < 2 || text.length > MAX_BODY) throw new ValidationApiException({ field: "body", reason: "LENGTH", max: MAX_BODY });
    if (!contact.phone) throw new ValidationApiException({ field: "phone", reason: "NO_PHONE" });
    if (contact.smsOptOutAt) throw new ValidationApiException({ field: "phone", reason: "OPTED_OUT" });
    await this.assertWithinDailyCaps(ctx.organizationId, id);
    const org = await this.prisma.providerOrganization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { name: true } });
    const message = await this.deliverText({ organizationId: ctx.organizationId, contactId: id, phone: contact.phone, kind: ClinicClientMessageKind.MESSAGE, body: `${org.name}: ${text}`, sentBy: ctx.providerUserId });
    return { message, smsMode: this.smsMode() };
  }

  /**
   * Text the client an invitation to opetlife. The link carries a single-use token; the owner connects this record to
   * their account only by opening it while signed in and accepting (MyClinicClientInvitesController).
   */
  async invite(ctx: ResolvedProviderContext, id: string, locale: "fa" | "en" = "fa") {
    await this.entitlements.assertFeature(ctx.organizationId, "clinic.customers");
    const contact = await this.own(ctx, id);
    if (contact.linkedUserId) throw conflict({ reason: "ALREADY_JOINED" });
    if (!contact.phone) throw new ValidationApiException({ field: "phone", reason: "NO_PHONE" });
    if (contact.smsOptOutAt) throw new ValidationApiException({ field: "phone", reason: "OPTED_OUT" });
    await this.assertWithinDailyCaps(ctx.organizationId, id);
    // A fresh token on every invitation: only the latest text's link works.
    const token = randomBytes(18).toString("base64url");
    await this.prisma.clinicImportedContact.update({ where: { id }, data: { inviteToken: token, invitedAt: new Date() } });
    const org = await this.prisma.providerOrganization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { name: true } });
    const link = `${publicOrigin(this.config.get("WEB_APP_ORIGIN", { infer: true }))}/${locale}/join/clinic/${token}`;
    const body =
      locale === "fa"
        ? `${org.name} شما را به اپت لایف دعوت کرده است؛ پرونده و یادآورهای پت‌تان را آنجا ببینید: ${link}`
        : `${org.name} invites you to opetlife to see your pet's records and reminders: ${link}`;
    const message = await this.deliverText({ organizationId: ctx.organizationId, contactId: id, phone: contact.phone, kind: ClinicClientMessageKind.INVITE, body, sentBy: ctx.providerUserId });
    return { message, smsMode: this.smsMode(), invitedAt: new Date().toISOString() };
  }

  /** Used by the reminder worker for clients who are not on the platform. */
  async sendReminderText(reminder: { id: string; providerOrganizationId: string; contactId: string; title: string; note: string | null; clientPetName: string | null }) {
    const contact = await this.prisma.clinicImportedContact.findUnique({ where: { id: reminder.contactId }, include: { providerOrganization: { select: { name: true } } } });
    if (!contact) return null;
    const pet = reminder.clientPetName ? ` (${reminder.clientPetName})` : "";
    const body = `${contact.providerOrganization.name}: ${reminder.title}${pet}${reminder.note ? ` — ${reminder.note}` : ""}`;
    const since = new Date(Date.now() - 86400e3);
    const [toClient, fromClinic] = await Promise.all([
      this.prisma.clinicClientMessage.count({ where: { contactId: contact.id, kind: ClinicClientMessageKind.REMINDER, createdAt: { gte: since }, status: { in: [ClinicClientMessageStatus.SENT, ClinicClientMessageStatus.SIMULATED] } } }),
      this.prisma.clinicClientMessage.count({ where: { providerOrganizationId: reminder.providerOrganizationId, kind: ClinicClientMessageKind.REMINDER, createdAt: { gte: since }, status: { in: [ClinicClientMessageStatus.SENT, ClinicClientMessageStatus.SIMULATED] } } }),
    ]);
    const skip = !contact.phone ? "NO_PHONE" : contact.smsOptOutAt ? "OPTED_OUT" : toClient >= MAX_REMINDERS_PER_CLIENT_PER_DAY || fromClinic >= MAX_REMINDERS_PER_CLINIC_PER_DAY ? "DAILY_LIMIT" : null;
    if (skip || !contact.phone) {
      return this.prisma.clinicClientMessage.create({
        data: { providerOrganizationId: reminder.providerOrganizationId, contactId: contact.id, kind: ClinicClientMessageKind.REMINDER, body, status: ClinicClientMessageStatus.SKIPPED, failureReason: skip ?? "NO_PHONE", reminderId: reminder.id },
      });
    }
    return this.deliverText({ organizationId: reminder.providerOrganizationId, contactId: contact.id, phone: contact.phone, kind: ClinicClientMessageKind.REMINDER, body, reminderId: reminder.id });
  }

  // ---- owner side ---------------------------------------------------------------------------------------------

  async previewInvite(token: string) {
    const contact = await this.prisma.clinicImportedContact.findUnique({ where: { inviteToken: token }, include: { providerOrganization: { select: { name: true } }, pets: { select: { name: true } } } });
    if (!contact || this.inviteExpired(contact.invitedAt)) throw new NotFoundApiException("ClinicInvite");
    return { clinicName: contact.providerOrganization.name, sentTo: maskPhone(contact.phone), pets: [...contact.pets.map((p) => p.name), ...(contact.petName && !contact.pets.length ? [contact.petName] : [])], joined: !!contact.linkedUserId };
  }

  async acceptInvite(userId: string, token: string) {
    const contact = await this.prisma.clinicImportedContact.findUnique({ where: { inviteToken: token }, include: { providerOrganization: { select: { name: true } } } });
    if (!contact || this.inviteExpired(contact.invitedAt)) throw new NotFoundApiException("ClinicInvite");
    if (contact.linkedUserId && contact.linkedUserId !== userId) throw conflict({ reason: "INVITE_USED" });
    // Accepting retires the link: a forwarded copy can never be used again.
    const linked = await this.prisma.clinicImportedContact.updateMany({ where: { id: contact.id, inviteToken: token, OR: [{ linkedUserId: null }, { linkedUserId: userId }] }, data: { linkedUserId: userId, joinedAt: contact.joinedAt ?? new Date(), inviteToken: null } });
    if (!linked.count) throw conflict({ reason: "INVITE_USED" });
    return { clinicName: contact.providerOrganization.name, joined: true };
  }

  /** The recipient's own opt-out, from the link at the end of every clinic text. No sign-in needed. */
  async optOutPreview(token: string) {
    const contact = await this.prisma.clinicImportedContact.findUnique({ where: { optOutToken: token }, include: { providerOrganization: { select: { name: true } } } });
    if (!contact) throw new NotFoundApiException("ClinicOptOut");
    return { clinicName: contact.providerOrganization.name, optedOut: !!contact.smsOptOutAt };
  }

  async optOut(token: string) {
    const contact = await this.prisma.clinicImportedContact.findUnique({ where: { optOutToken: token }, include: { providerOrganization: { select: { name: true } } } });
    if (!contact) throw new NotFoundApiException("ClinicOptOut");
    if (!contact.smsOptOutAt) await this.prisma.clinicImportedContact.update({ where: { id: contact.id }, data: { smsOptOutAt: new Date() } });
    return { clinicName: contact.providerOrganization.name, optedOut: true };
  }

  // ---- internals ----------------------------------------------------------------------------------------------

  private inviteExpired(invitedAt: Date | null) {
    return !invitedAt || Date.now() - invitedAt.getTime() > INVITE_TTL_MS;
  }

  /** Every clinic text ends with the recipient's own opt-out link (created on first use). */
  private async optOutSuffix(contactId: string) {
    const contact = await this.prisma.clinicImportedContact.findUniqueOrThrow({ where: { id: contactId }, select: { optOutToken: true } });
    let token = contact.optOutToken;
    if (!token) {
      token = randomBytes(9).toString("base64url");
      await this.prisma.clinicImportedContact.update({ where: { id: contactId }, data: { optOutToken: token } });
    }
    return `\nلغو: ${publicOrigin(this.config.get("WEB_APP_ORIGIN", { infer: true }))}/fa/s/${token}`;
  }

  private async deliverText(input: { organizationId: string; contactId: string; phone: string; kind: ClinicClientMessageKind; body: string; sentBy?: string; reminderId?: string }) {
    const mode = this.smsMode();
    let status: ClinicClientMessageStatus = ClinicClientMessageStatus.FAILED;
    let providerMessageId: string | null = null;
    let failureReason: string | null = null;
    if (mode === "OFF") {
      failureReason = "SMS_DISABLED";
    } else {
      try {
        const body = `${input.body}${await this.optOutSuffix(input.contactId)}`;
        const result = await this.messaging.resolveActiveSmsProvider().sendSms({ destination: input.phone, body, templateKey: `clinic.client_${input.kind.toLowerCase()}`, locale: "fa" });
        if (result.status === "SENT") {
          status = mode === "LIVE" ? ClinicClientMessageStatus.SENT : ClinicClientMessageStatus.SIMULATED;
          providerMessageId = result.providerMessageId ?? null;
        } else {
          failureReason = result.failureCode ?? result.failureKind ?? "PROVIDER_REJECTED";
        }
      } catch (e) {
        this.logger.warn(`Clinic text not sent: ${(e as Error).message}`);
        failureReason = "PROVIDER_UNAVAILABLE";
      }
    }
    const row = await this.prisma.clinicClientMessage.create({
      data: { providerOrganizationId: input.organizationId, contactId: input.contactId, kind: input.kind, body: input.body, status, providerMessageId, failureReason, sentByProviderUserId: input.sentBy ?? null, reminderId: input.reminderId ?? null },
    });
    await this.prisma.clinicImportedContact.update({ where: { id: input.contactId }, data: { updatedAt: new Date() } });
    return { id: row.id, kind: row.kind, body: row.body, status: row.status, failureReason: row.failureReason, createdAt: row.createdAt.toISOString() };
  }

  private async assertWithinDailyCaps(organizationId: string, contactId: string) {
    const since = new Date(Date.now() - 86400e3);
    const [client, clinic] = await Promise.all([
      this.prisma.clinicClientMessage.count({ where: { contactId, createdAt: { gte: since }, kind: { not: ClinicClientMessageKind.REMINDER } } }),
      this.prisma.clinicClientMessage.count({ where: { providerOrganizationId: organizationId, createdAt: { gte: since }, kind: { not: ClinicClientMessageKind.REMINDER } } }),
    ]);
    if (client >= MAX_PER_CLIENT_PER_DAY) throw new ValidationApiException({ field: "body", reason: "CLIENT_DAILY_LIMIT", max: MAX_PER_CLIENT_PER_DAY });
    if (clinic >= MAX_PER_CLINIC_PER_DAY) throw new ValidationApiException({ field: "body", reason: "CLINIC_DAILY_LIMIT", max: MAX_PER_CLINIC_PER_DAY });
  }

  private async own(ctx: ResolvedProviderContext, id: string) {
    const row = await this.prisma.clinicImportedContact.findFirst({ where: { id, providerOrganizationId: ctx.organizationId } });
    if (!row) throw new NotFoundApiException("ClinicClient");
    return row;
  }

  private async assertPhoneFree(organizationId: string, phone: string, exceptId?: string) {
    const clash = await this.prisma.clinicImportedContact.findFirst({ where: { providerOrganizationId: organizationId, phone, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
    if (clash) throw conflict({ reason: "CLIENT_EXISTS", clientId: clash.id });
  }

  private clean(input: ClientInput) {
    const name = input.name?.trim().replace(/\s+/g, " ") ?? "";
    if (name.length < 2 || name.length > 120) throw new ValidationApiException({ field: "name", reason: "LENGTH" });
    let phone: string | null = null;
    if (input.phone?.trim()) {
      const normalized = normalizeIranianPhone(input.phone);
      if (!normalized) throw new ValidationApiException({ field: "phone", reason: "INVALID_PHONE" });
      phone = normalized.e164;
    }
    const email = input.email?.trim() ? input.email.trim().toLowerCase().slice(0, 200) : null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ValidationApiException({ field: "email", reason: "INVALID_EMAIL" });
    return { name, phone, email, notes: input.notes?.trim() ? input.notes.trim().slice(0, 1000) : null };
  }

  private cleanPet(p: ClientPetInput) {
    const name = p.name?.trim() ?? "";
    if (name.length < 1 || name.length > 60) throw new ValidationApiException({ field: "pets.name", reason: "LENGTH" });
    let birthDate: Date | null = null;
    if (p.birthDate) {
      birthDate = new Date(`${p.birthDate.slice(0, 10)}T00:00:00Z`);
      if (!Number.isFinite(birthDate.getTime()) || birthDate > new Date()) throw new ValidationApiException({ field: "pets.birthDate", reason: "INVALID" });
    }
    return { name, species: p.species?.trim() || null, breed: p.breed?.trim() || null, birthDate, notes: p.notes?.trim() ? p.notes.trim().slice(0, 500) : null };
  }

  private summary(r: ContactRow) {
    const pets = r.pets.map((p) => ({ id: p.id, name: p.name, species: p.species, breed: p.breed, birthDate: p.birthDate?.toISOString().slice(0, 10) ?? null, notes: p.notes }));
    if (!pets.length && r.petName) pets.push({ id: `legacy-${r.id}`, name: r.petName, species: r.species, breed: null, birthDate: null, notes: null });
    return {
      id: r.id,
      name: r.name,
      phone: r.phone,
      email: r.email,
      notes: r.notes,
      source: r.source,
      pets,
      status: r.linkedUserId ? ("JOINED" as const) : r.invitedAt ? ("INVITED" as const) : ("CLINIC_ONLY" as const),
      invitedAt: r.invitedAt?.toISOString() ?? null,
      joinedAt: r.joinedAt?.toISOString() ?? null,
      smsOptOut: !!r.smsOptOutAt,
      createdAt: r.createdAt.toISOString(),
    };
  }
}
