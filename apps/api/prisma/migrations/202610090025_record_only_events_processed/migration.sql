-- Record-only domain events (activity log / idempotency anchors written straight to domain_events, with no in-process
-- listener) were never marked processed, so they looked like an outbox backlog. They have nothing to dispatch.
UPDATE "domain_events" SET "processedAt" = "occurredAt"
WHERE "processedAt" IS NULL
  AND "type" IN ('CareReminderDue', 'CareReminderCreated', 'CareReminderChanged', 'CareReminderCompleted', 'PetHealthShared', 'PetHealthShareRevoked', 'TripDepartureApproaching', 'SubscriptionTrialEndingSoon', 'ClinicReminderSent', 'CareReminderSkipped', 'CareReminderEdited', 'CareTemplateApplied');
