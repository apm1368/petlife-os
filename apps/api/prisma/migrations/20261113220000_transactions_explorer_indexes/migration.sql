-- Admin → Transactions → Explorer: newest-first keyset pagination over ("createdAt", id) on every money table it unions.

-- CreateIndex
CREATE INDEX "payment_intents_createdAt_id_idx" ON "payment_intents"("createdAt", "id");

-- CreateIndex
CREATE INDEX "card_transfer_payments_createdAt_id_idx" ON "card_transfer_payments"("createdAt", "id");

-- CreateIndex
CREATE INDEX "wallet_top_ups_createdAt_id_idx" ON "wallet_top_ups"("createdAt", "id");

-- CreateIndex
CREATE INDEX "wallet_adjustments_createdAt_id_idx" ON "wallet_adjustments"("createdAt", "id");

-- CreateIndex
CREATE INDEX "refunds_createdAt_id_idx" ON "refunds"("createdAt", "id");
