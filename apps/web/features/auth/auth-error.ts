import type { useTranslations } from "next-intl";
import { ApiError } from "@/lib/api/client";

type AuthT = ReturnType<typeof useTranslations<"auth">>;

function retryAfter(err: ApiError): number {
  return typeof err.details?.retryAfterSeconds === "number" ? err.details.retryAfterSeconds : 60;
}

/** One sentence per sign-up / sign-in / reset failure, in the page's language. */
export function authErrorMessage(err: unknown, t: AuthT): string {
  if (!(err instanceof ApiError)) return t("common.genericError");
  switch (err.code) {
    case "OTP_INVALID":
      return t("otp.invalid");
    case "OTP_RATE_LIMITED":
    case "AUTH_RATE_LIMITED":
      return t("otp.rateLimited", { seconds: retryAfter(err) });
    case "INVALID_CREDENTIALS":
      return t("password.invalidCredentials");
    case "USERNAME_TAKEN":
      return t("register.usernameTaken");
    case "PHONE_TAKEN":
      return t("common.phoneTaken");
    case "OTP_DELIVERY_FAILED":
      return t("common.smsDeliveryFailed");
    case "LOGIN_CHALLENGE_INVALID":
      return t("common.challengeExpired");
    case "VALIDATION_ERROR":
      return err.details?.field === "phone" ? t("identifier.invalidPhone") : t("common.genericError");
    default:
      return t("common.genericError");
  }
}
