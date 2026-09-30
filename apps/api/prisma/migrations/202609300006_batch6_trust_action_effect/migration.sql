-- Batch 6 — record each Trust & Safety action's operational effect so a RESTORE returns the subject to its exact prior state.
ALTER TABLE "trust_actions" ADD COLUMN "effectSummary" JSONB;
