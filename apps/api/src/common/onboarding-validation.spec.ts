import { PetInterest } from "@petlife/types";
import { onboardingProgressSchema } from "@petlife/validation";

describe("onboarding progress validation", () => {
  const base = {
    chapter: "PERSONALIZATION" as const,
    step: "interests",
    status: "COMPLETED" as const,
  };

  it("accepts every supported interest once", () => {
    const result = onboardingProgressSchema.safeParse({
      ...base,
      interests: Object.values(PetInterest),
    });

    expect(result.success).toBe(true);
  });

  it("rejects an oversized interest list", () => {
    const result = onboardingProgressSchema.safeParse({
      ...base,
      interests: Array.from({ length: 9 }, () => PetInterest.HEALTH),
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.code).toBe("too_big");
  });

  it("rejects unknown interest values", () => {
    const result = onboardingProgressSchema.safeParse({
      ...base,
      interests: ["UNSUPPORTED"],
    });

    expect(result.success).toBe(false);
  });
});
