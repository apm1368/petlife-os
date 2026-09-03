import { SourceType } from "@prisma/client";
import { ProviderRecordNotOwnerEditableException } from "../../common/errors/api-exception";

/**
 * Handoff 17 locked principle: "provider-originated clinical records must
 * not be silently overwritten by owners." Called before any owner-facing
 * PATCH/DELETE of an Allergy/Condition/Medication row — an owner who
 * disagrees with a PROVIDER/CLINIC-sourced entry must file a
 * MedicalRecordCorrection instead (see clinical-health/medical-record-correction.service.ts).
 * OWNER and HOUSEHOLD_MEMBER sourced rows remain freely editable by the
 * household, unchanged from Handoff 02 behavior.
 */
export function assertOwnerEditable(sourceType: SourceType): void {
  if (sourceType === SourceType.PROVIDER || sourceType === SourceType.CLINIC) {
    throw new ProviderRecordNotOwnerEditableException({ sourceType });
  }
}
