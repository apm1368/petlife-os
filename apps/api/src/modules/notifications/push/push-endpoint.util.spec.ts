import { deviceLabelFromUserAgent, isAllowedPushEndpoint, maskPushEndpoint } from "./push-endpoint.util";
import { pushTargetUrl, pushTestTitle, pushTitle } from "./push-payload.util";
import { classifyPushResponse } from "./web-push.service";

describe("push endpoint allowlist (no SSRF through subscriptions)", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc:APA91b",
    "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
    "https://wns2-par02p.notify.windows.com/w/?token=abc",
    "https://web.push.apple.com/QGuQyavXutnMH",
  ])("accepts the browser push service %s", (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    "http://fcm.googleapis.com/fcm/send/abc",
    "https://localhost/fcm/send",
    "https://127.0.0.1/x",
    "https://fcm.googleapis.com.evil.example/x",
    "https://evilpush.services.mozilla.com.example/x",
    "https://user:pass@fcm.googleapis.com/x",
    "https://fcm.googleapis.com:8443/x",
    "not a url",
    `https://fcm.googleapis.com/${"a".repeat(1100)}`,
  ])("refuses %s", (endpoint) => {
    expect(isAllowedPushEndpoint(endpoint)).toBe(false);
  });

  it("logs only the push service host, never the capability token", () => {
    expect(maskPushEndpoint("https://fcm.googleapis.com/fcm/send/secret-token")).toBe("fcm.googleapis.com");
  });

  it("labels a device without storing its user agent", () => {
    expect(deviceLabelFromUserAgent("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36")).toBe("Chrome · Android");
    expect(deviceLabelFromUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1")).toBe("Safari · iOS");
    expect(deviceLabelFromUserAgent("")).toBeNull();
  });
});

describe("push payload text", () => {
  it("uses a category-level title in the member's language, never the notification text", () => {
    expect(pushTitle("HEALTH", "fa")).toBe("یادآور تازهٔ مراقبت");
    expect(pushTitle("HEALTH", "de")).toBe("Neue Pflege-Erinnerung");
    expect(pushTitle("BOOKING", "es")).toBe("Novedad sobre tu cita");
    expect(pushTitle("SYSTEM", "en")).toBe("New notification on opetlife");
    expect(pushTitle(null, "nl")).toBe("New notification on opetlife");
    expect(pushTestTitle("fa")).toContain("اپت لایف");
  });

  it("opens only same-origin links, in the member's language", () => {
    expect(pushTargetUrl("https://opetlife.ir", "en", "/bookings/42")).toBe("https://opetlife.ir/en/bookings/42");
    expect(pushTargetUrl("https://opetlife.ir", "fa", null)).toBe("https://opetlife.ir/fa/notifications");
    expect(pushTargetUrl("https://opetlife.ir", "fa", "https://evil.example/x")).toBe("https://opetlife.ir/fa/notifications");
    expect(pushTargetUrl("https://opetlife.ir", "fa", "//evil.example/x")).toBe("https://opetlife.ir/fa/notifications");
    expect(pushTargetUrl("https://opetlife.ir", "de", "https://opetlife.ir/de/orders/1")).toBe("https://opetlife.ir/de/orders/1");
  });
});

describe("push service responses", () => {
  const endpoint = "https://fcm.googleapis.com/fcm/send/token";
  it("classifies every answer", () => {
    expect(classifyPushResponse(201, endpoint)).toEqual({ status: "SENT" });
    expect(classifyPushResponse(410, endpoint)).toEqual({ status: "GONE", code: "HTTP_410" });
    expect(classifyPushResponse(404, endpoint).status).toBe("GONE");
    expect(classifyPushResponse(403, endpoint).status).toBe("GONE");
    expect(classifyPushResponse(429, endpoint).status).toBe("TRANSIENT");
    expect(classifyPushResponse(503, endpoint).status).toBe("TRANSIENT");
    expect(classifyPushResponse(400, endpoint).status).toBe("PERMANENT");
    expect(JSON.stringify(classifyPushResponse(500, endpoint))).not.toContain("token");
  });
});
