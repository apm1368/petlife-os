-- Email channel providers. ADD VALUE is additive and safe on a live table.
ALTER TYPE "MessagingProvider" ADD VALUE IF NOT EXISTS 'GMAIL';
ALTER TYPE "MessagingProvider" ADD VALUE IF NOT EXISTS 'SMTP';
