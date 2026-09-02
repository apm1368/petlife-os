import { WeightUnit } from "@prisma/client";
import type { ShippingPackage } from "./shipping-gateway.interface";

const LB_TO_GRAMS = 453.592;

function toGrams(value: number, unit: WeightUnit): number {
  return unit === WeightUnit.KG ? value * 1000 : value * LB_TO_GRAMS;
}

export interface PackageableLine {
  quantity: number;
  unitPriceAmount: number;
  variantWeightValue: number | null;
  variantWeightUnit: WeightUnit | null;
}

/**
 * Builds the normalized package context for one seller's share of a
 * checkout/order (spec section 9). `ProductVariant.weightValue`/`weightUnit`
 * are the only reliable physical facts this catalog has — dimensions are
 * never modeled, so `widthCm`/`heightCm`/`lengthCm` stay `undefined` rather
 * than fabricated. `declaredValueIrr` is safe to derive (it's just the
 * line total, already known), unlike weight/dimensions which would have to
 * be invented if missing.
 */
export function buildShippingPackage(lines: PackageableLine[]): ShippingPackage {
  let weightGrams: number | undefined;
  let declaredValueIrr = 0;

  for (const line of lines) {
    if (line.variantWeightValue != null && line.variantWeightUnit) {
      const lineWeight = toGrams(line.variantWeightValue, line.variantWeightUnit) * line.quantity;
      weightGrams = (weightGrams ?? 0) + lineWeight;
    }
    declaredValueIrr += line.unitPriceAmount * line.quantity;
  }

  return {
    weightGrams: weightGrams != null ? Math.round(weightGrams) : undefined,
    declaredValueIrr: declaredValueIrr > 0 ? declaredValueIrr : undefined,
  };
}
