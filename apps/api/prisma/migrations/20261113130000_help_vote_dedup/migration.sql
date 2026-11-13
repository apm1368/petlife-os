-- The digest is a day-scoped HMAC, not an IP address or user-agent.
-- A uniqueness constraint gives concurrent duplicate requests one winner.
CREATE TABLE "help_vote_dedup" (
  "article_id" UUID NOT NULL,
  "vote_day" DATE NOT NULL,
  "client_digest" CHAR(64) NOT NULL,
  CONSTRAINT "help_vote_dedup_pkey" PRIMARY KEY ("article_id", "vote_day", "client_digest"),
  CONSTRAINT "help_vote_dedup_article_fkey" FOREIGN KEY ("article_id")
    REFERENCES "help_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "help_vote_dedup_vote_day_idx" ON "help_vote_dedup"("vote_day");
