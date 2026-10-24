import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithIntl } from "@/test/render-with-intl";
import { clinicOsService } from "@/services/clinic-os.service";
import { ClinicPlans } from "./ClinicPlans";
vi.mock("@/services/clinic-os.service", () => ({ clinicOsService: { plans: vi.fn() } }));
const plan = { code: "BASIC", nameFa: "پایه", nameEn: "Basic", descriptionFa: "", descriptionEn: "", entitlements: [{ key: "clinic.customers", type: "BOOLEAN", enabled: true, limit: null }], prices: [] };
describe("ClinicPlans", () => {
  beforeEach(() => vi.resetAllMocks());
  it("shows actual features and current plan without inventing a price or purchase action", async () => {
    vi.mocked(clinicOsService.plans).mockResolvedValue([plan]); renderWithIntl(<ClinicPlans currentCode="BASIC" />);
    await screen.findByText("Pricing has not been announced"); expect(screen.getByText("Current plan")).toBeTruthy(); expect(screen.getByText("Customer management")).toBeTruthy(); expect(screen.queryByRole("button")).toBeNull();
  });
  it("renders API prices with Persian digits and the Toman unit", async () => {
    vi.mocked(clinicOsService.plans).mockResolvedValue([{ ...plan, prices: [{ amount: 1200000, currency: "IRR", billingInterval: "MONTHLY" }] }]); renderWithIntl(<ClinicPlans />, "fa");
    await screen.findByText("۱۲۰٬۰۰۰ تومان"); expect(screen.getByText(/ماهانه/)).toBeTruthy();
  });
  it("distinguishes failure from an empty catalog and offers a real retry", async () => {
    vi.mocked(clinicOsService.plans).mockRejectedValueOnce(Error("offline")).mockResolvedValueOnce([]); renderWithIntl(<ClinicPlans />);
    await screen.findByRole("alert"); expect(screen.queryByText("There are currently no active plans to show.")).toBeNull(); fireEvent.click(screen.getByRole("button", { name: "Retry" })); await screen.findByText("There are currently no active plans to show."); expect(clinicOsService.plans).toHaveBeenCalledTimes(2);
  });
});
