import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api/client";
import { apiErrorText } from "./api-error-text";

const err = (code: string, message = "English API sentence.") => new ApiError({ code, message, requestId: "r" }, 409);

describe("apiErrorText", () => {
  it("Persian pages get a Persian sentence for the code — never the API's English", () => {
    expect(apiErrorText(err("SLOT_UNAVAILABLE"), "fa")).toBe("این زمان دیگر آزاد نیست. زمان دیگری انتخاب کنید.");
    expect(apiErrorText(err("SOMETHING_NOT_FOUND"), "fa")).toContain("پیدا نشد");
    expect(apiErrorText(err("INVALID_FOO_TRANSITION"), "fa")).toBe("این کار در وضعیت فعلی ممکن نیست.");
    expect(apiErrorText(err("UNMAPPED_CODE"), "fa", "ذخیره نشد.")).toBe("ذخیره نشد.");
  });
  it("English pages keep the API's own sentence; non-API failures use the fallback", () => {
    expect(apiErrorText(err("SLOT_UNAVAILABLE", "That time is no longer available."), "en")).toBe("That time is no longer available.");
    expect(apiErrorText(new Error("network"), "en", "Could not save.")).toBe("Could not save.");
    expect(apiErrorText(new Error("network"), "fa")).toBe("انجام نشد. دوباره تلاش کنید.");
  });
});
