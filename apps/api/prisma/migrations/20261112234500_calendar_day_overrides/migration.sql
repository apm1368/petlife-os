-- Staff changes to the business calendar: sudden closures, or an official holiday opened as a working day.
CREATE TABLE "calendar_day_overrides" (
    "date" DATE NOT NULL,
    "closed" BOOLEAN NOT NULL,
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "updatedByAdminId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "calendar_day_overrides_pkey" PRIMARY KEY ("date"),
    CONSTRAINT "calendar_day_overrides_text_check" CHECK (char_length(btrim("title")) BETWEEN 2 AND 120 AND char_length(btrim("reason")) BETWEEN 5 AND 500)
);
