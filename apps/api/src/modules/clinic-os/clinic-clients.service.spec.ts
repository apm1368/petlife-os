import { ClinicClientsService } from "./clinic-clients.service";
import type { PrismaService } from "../../common/prisma/prisma.service";
import type { ClinicEntitlementService } from "./clinic-entitlement.service";
import type { MessagingProviderRegistry } from "../notifications/messaging/messaging-provider-registry.service";
import type { ConfigService } from "@nestjs/config";
import type { ResolvedProviderContext } from "../provider-os/auth/provider-context.types";

const ctx = { organizationId: "org1", providerUserId: "pu1" } as ResolvedProviderContext;

function setup(env: Record<string, unknown> = {}, contact: Record<string, unknown> | null = null) {
  const sendSms = jest.fn().mockResolvedValue({ status: "SENT", providerMessageId: "m1" });
  const prisma = {
    clinicImportedContact: {
      findFirst: jest.fn().mockResolvedValue(contact),
      findUnique: jest.fn().mockResolvedValue(contact),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ optOutToken: "stop123" }),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "c1", ...data, pets: (data.pets?.create ?? []).map((p: object, i: number) => ({ id: `p${i}`, ...p })), linkedUserId: null, invitedAt: null, joinedAt: null, smsOptOutAt: data.smsOptOutAt ?? null, petName: null, species: null, createdAt: new Date() })),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    clinicClientMessage: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "msg1", createdAt: new Date(), ...data })),
    },
    providerOrganization: { findUniqueOrThrow: jest.fn().mockResolvedValue({ name: "Paw Clinic" }) },
  };
  const config = { get: (key: string) => ({ MESSAGING_PROVIDER: "faraz", FARAZ_SMS_ENABLED: true, DEV_MESSAGING_ENABLED: true, MESSAGING_SANDBOX_MODE: "sandbox", WEB_APP_ORIGIN: "https://opetlife.ir", ...env })[key] } as unknown as ConfigService;
  const entitlements = { assertFeature: jest.fn().mockResolvedValue(undefined) } as unknown as ClinicEntitlementService;
  const messaging = { resolveActiveSmsProvider: () => ({ sendSms }) } as unknown as MessagingProviderRegistry;
  return { prisma, sendSms, service: new ClinicClientsService(prisma as unknown as PrismaService, entitlements, messaging, config as never) };
}

const client = { id: "c1", providerOrganizationId: "org1", name: "Sara", phone: "+989121234567", smsOptOutAt: null, linkedUserId: null, inviteToken: null, joinedAt: null };

