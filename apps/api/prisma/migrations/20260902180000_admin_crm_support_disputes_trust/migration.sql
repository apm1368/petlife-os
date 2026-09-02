-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'SUPPORT', 'TRUST_SAFETY', 'FINANCE', 'OPERATIONS', 'CONTENT', 'VERIFICATION', 'READ_ONLY');

-- CreateEnum
CREATE TYPE "AdminMembershipStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AdminPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "SupportCaseStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_ON_USER', 'WAITING_ON_INTERNAL', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SupportCaseCategory" AS ENUM ('ACCOUNT', 'PET', 'HEALTH', 'BOOKING', 'SERVICE', 'PAYMENT', 'REFUND', 'ORDER', 'DELIVERY', 'SELLER', 'PROVIDER', 'MARKETPLACE', 'TRUST_SAFETY', 'OTHER');

-- CreateEnum
CREATE TYPE "SupportMessageAuthorType" AS ENUM ('USER', 'ADMIN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "SupportMessageVisibility" AS ENUM ('PUBLIC', 'INTERNAL');

-- CreateEnum
CREATE TYPE "InternalNoteEntityType" AS ENUM ('USER', 'HOUSEHOLD', 'PET', 'SUPPORT_CASE', 'DISPUTE', 'TRUST_CASE');

-- CreateEnum
CREATE TYPE "AdminTaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DisputeSubjectType" AS ENUM ('BOOKING', 'ORDER', 'PAYMENT', 'REFUND', 'SHIPMENT', 'PROVIDER', 'SELLER');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'AWAITING_EVIDENCE', 'RESOLVED_CUSTOMER', 'RESOLVED_PROVIDER', 'RESOLVED_SELLER', 'PARTIAL_RESOLUTION', 'REJECTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "DisputeEvidenceActorType" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "TrustSubjectType" AS ENUM ('USER', 'HOUSEHOLD', 'PROVIDER', 'SELLER', 'LISTING', 'REVIEW', 'COMMUNITY_CONTENT', 'PET_INCIDENT');

-- CreateEnum
CREATE TYPE "TrustCaseSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "TrustCaseStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "TrustActionType" AS ENUM ('WARNING', 'RESTRICT', 'SUSPEND', 'REMOVE_CONTENT', 'REQUIRE_REVERIFICATION', 'RESTORE', 'NO_ACTION');

-- CreateEnum
CREATE TYPE "AppealStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'UPHELD', 'OVERTURNED', 'PARTIALLY_OVERTURNED');

-- CreateEnum
CREATE TYPE "AdminRefundApprovalStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'EXECUTED');

-- CreateTable
CREATE TABLE "admin_users" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "AdminRole" NOT NULL,
    "status" "AdminMembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastActiveAt" TIMESTAMP(3),

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_cases" (
    "id" UUID NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "requesterUserId" UUID NOT NULL,
    "householdId" UUID,
    "petId" UUID,
    "relatedEntityType" TEXT,
    "relatedEntityId" TEXT,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "SupportCaseCategory" NOT NULL,
    "priority" "AdminPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "SupportCaseStatus" NOT NULL DEFAULT 'OPEN',
    "assignedAdminId" UUID,
    "createdByAdminId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "support_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "support_messages" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "authorType" "SupportMessageAuthorType" NOT NULL,
    "authorUserId" UUID,
    "authorAdminId" UUID,
    "body" TEXT NOT NULL,
    "visibility" "SupportMessageVisibility" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "internal_notes" (
    "id" UUID NOT NULL,
    "entityType" "InternalNoteEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "authorAdminId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "internal_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_tasks" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "assigneeAdminId" UUID,
    "dueAt" TIMESTAMP(3),
    "status" "AdminTaskStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "AdminPriority" NOT NULL DEFAULT 'NORMAL',
    "relatedEntityType" TEXT,
    "relatedEntityId" TEXT,
    "createdByAdminId" UUID NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" UUID NOT NULL,
    "subjectType" "DisputeSubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "raisedByUserId" UUID,
    "supportCaseId" UUID,
    "claim" TEXT NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "assignedAdminId" UUID,
    "resolutionSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispute_evidence" (
    "id" UUID NOT NULL,
    "disputeId" UUID NOT NULL,
    "actorType" "DisputeEvidenceActorType" NOT NULL,
    "actorUserId" UUID,
    "actorAdminId" UUID,
    "statement" TEXT NOT NULL,
    "attachmentRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispute_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trust_cases" (
    "id" UUID NOT NULL,
    "subjectType" "TrustSubjectType" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "severity" "TrustCaseSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "TrustCaseStatus" NOT NULL DEFAULT 'OPEN',
    "assignedAdminId" UUID,
    "openedByAdminId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "trust_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trust_actions" (
    "id" UUID NOT NULL,
    "trustCaseId" UUID NOT NULL,
    "actionType" "TrustActionType" NOT NULL,
    "reason" TEXT NOT NULL,
    "performedByAdminId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trust_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appeals" (
    "id" UUID NOT NULL,
    "trustActionId" UUID NOT NULL,
    "appellantUserId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "AppealStatus" NOT NULL DEFAULT 'SUBMITTED',
    "resolution" TEXT,
    "reviewerAdminId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "appeals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_refund_approvals" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "status" "AdminRefundApprovalStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedByAdminId" UUID NOT NULL,
    "approvedByAdminId" UUID,
    "refundId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "executedAt" TIMESTAMP(3),

    CONSTRAINT "admin_refund_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_logs" (
    "id" UUID NOT NULL,
    "adminUserId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "reason" TEXT,
    "beforeSummary" JSONB,
    "afterSummary" JSONB,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_userId_key" ON "admin_users"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "support_cases_caseNumber_key" ON "support_cases"("caseNumber");

-- CreateIndex
CREATE INDEX "support_cases_requesterUserId_idx" ON "support_cases"("requesterUserId");

-- CreateIndex
CREATE INDEX "support_cases_status_priority_idx" ON "support_cases"("status", "priority");

-- CreateIndex
CREATE INDEX "support_cases_assignedAdminId_idx" ON "support_cases"("assignedAdminId");

-- CreateIndex
CREATE INDEX "support_messages_caseId_createdAt_idx" ON "support_messages"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "internal_notes_entityType_entityId_createdAt_idx" ON "internal_notes"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "admin_tasks_status_dueAt_idx" ON "admin_tasks"("status", "dueAt");

-- CreateIndex
CREATE INDEX "admin_tasks_assigneeAdminId_idx" ON "admin_tasks"("assigneeAdminId");

-- CreateIndex
CREATE INDEX "disputes_subjectType_subjectId_idx" ON "disputes"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "disputes_status_idx" ON "disputes"("status");

-- CreateIndex
CREATE INDEX "disputes_assignedAdminId_idx" ON "disputes"("assignedAdminId");

-- CreateIndex
CREATE INDEX "dispute_evidence_disputeId_createdAt_idx" ON "dispute_evidence"("disputeId", "createdAt");

-- CreateIndex
CREATE INDEX "trust_cases_subjectType_subjectId_idx" ON "trust_cases"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "trust_cases_status_severity_idx" ON "trust_cases"("status", "severity");

-- CreateIndex
CREATE INDEX "trust_actions_trustCaseId_idx" ON "trust_actions"("trustCaseId");

-- CreateIndex
CREATE UNIQUE INDEX "appeals_trustActionId_key" ON "appeals"("trustActionId");

-- CreateIndex
CREATE UNIQUE INDEX "admin_refund_approvals_idempotencyKey_key" ON "admin_refund_approvals"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "admin_refund_approvals_refundId_key" ON "admin_refund_approvals"("refundId");

-- CreateIndex
CREATE INDEX "admin_refund_approvals_orderId_idx" ON "admin_refund_approvals"("orderId");

-- CreateIndex
CREATE INDEX "admin_refund_approvals_status_idx" ON "admin_refund_approvals"("status");

-- CreateIndex
CREATE INDEX "admin_audit_logs_adminUserId_createdAt_idx" ON "admin_audit_logs"("adminUserId", "createdAt");

-- CreateIndex
CREATE INDEX "admin_audit_logs_entityType_entityId_idx" ON "admin_audit_logs"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_cases" ADD CONSTRAINT "support_cases_requesterUserId_fkey" FOREIGN KEY ("requesterUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_cases" ADD CONSTRAINT "support_cases_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_cases" ADD CONSTRAINT "support_cases_petId_fkey" FOREIGN KEY ("petId") REFERENCES "pets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_cases" ADD CONSTRAINT "support_cases_assignedAdminId_fkey" FOREIGN KEY ("assignedAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_cases" ADD CONSTRAINT "support_cases_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "support_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_authorAdminId_fkey" FOREIGN KEY ("authorAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "internal_notes" ADD CONSTRAINT "internal_notes_authorAdminId_fkey" FOREIGN KEY ("authorAdminId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_tasks" ADD CONSTRAINT "admin_tasks_assigneeAdminId_fkey" FOREIGN KEY ("assigneeAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_tasks" ADD CONSTRAINT "admin_tasks_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_raisedByUserId_fkey" FOREIGN KEY ("raisedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_supportCaseId_fkey" FOREIGN KEY ("supportCaseId") REFERENCES "support_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_assignedAdminId_fkey" FOREIGN KEY ("assignedAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_evidence" ADD CONSTRAINT "dispute_evidence_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "disputes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_evidence" ADD CONSTRAINT "dispute_evidence_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispute_evidence" ADD CONSTRAINT "dispute_evidence_actorAdminId_fkey" FOREIGN KEY ("actorAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trust_cases" ADD CONSTRAINT "trust_cases_assignedAdminId_fkey" FOREIGN KEY ("assignedAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trust_cases" ADD CONSTRAINT "trust_cases_openedByAdminId_fkey" FOREIGN KEY ("openedByAdminId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trust_actions" ADD CONSTRAINT "trust_actions_trustCaseId_fkey" FOREIGN KEY ("trustCaseId") REFERENCES "trust_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trust_actions" ADD CONSTRAINT "trust_actions_performedByAdminId_fkey" FOREIGN KEY ("performedByAdminId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_trustActionId_fkey" FOREIGN KEY ("trustActionId") REFERENCES "trust_actions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_appellantUserId_fkey" FOREIGN KEY ("appellantUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appeals" ADD CONSTRAINT "appeals_reviewerAdminId_fkey" FOREIGN KEY ("reviewerAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_refund_approvals" ADD CONSTRAINT "admin_refund_approvals_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_refund_approvals" ADD CONSTRAINT "admin_refund_approvals_requestedByAdminId_fkey" FOREIGN KEY ("requestedByAdminId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_refund_approvals" ADD CONSTRAINT "admin_refund_approvals_approvedByAdminId_fkey" FOREIGN KEY ("approvedByAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-appended CHECK constraints (Prisma's DSL cannot express these) —
-- mirrors the refunds_amount_positive precedent from Handoff 07's own
-- migration, plus a two-person-control invariant: a refund approval can
-- never be self-approved by the same admin who requested it (spec: "a
-- *different* admin than the requester must APPROVE"). This is a DB-level
-- backstop; AdminRefundService enforces the same rule at the application
-- layer before the row is ever written this way.
ALTER TABLE "admin_refund_approvals" ADD CONSTRAINT "admin_refund_approvals_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "admin_refund_approvals" ADD CONSTRAINT "admin_refund_approvals_approver_not_requester" CHECK ("approvedByAdminId" IS NULL OR "approvedByAdminId" != "requestedByAdminId");
