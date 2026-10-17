import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { verificationDetail } from "@/test/fixtures/partner-verification";
import { VerificationRequirements } from "./VerificationRequirements";
describe("VerificationRequirements", () => {
  it("distinguishes missing and pending evidence using the server's profession policy", () => {
    renderWithIntl(<VerificationRequirements policy={verificationDetail.policy} />);
    expect(screen.getByText("Valid evidence needed")).toBeTruthy(); expect(screen.getByText("Awaiting review")).toBeTruthy(); expect(screen.getByText("0 of 2 documents accepted")).toBeTruthy(); expect(screen.getByText(/No official identity or licence lookup/)).toBeTruthy();
  });
  it("does not pretend the checklist is complete when an older server omits policy", () => {
    renderWithIntl(<VerificationRequirements />); expect(screen.getByRole("status").textContent).toContain("has not supplied"); expect(screen.queryByText("Accepted and valid")).toBeNull();
  });
});
