import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export const DOMAIN_EVENT_TYPES = [
  "UserAuthenticated",
  "HouseholdCreated",
  "PetCreated",
  "ActivePetChanged",
  "OnboardingCompleted",
  "PetProfileUpdated",
  "HealthProfileUpdated",
  "AllergyAdded",
  "AllergyUpdated",
  "ConditionAdded",
  "MedicationAdded",
  "VaccinationSummaryUpdated",
  "NutritionProfileUpdated",
  "CareProfileUpdated",
  "ProviderViewed",
  "CareCalendarEventCreated",
  // Services Marketplace Basics (Handoff 04) — generalized names replacing
  // the Handoff 03 vet-only vocabulary (BookingHoldCreated/BookingCreated/
  // BookingConfirmed/BookingCancelled/TemporaryPetAccessGranted/
  // TemporaryPetAccessRevoked) now that the same booking engine spans every
  // service category, not just vet visits.
  "ServiceViewed",
  "ServiceCompatibilityEvaluated",
  "ServiceBookingStarted",
  "ServiceBookingConfirmed",
  "ServiceBookingCancelled",
  "ServiceAccessGranted",
  "ServiceAccessRevoked",
  "BookingSeriesCreated",
  // Minimal Provider OS (Handoff 05)
  "ProviderContextChanged",
  "ProviderAvailabilityRuleCreated",
  "ProviderAvailabilityRuleUpdated",
  "ProviderAvailabilityRuleDeleted",
  "ProviderAvailabilityExceptionCreated",
  "ProviderAvailabilityExceptionUpdated",
  "ProviderAvailabilityExceptionDeleted",
  "ProviderBookingConfirmed",
  "ProviderBookingCancelled",
  "BookingCheckedIn",
  "BookingStarted",
  "BookingCompleted",
  "ProviderServiceUpdated",
  // Commerce Core (Handoff 06)
  "ProductViewed",
  "OfferSelected",
  "CartCreated",
  "CartItemAdded",
  "CartItemUpdated",
  "CartItemRemoved",
  "CheckoutCreated",
  "InventoryReserved",
  "InventoryReleased",
  "PaymentIntentCreated",
  "PaymentAttemptStarted",
  "PaymentSucceeded",
  "PaymentFailed",
  "OrderCreated",
  "OrderConfirmed",
  "CartConverted",
  // Real Payments + BNPL + Refund Basics + Reconciliation (Handoff 07)
  "PaymentProviderRedirectCreated",
  "PaymentAuthorized",
  "PaymentCaptured",
  "PaymentDeclined",
  "PaymentPending",
  "FinancingIntentCreated",
  "FinancingEligibilityChecked",
  "FinancingPlanSelected",
  "FinancingApproved",
  "FinancingDeclined",
  "RefundRequested",
  "RefundSucceeded",
  "RefundFailed",
  "PaymentReconciled",
  "FinancialLedgerTransactionCreated",
  // Delivery & Logistics Core (Handoff 08)
  "ShippingQuoteCreated",
  "ShippingQuoteSelected",
  "FulfillmentCreated",
  "FulfillmentReadyForPickup",
  "FulfillmentFailed",
  "FulfillmentCanceled",
  "ShipmentCreated",
  "ShipmentAssigned",
  "ShipmentPickedUp",
  "ShipmentInTransit",
  "ShipmentOutForDelivery",
  "ShipmentDelivered",
  "ShipmentFailed",
  "ShipmentCanceled",
  "ShipmentReconciled",
  // Seller OS + Marketplace Channel Integrations (Handoff 09)
  "SellerMembershipCreated",
  "SellerMembershipRoleChanged",
  "SellerMembershipDeactivated",
  "SellerContextChanged",
  "SellerOfferPriceChanged",
  "SellerOfferActivated",
  "SellerOfferDeactivated",
  "InventoryAdjusted",
  "MarketplaceChannelAccountConnected",
  "MarketplaceListingPublished",
  "MarketplaceListingSyncSucceeded",
  "MarketplaceListingSyncFailed",
  "MarketplaceOrderReceived",
  "MarketplaceOrderCancelled",
  "MarketplaceInventoryMismatchDetected",
] as const;

/**
 * The canonical event-name registry. Every publish() call is checked against
 * this union at compile time — a typo'd event name (e.g. "HouseholdCraeted")
 * fails the build/tests instead of silently inserting an unrecognized string
 * into the domain_events table. This is deliberately a TypeScript-only
 * guarantee: the DB column stays plain text (see the doc comment on the
 * DomainEvent Prisma model) because a Postgres enum would need a migration
 * for every new event type as the product grows.
 */
export type DomainEventType = (typeof DOMAIN_EVENT_TYPES)[number];

export interface PublishOptions {
  /** Pass the same $transaction callback's tx here to commit the event atomically with the domain mutation it describes. */
  tx?: Prisma.TransactionClient;
  aggregateType?: string;
  aggregateId?: string;
}

/**
 * Outbox-shaped: every event is persisted to `domain_events` before being
 * dispatched in-process via EventEmitter2. Today the dispatch is synchronous
 * and best-effort; evolving to an at-least-once relay only means adding a
 * poller that reads unprocessed (or failed/retryable, via attemptCount) rows
 * and marks `processedAt` — no schema or call-site change required.
 */
@Injectable()
export class DomainEventsService {
  private readonly logger = new Logger(DomainEventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emitter: EventEmitter2,
  ) {}

  async publish(type: DomainEventType, payload: Record<string, unknown>, options: PublishOptions = {}): Promise<void> {
    const client = options.tx ?? this.prisma;

    const event = await client.domainEvent.create({
      data: {
        type,
        payload: payload as Prisma.InputJsonValue,
        aggregateType: options.aggregateType,
        aggregateId: options.aggregateId,
      },
    });

    try {
      this.emitter.emit(type, payload);
      await client.domainEvent.update({
        where: { id: event.id },
        data: { processedAt: new Date() },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to dispatch domain event ${type} (${event.id})`, error instanceof Error ? error.stack : undefined);
      await client.domainEvent
        .update({
          where: { id: event.id },
          data: { attemptCount: { increment: 1 }, lastError: message },
        })
        .catch(() => undefined);
    }
  }
}