describe("ClinicClientsService", () => {
  it("adds a client with pets and a normalised mobile, and refuses a duplicate number", async () => {
    const { service, prisma } = setup();
    const created = await service.create(ctx, { name: "  Sara  ", phone: "0912 123 4567", pets: [{ name: "Milo", species: "Cat" }] });
    expect(created).toMatchObject({ name: "Sara", phone: "+989121234567", status: "CLINIC_ONLY", pets: [{ name: "Milo", species: "Cat" }] });
    prisma.clinicImportedContact.findFirst.mockResolvedValueOnce({ id: "other" });
    await expect(service.create(ctx, { name: "Sara", phone: "09121234567" })).rejects.toMatchObject({ code: "CLINIC_CLIENT_CONFLICT" });
    await expect(service.create(ctx, { name: "Sara", phone: "12345" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("records a text as SIMULATED while SMS is in sandbox, with the clinic's name first", async () => {
    const { service, sendSms } = setup({}, client);
    const result = await service.sendMessage(ctx, "c1", "Milo's vaccine is due next week");
    expect(sendSms).toHaveBeenCalledWith(expect.objectContaining({ destination: "+989121234567", body: expect.stringMatching(/^Paw Clinic: Milo's vaccine is due next week\n/) }));
    expect(result).toMatchObject({ smsMode: "SANDBOX", message: { status: "SIMULATED" } });
  });

  it("marks a text SENT only when the live provider accepted it", async () => {
    const { service } = setup({ MESSAGING_SANDBOX_MODE: "production" }, client);
    expect((await service.sendMessage(ctx, "c1", "Hello")).message.status).toBe("SENT");
  });

  it("never texts an opted-out client and respects the daily cap", async () => {
    await expect(setup({}, { ...client, smsOptOutAt: new Date() }).service.sendMessage(ctx, "c1", "Hello")).rejects.toMatchObject({ details: { reason: "OPTED_OUT" } });
    const capped = setup({}, client);
    capped.prisma.clinicClientMessage.count.mockResolvedValueOnce(5);
    await expect(capped.service.sendMessage(ctx, "c1", "Hello")).rejects.toMatchObject({ details: { reason: "CLIENT_DAILY_LIMIT" } });
  });

  it("invites with a single-use link and links the account only on acceptance by that user", async () => {
    const { service, sendSms, prisma } = setup({}, client);
    await service.invite(ctx, "c1", "fa");
    const token = prisma.clinicImportedContact.update.mock.calls[0][0].data.inviteToken as string;
    expect(token).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(sendSms.mock.calls[0][0].body).toContain(`https://opetlife.ir/fa/join/clinic/${token}`);
    prisma.clinicImportedContact.findUnique.mockResolvedValueOnce({ ...client, inviteToken: token, invitedAt: new Date(), providerOrganization: { name: "Paw Clinic" } });
    await expect(service.acceptInvite("u1", token)).resolves.toEqual({ clinicName: "Paw Clinic", joined: true });
    prisma.clinicImportedContact.findUnique.mockResolvedValueOnce({ ...client, linkedUserId: "someone-else", invitedAt: new Date(), providerOrganization: { name: "Paw Clinic" } });
    await expect(service.acceptInvite("u1", token)).rejects.toMatchObject({ code: "CLINIC_CLIENT_CONFLICT" });
  });

  it("ends every text with the recipient's own opt-out link", async () => {
    const { service, sendSms } = setup({}, client);
    await service.sendMessage(ctx, "c1", "Hello");
    expect(sendSms.mock.calls[0][0].body).toMatch(/https:\/\/opetlife\.ir\/fa\/s\/stop123$/);
  });

  it("caps reminder texts per client per day and records the rest as SKIPPED", async () => {
    const { service, prisma, sendSms } = setup({}, { ...client, providerOrganization: { name: "Paw Clinic" } });
    prisma.clinicClientMessage.count.mockResolvedValueOnce(3).mockResolvedValueOnce(3);
    await service.sendReminderText({ id: "r1", providerOrganizationId: "org1", contactId: "c1", title: "Vaccine due", note: null, clientPetName: "Milo" });
    expect(sendSms).not.toHaveBeenCalled();
    expect(prisma.clinicClientMessage.create.mock.calls[0][0].data).toMatchObject({ status: "SKIPPED", failureReason: "DAILY_LIMIT" });
  });

  it("rotates the invitation link on every send and refuses an expired one", async () => {
    const { service, prisma } = setup({}, { ...client, inviteToken: "old-token" });
    await service.invite(ctx, "c1", "en");
    expect(prisma.clinicImportedContact.update.mock.calls[0][0].data.inviteToken).not.toBe("old-token");
    prisma.clinicImportedContact.findUnique.mockResolvedValueOnce({ ...client, inviteToken: "t", invitedAt: new Date(Date.now() - 15 * 86400e3), providerOrganization: { name: "Paw Clinic" }, pets: [] });
    await expect(service.previewInvite("t")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lets the recipient opt out from the link without signing in", async () => {
    const { service, prisma } = setup({}, { ...client, optOutToken: "stop123", providerOrganization: { name: "Paw Clinic" } });
    await expect(service.optOut("stop123")).resolves.toEqual({ clinicName: "Paw Clinic", optedOut: true });
    expect(prisma.clinicImportedContact.update.mock.calls[0][0].data.smsOptOutAt).toBeInstanceOf(Date);
  });
});

