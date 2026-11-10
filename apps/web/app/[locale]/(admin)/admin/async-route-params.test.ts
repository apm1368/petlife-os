import { describe, expect, it, vi } from "vitest";
import CampaignPage from "./animal-support/campaigns/[id]/page";
import RescuePage from "./animal-support/rescue-cases/[id]/page";
import InsuranceProviderPage from "./insurance/providers/[id]/page";
import InsuranceProductsPage from "./insurance/providers/[id]/products/page";
import StatementPage from "./marketplace-statements/[id]/page";

vi.mock("@/features/admin/animal-support/AdminSupportOperations", () => ({
  AdminCampaignDetail: () => null,
  AdminRescueDetail: () => null,
}));
vi.mock("@/features/admin-insurance/AdminInsuranceProviders", () => ({ AdminInsuranceProviders: () => null }));
vi.mock("@/features/admin-insurance/AdminInsuranceProducts", () => ({ AdminInsuranceProducts: () => null }));
vi.mock("@/features/admin/AdminMarketplaceStatementsView", () => ({ AdminMarketplaceStatementsView: () => null }));

describe("admin async route parameters", () => {
  it.each([
    ["campaign", CampaignPage, "id"],
    ["rescue", RescuePage, "id"],
    ["insurance provider", InsuranceProviderPage, "providerId"],
    ["insurance products", InsuranceProductsPage, "providerId"],
    ["marketplace statement", StatementPage, "statementId"],
  ] as const)("awaits the %s identifier before rendering", async (_name, Page, prop) => {
    const result = await Page({ params: Promise.resolve({ id: "qa-route-identifier" }) });
    expect(result.props).toEqual({ [prop]: "qa-route-identifier" });
  });
});
