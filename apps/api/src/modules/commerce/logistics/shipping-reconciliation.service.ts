import { Injectable } from "@nestjs/common";
import { ShipmentStatus, type ShippingProvider } from "@prisma/client";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { DomainEventsService } from "../../../common/events/domain-events.service";
import { ShipmentNotFoundException, ShipmentReconciliationFailedException } from "../../../common/errors/api-exception";
import { ShippingProviderRegistry } from "./shipping-provider-registry.service";
import { ShippingOrchestrator } from "./shipping-orchestrator.service";
import { ShipmentEventsService } from "./shipment-events.service";

export interface ReconciliationOutcome {
  shipmentId: string;
  localStatus: ShipmentStatus;
  remoteStatus: ShipmentStatus;
  action: "NONE" | "RESOLVED" | "UNKNOWN_REMOTE_STATE";
}

/**
 * Resolves a local/provider state disagreement for one Shipment (spec
 * section 19) — never writes financial/domain state itself; it always
 * drives the exact same `ShippingOrchestrator.applyShipmentStatus` a real
 * webhook would (same forward-only, terminal-protected, UNKNOWN-never-
 * implies-success rules), and records one ShipmentEvent per check
 * regardless of outcome — reusing ShipmentEvent as the audit trail (spec
 * section 29) rather than a second, near-duplicate reconciliation-log model.
 */
@Injectable()
export class ShippingReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shippingProviders: ShippingProviderRegistry,
    private readonly orchestrator: ShippingOrchestrator,
    private readonly shipmentEvents: ShipmentEventsService,
    private readonly events: DomainEventsService,
  ) {}

  async reconcileShipment(shipmentId: string): Promise<ReconciliationOutcome> {
    const shipment = await this.prisma.shipment.findUnique({ where: { id: shipmentId } });
    if (!shipment) throw new ShipmentNotFoundException({ shipmentId });

    const gateway = this.shippingProviders.resolve(shipment.provider);
    if (!shipment.providerShipmentId || !gateway.capabilities.supportsStatusQuery) {
      await this.appendCheckEvent(shipment.id, shipment.provider, shipment.providerShipmentId ?? shipment.id, undefined, ShipmentStatus.UNKNOWN);
      return { shipmentId, localStatus: shipment.status, remoteStatus: ShipmentStatus.UNKNOWN, action: "UNKNOWN_REMOTE_STATE" };
    }

    let remote;
    try {
      remote = await gateway.getShipmentStatus(shipment.providerShipmentId);
    } catch {
      throw new ShipmentReconciliationFailedException({ shipmentId });
    }

    const { applied } = await this.orchestrator.applyShipmentStatus(shipmentId, remote.canonicalStatus);
    await this.prisma.shipment.update({ where: { id: shipmentId }, data: { lastReconciledAt: new Date() } });
    await this.appendCheckEvent(shipment.id, shipment.provider, shipment.providerShipmentId, remote.rawStatus, remote.canonicalStatus);

    const action: ReconciliationOutcome["action"] = remote.canonicalStatus === ShipmentStatus.UNKNOWN ? "UNKNOWN_REMOTE_STATE" : applied ? "RESOLVED" : "NONE";
    await this.events.publish("ShipmentReconciled", { shipmentId, localStatus: shipment.status, remoteStatus: remote.canonicalStatus, action }, { aggregateType: "Shipment", aggregateId: shipmentId });
    return { shipmentId, localStatus: shipment.status, remoteStatus: remote.canonicalStatus, action };
  }

  private async appendCheckEvent(shipmentId: string, provider: ShippingProvider, reference: string, rawStatus: string | undefined, canonicalStatus: ShipmentStatus): Promise<void> {
    const now = new Date();
    await this.shipmentEvents.recordIfNew({
      shipmentId,
      provider,
      providerEventId: ShipmentEventsService.fingerprint(provider, reference, "reconciliation.checked", now),
      eventType: "reconciliation.checked",
      providerStatus: rawStatus,
      canonicalStatus,
      occurredAt: now,
    });
  }
}
