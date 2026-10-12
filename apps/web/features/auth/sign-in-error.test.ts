import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import fa from "@/messages/fa.json";
import en from "@/messages/en.json";
import { ApiError } from "@/lib/api/client";
import { signInErrorText } from "./sign-in-error";

const tFor = (locale: "fa" | "en") => createTranslator({ locale, messages: locale === "fa" ? fa : en, namespace: "auth" });
const rateLimited = (retryAfterSeconds: number) => new ApiError({ code: "OTP_RATE_LIMITED", message: "", details: { retryAfterSeconds }, requestId: "r" }, 429);

describe("signInErrorText", () => {
  it("states a long OTP lockout in minutes, not thousands of seconds", () => {
    expect(signInErrorText(rateLimited(2039), tFor("en") as never)).toBe("Too many attempts. Try again in about 34 min.");
    expect(signInErrorText(rateLimited(2039), tFor("fa") as never)).toBe("تلاش بیش از حد. حدود ۳۴ دقیقه دیگر دوباره امتحان کنید.");
  });

  it("keeps seconds for a short cooldown", () => {
    expect(signInErrorText(rateLimited(25), tFor("fa") as never)).toBe("تلاش بیش از حد. ۲۵ ثانیه دیگر دوباره امتحان کنید.");
  });

  it("never falls back to English on a Persian page", () => {
    expect(signInErrorText(new TypeError("Failed to fetch"), tFor("fa") as never)).toBe("مشکلی پیش آمد. لطفاً دوباره تلاش کنید.");
  });
});
