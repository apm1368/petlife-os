import type { ConfigService } from "@nestjs/config";
import type { AppEnv } from "../../config/env";

/**
 * Whether dev simulation surfaces may run: never in production, and otherwise only when DEV_SIMULATION_ENABLED is
 * set explicitly. A non-production NODE_ENV alone is not enough — the canonical server runs with sandbox providers
 * and must not let members fabricate notifications, payment results or shipment states.
 */
export function devSimulationAllowed(config: ConfigService<AppEnv, true>): boolean {
  return config.get("NODE_ENV", { infer: true }) !== "production" && config.get("DEV_SIMULATION_ENABLED", { infer: true }) === true;
}
