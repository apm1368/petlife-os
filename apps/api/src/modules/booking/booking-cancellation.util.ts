/** Structured cancellation reasons, by who cancels. Free-text `reason` stays optional alongside. */
export const OWNER_CANCELLATION_CODES = ["OWNER_CHANGED_PLANS", "OWNER_PET_UNWELL", "OWNER_FOUND_ALTERNATIVE", "OWNER_OTHER"] as const;
export const PROVIDER_CANCELLATION_CODES = ["PROVIDER_UNAVAILABLE", "PROVIDER_VEHICLE_ISSUE", "PROVIDER_SAFETY_CONCERN", "PROVIDER_OTHER"] as const;
/** SYSTEM_STAFF_CANCELLED: opetlife staff cancelled it for the platform (admin, audited with the free-text reason). */
export const SYSTEM_CANCELLATION_CODES = ["SYSTEM_EXPIRED", "SYSTEM_PAYMENT_FAILED", "SYSTEM_STAFF_CANCELLED"] as const;

/** Pet taxi ride needs the member can declare at booking. */
export const TRANSPORT_REQUIREMENTS = ["CRATE_REQUIRED", "LARGE_PET", "MEDICAL_TRANSPORT", "MULTIPLE_PETS", "ASSISTANT_REQUIRED"] as const;
