-- Community chat v1: 1:1 conversations, participants with read state, messages with moderation status,
-- member blocks, and chat messages as a report target. Additive only.
-- AlterTable
ALTER TABLE "community_reports" ADD COLUMN     "chatMessageId" UUID;

-- CreateTable
CREATE TABLE "chat_conversations" (
    "id" UUID NOT NULL,
    "pairKey" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_participants" (
    "conversationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReadAt" TIMESTAMP(3),

    CONSTRAINT "chat_participants_pkey" PRIMARY KEY ("conversationId","userId")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "senderUserId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "status" "CommunityContentStatus" NOT NULL DEFAULT 'PUBLISHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_blocks" (
    "blockerUserId" UUID NOT NULL,
    "blockedUserId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("blockerUserId","blockedUserId")
);

-- CreateIndex
CREATE UNIQUE INDEX "chat_conversations_pairKey_key" ON "chat_conversations"("pairKey");

-- CreateIndex
CREATE INDEX "chat_conversations_lastMessageAt_idx" ON "chat_conversations"("lastMessageAt");

-- CreateIndex
CREATE INDEX "chat_participants_userId_idx" ON "chat_participants"("userId");

-- CreateIndex
CREATE INDEX "chat_messages_conversationId_createdAt_idx" ON "chat_messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "chat_messages_senderUserId_createdAt_idx" ON "chat_messages"("senderUserId", "createdAt");

-- CreateIndex
CREATE INDEX "user_blocks_blockedUserId_idx" ON "user_blocks"("blockedUserId");

-- CreateIndex
CREATE INDEX "community_reports_chatMessageId_idx" ON "community_reports"("chatMessageId");

-- AddForeignKey
ALTER TABLE "chat_participants" ADD CONSTRAINT "chat_participants_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_participants" ADD CONSTRAINT "chat_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "chat_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blockerUserId_fkey" FOREIGN KEY ("blockerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blockedUserId_fkey" FOREIGN KEY ("blockedUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A message is text, 1..2000 characters; a member cannot block themselves.
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_body_len" CHECK (char_length("body") BETWEEN 1 AND 2000);
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_not_self" CHECK ("blockerUserId" <> "blockedUserId");

-- A chat message is one more report target; keep "exactly one target per report".
ALTER TABLE "community_reports" DROP CONSTRAINT "community_reports_single_target";
ALTER TABLE "community_reports" ADD CONSTRAINT "community_reports_single_target" CHECK (
  (("postId" IS NOT NULL)::int + ("commentId" IS NOT NULL)::int + ("supportNeedListingId" IS NOT NULL)::int + ("lostPetIncidentId" IS NOT NULL)::int + ("lostPetSightingId" IS NOT NULL)::int + ("organizationId" IS NOT NULL)::int + ("chatMessageId" IS NOT NULL)::int) = 1
);
