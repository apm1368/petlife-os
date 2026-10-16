import { CampaignFundType } from "@prisma/client";
import { AdminDonationService } from "./admin-donation.service";
import {
  AnimalSupportOrganizationNotFoundException,
  DonationInsufficientFundBalanceException,
} from "../../common/errors/api-exception";
import type { ResolvedAdminContext } from "../admin/auth/admin-context.types";

const admin = { adminUserId: "a1" } as ResolvedAdminContext;
describe("organization payout serialization", () => {
  function setup(available = 1000, exists = true) {
    const order: string[] = [];
    const tx = {
      $queryRaw: jest.fn(async (..._query: unknown[]) => {
        order.push("lock");
        return exists ? [{ id: "o1" }] : [];
      }),
    };
    const prisma = { $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<void>) => fn(tx)) };
    const ledger = {
      getAvailableForFund: jest.fn(async () => {
        order.push("balance");
        return available;
      }),
      recordPayout: jest.fn(async () => {
        order.push("posting");
      }),
    };
    const audit = { record: jest.fn() };
    const service = new AdminDonationService(
      prisma as never,
      {} as never,
      ledger as never,
      {} as never,
      audit as never,
      {} as never,
    );
    return { order, tx, ledger, audit, service };
  }
  it("locks before checking the fund and posts only the selected fund within that transaction", async () => {
    const { service, order, ledger, tx, audit } = setup();
    await service.recordPayout(admin, "o1", {
      amountIrr: 500,
      fundType: CampaignFundType.RESTRICTED,
      reason: "Bank receipt",
    });
    expect(order).toEqual(["lock", "balance", "posting"]);
    expect((tx.$queryRaw.mock.calls[0]![0] as TemplateStringsArray).join("?")).toContain("FOR UPDATE");
    expect(ledger.getAvailableForFund).toHaveBeenCalledWith("o1", "RESTRICTED", tx);
    expect(ledger.recordPayout).toHaveBeenCalledWith("o1", expect.any(String), 500, "RESTRICTED", "IRR", tx);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ reason: "Bank receipt", tx }));
  });
  it("does not post if funds are insufficient", async () => {
    const { service, ledger, audit } = setup(100);
    await expect(
      service.recordPayout(admin, "o1", { amountIrr: 500, fundType: CampaignFundType.GENERAL }),
    ).rejects.toBeInstanceOf(DonationInsufficientFundBalanceException);
    expect(ledger.recordPayout).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
  it("does not read a balance or post for a missing organization", async () => {
    const { service, ledger } = setup(1000, false);
    await expect(
      service.recordPayout(admin, "missing", { amountIrr: 500, fundType: CampaignFundType.GENERAL }),
    ).rejects.toBeInstanceOf(AnimalSupportOrganizationNotFoundException);
    expect(ledger.getAvailableForFund).not.toHaveBeenCalled();
    expect(ledger.recordPayout).not.toHaveBeenCalled();
  });
});
