import { ApiException } from "../../../common/errors/api-exception";
import { PushSubscriptionService, MAX_PUSH_SUBSCRIPTIONS_PER_USER } from "./push-subscription.service";

const ENDPOINT = "https://fcm.googleapis.com/fcm/send/device-token";
const KEYS = { p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", auth: "BTBZMqHH6r4Tts7J_aSIgg" };

function setup(existing: { userId: string; p256dh: string; auth: string } | null) {
  const row = { id: "row-1", userId: "me", endpoint: ENDPOINT, ...KEYS, deviceLabel: null, createdAt: new Date(), lastSuccessAt: null };
  const prisma = {
    pushSubscription: {
      findUnique: jest.fn().mockResolvedValue(existing),
      upsert: jest.fn().mockResolvedValue(row),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };
  const webPush = { isConfigured: () => true };
  const config = { get: () => "https://opetlife.ir" };
  const service = new PushSubscriptionService(prisma as never, webPush as never, config as never);
  return { service, prisma };
}

describe("PushSubscriptionService.subscribe", () => {
  it("registers a new device for the caller and keeps at most the newest devices", async () => {
    const { service, prisma } = setup(null);
    await expect(service.subscribe("me", { endpoint: ENDPOINT, keys: KEYS }, "Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile")).resolves.toMatchObject({ id: "row-1" });
    expect(prisma.pushSubscription.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { endpoint: ENDPOINT }, create: expect.objectContaining({ userId: "me", deviceLabel: "Chrome · Android" }) }));
    expect(prisma.pushSubscription.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "me" }, skip: MAX_PUSH_SUBSCRIPTIONS_PER_USER }));
  });

  it("refuses to move another member's device when only its endpoint is known", async () => {
    const { service, prisma } = setup({ userId: "someone-else", ...KEYS });
    const error = await service.subscribe("me", { endpoint: ENDPOINT, keys: { ...KEYS, auth: "AAAAAAAAAAAAAAAAAAAAAA" } }, undefined).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiException);
    expect((error as ApiException).getStatus()).toBe(409);
    expect((error as ApiException).code).toBe("PUSH_SUBSCRIPTION_CONFLICT");
    expect(prisma.pushSubscription.upsert).not.toHaveBeenCalled();
  });

  it("lets the same browser (same secret keys) move to the member now signed in", async () => {
    const { service, prisma } = setup({ userId: "someone-else", ...KEYS });
    await service.subscribe("me", { endpoint: ENDPOINT, keys: KEYS }, undefined);
    expect(prisma.pushSubscription.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ userId: "me" }) }));
  });

  it("refuses endpoints outside the browser push services", async () => {
    const { service, prisma } = setup(null);
    const error = await service.subscribe("me", { endpoint: "https://127.0.0.1/x", keys: KEYS }, undefined).catch((e: unknown) => e);
    expect((error as ApiException).getStatus()).toBe(400);
    expect(prisma.pushSubscription.upsert).not.toHaveBeenCalled();
  });
});
