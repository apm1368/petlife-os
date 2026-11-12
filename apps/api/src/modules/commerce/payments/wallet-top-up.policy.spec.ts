import { WalletTopUpStatus } from "@prisma/client";
import { availableTopUpRails, companyCard, isReceiptWindowOver, validTopUpAmount, walletReturnUrl, WALLET_TOP_UP_MAX_IRR, WALLET_TOP_UP_MIN_IRR } from "./wallet-top-up.policy";

const base = { PAYMENT_SANDBOX_MODE: "sandbox" as const, ZIBAL_ENABLED: true, ZIBAL_MERCHANT: undefined as string | undefined, CARD_TRANSFER_ACCOUNT_NUMBER: undefined as string | undefined, CARD_TRANSFER_ACCOUNT_HOLDER: undefined as string | undefined };

describe("wallet top-up policy", () => {
  it("never opens Zibal in sandbox mode, where verify answers paid to anything", () => {
    expect(availableTopUpRails({ ...base, ZIBAL_MERCHANT: "merchant" })).toEqual([]);
    expect(availableTopUpRails({ ...base, PAYMENT_SANDBOX_MODE: "production", ZIBAL_MERCHANT: "merchant" })).toEqual(["ZIBAL"]);
    expect(availableTopUpRails({ ...base, PAYMENT_SANDBOX_MODE: "production", ZIBAL_MERCHANT: "merchant", ZIBAL_ENABLED: false })).toEqual([]);
  });

  it("opens card to card only with a full 16-digit card and a holder", () => {
    expect(availableTopUpRails({ ...base, CARD_TRANSFER_ACCOUNT_NUMBER: "6037 9912 3456 7890", CARD_TRANSFER_ACCOUNT_HOLDER: "PET LIFE" })).toEqual(["CARD_TO_CARD"]);
    expect(availableTopUpRails({ ...base, CARD_TRANSFER_ACCOUNT_NUMBER: "12345678", CARD_TRANSFER_ACCOUNT_HOLDER: "PET LIFE" })).toEqual([]);
    expect(availableTopUpRails({ ...base, CARD_TRANSFER_ACCOUNT_NUMBER: "6037991234567890", CARD_TRANSFER_ACCOUNT_HOLDER: " " })).toEqual([]);
    expect(companyCard({ CARD_TRANSFER_ACCOUNT_NUMBER: "6037-9912-3456-7890", CARD_TRANSFER_ACCOUNT_HOLDER: "PET LIFE" })).toEqual({
      cardNumber: "6037-9912-3456-7890",
      cardNumberMasked: "••••••••••••7890",
      cardHolderName: "PET LIFE",
    });
  });

  it("accepts whole-rial amounts inside the bounds only", () => {
    expect(validTopUpAmount(WALLET_TOP_UP_MIN_IRR)).toBe(true);
    expect(validTopUpAmount(WALLET_TOP_UP_MAX_IRR)).toBe(true);
    expect(validTopUpAmount(WALLET_TOP_UP_MIN_IRR - 1)).toBe(false);
    expect(validTopUpAmount(WALLET_TOP_UP_MAX_IRR + 1)).toBe(false);
    expect(validTopUpAmount(150_000.5)).toBe(false);
  });

  it("treats an awaiting receipt past its deadline as expired", () => {
    const now = new Date("2026-11-12T10:00:00Z");
    expect(isReceiptWindowOver({ status: WalletTopUpStatus.AWAITING_RECEIPT, receiptDeadlineAt: new Date("2026-11-12T09:59:59Z") }, now)).toBe(true);
    expect(isReceiptWindowOver({ status: WalletTopUpStatus.AWAITING_RECEIPT, receiptDeadlineAt: new Date("2026-11-12T10:00:01Z") }, now)).toBe(false);
    expect(isReceiptWindowOver({ status: WalletTopUpStatus.REVIEW_PENDING, receiptDeadlineAt: new Date("2026-11-11T00:00:00Z") }, now)).toBe(false);
  });

  it("returns members to the wallet under their language prefix (member pages are prefixed in Persian too)", () => {
    expect(walletReturnUrl("https://opetlife.ir, https://www.opetlife.ir", "fa")).toBe("https://opetlife.ir/fa/profile/wallet");
    expect(walletReturnUrl("https://opetlife.ir/", "de")).toBe("https://opetlife.ir/de/profile/wallet");
    expect(walletReturnUrl("https://opetlife.ir", "xx")).toBe("https://opetlife.ir/fa/profile/wallet");
  });
});
