import type { useTranslations } from "next-intl";
import { ApiError } from "@/lib/api/client";

type AuthT = ReturnType<typeof useTranslations<"auth">>;

/** The sign-in page's message for a failed OTP/password request, in the page language. */
export function signInErrorText(err: unknown, t: AuthT): string {
  if (err instanceof ApiError) {
    if (err.code === "OTP_INVALID") return t("otp.invalid");
    if (err.code === "OTP_RATE_LIMITED") {
      const seconds = typeof err.details?.retryAfterSeconds === "number" ? err.details.retryAfterSeconds : 60;
      // Long lockouts read as minutes; "2,039 seconds" is not something a person can act on.
      return seconds > 90 ? t("otp.rateLimitedMinutes", { minutes: Math.ceil(seconds / 60) }) : t("otp.rateLimited", { seconds });
    }
    if (err.code === "INVALID_CREDENTIALS") return t("password.invalidCredentials");
    return t("welcome.googleAuthFailed");
  }
  return t("otp.genericError");
}
