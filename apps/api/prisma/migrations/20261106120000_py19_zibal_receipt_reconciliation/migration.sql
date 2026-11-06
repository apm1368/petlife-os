-- PY-19: immutable verify receipts and settlement-statement evidence. No capture is inferred from a replay.
ALTER TYPE "ReconciliationCheck" ADD VALUE IF NOT EXISTS 'ZIBAL_DUPLICATE_CAPTURE';

CREATE TABLE "zibal_verify_observations" (
  "id" UUID NOT NULL,
  "zibalPaymentId" UUID NOT NULL,
  "trackId" TEXT NOT NULL,
  "refNumber" TEXT,
  "amount" INTEGER,
  "paidAt" TIMESTAMP(3),
  "resultCode" INTEGER,
  "returnedOrderId" TEXT,
  "verified" BOOLEAN NOT NULL,
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "zibal_verify_observations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "zibal_verify_observations_payment_fkey" FOREIGN KEY ("zibalPaymentId") REFERENCES "zibal_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "zibal_verify_observations_trackId_observedAt_idx" ON "zibal_verify_observations"("trackId", "observedAt");
CREATE INDEX "zibal_verify_observations_refNumber_idx" ON "zibal_verify_observations"("refNumber");

CREATE TABLE "zibal_settlement_statement_lines" (
  "id" UUID NOT NULL,
  "merchantReference" TEXT NOT NULL,
  "refNumber" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "paidAt" TIMESTAMP(3) NOT NULL,
  "importedByAdminId" UUID NOT NULL,
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "zibal_settlement_statement_lines_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "zibal_statement_merchant_ref_key" ON "zibal_settlement_statement_lines"("merchantReference", "refNumber");
CREATE INDEX "zibal_statement_merchant_amount_idx" ON "zibal_settlement_statement_lines"("merchantReference", "amount");
ALTER TABLE "zibal_settlement_statement_lines" ADD CONSTRAINT "zibal_statement_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "zibal_settlement_statement_lines" ADD CONSTRAINT "zibal_statement_importedByAdmin_fkey" FOREIGN KEY ("importedByAdminId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "admin_refund_approvals" ADD COLUMN "zibalDuplicateFindingId" UUID;
CREATE UNIQUE INDEX "admin_refund_approvals_zibalDuplicateFindingId_key" ON "admin_refund_approvals"("zibalDuplicateFindingId");
ALTER TABLE "admin_refund_approvals" ADD CONSTRAINT "admin_refund_approvals_zibalFinding_fkey" FOREIGN KEY ("zibalDuplicateFindingId") REFERENCES "finance_reconciliation_findings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Financial evidence tables are append-only, enforced below the ORM so raw SQL or future code cannot replace evidence.
CREATE FUNCTION "reject_financial_evidence_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'financial evidence is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "zibal_verify_observations_append_only" BEFORE UPDATE OR DELETE ON "zibal_verify_observations"
  FOR EACH ROW EXECUTE FUNCTION "reject_financial_evidence_mutation"();
CREATE TRIGGER "zibal_settlement_statement_lines_append_only" BEFORE UPDATE OR DELETE ON "zibal_settlement_statement_lines"
  FOR EACH ROW EXECUTE FUNCTION "reject_financial_evidence_mutation"();
