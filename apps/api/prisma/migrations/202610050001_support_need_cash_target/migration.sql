-- Optional cash target for a support need (additive). Raised amounts stay ledger-derived.
ALTER TABLE "support_need_listings" ADD COLUMN IF NOT EXISTS "targetAmountIrr" INTEGER;
