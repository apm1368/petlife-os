-- A shipping quote is valid only for the address it priced; the address is frozen when payment starts.
ALTER TABLE "shipping_quotes" ADD COLUMN "deliveryAddressFingerprint" TEXT;
ALTER TABLE "checkouts" ADD COLUMN "deliveryAddressSnapshot" JSONB;
