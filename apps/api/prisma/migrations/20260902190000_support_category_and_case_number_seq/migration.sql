-- AlterEnum
ALTER TYPE "NotificationCategory" ADD VALUE 'SUPPORT';

-- Hand-appended (Handoff 11): a dedicated sequence backing SupportCase's
-- human-readable caseNumber ("CASE-000123") — deliberately never derived
-- from the row's own UUID id (see the SupportCase model's own doc comment
-- in schema.prisma). Prisma has no native `@@sequence` directive, so this
-- is created directly, the same way schema-level CHECK constraints
-- Prisma's DSL can't express are hand-appended in earlier migrations.
CREATE SEQUENCE IF NOT EXISTS "support_case_number_seq" START 1;
