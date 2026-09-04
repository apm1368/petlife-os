-- Handoff 19: add TRAVEL and INSURANCE notification categories so trip/
-- insurance application status-change notifications route through H10's
-- existing NotificationCategory enum rather than an overloaded existing one.
ALTER TYPE "NotificationCategory" ADD VALUE 'TRAVEL';
ALTER TYPE "NotificationCategory" ADD VALUE 'INSURANCE';
