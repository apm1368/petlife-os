-- Batch 3: additive enum values. Kept in their own migration because PostgreSQL cannot use a
-- newly added enum value inside the transaction that added it (the next migration does).
ALTER TYPE "BookingStatus" ADD VALUE 'REQUESTED';
ALTER TYPE "BookingStatus" ADD VALUE 'AWAITING_PAYMENT';
ALTER TYPE "BookingStatus" ADD VALUE 'REJECTED';
ALTER TYPE "BookingStatus" ADD VALUE 'EXPIRED';
ALTER TYPE "BookingStatus" ADD VALUE 'RESCHEDULED';
ALTER TYPE "CareCalendarEventType" ADD VALUE 'OTHER_SERVICE';
ALTER TYPE "ProviderServiceType" ADD VALUE 'LAB_TEST';
ALTER TYPE "ProviderServiceType" ADD VALUE 'IMAGING_STUDY';
ALTER TYPE "ProviderServiceType" ADD VALUE 'DENTAL_CARE';
ALTER TYPE "ProviderServiceType" ADD VALUE 'REHAB_SESSION';
ALTER TYPE "ProviderServiceType" ADD VALUE 'NUTRITION_CONSULT';
ALTER TYPE "ProviderServiceType" ADD VALUE 'HOME_VISIT';
ALTER TYPE "ProviderServiceType" ADD VALUE 'OTHER_SERVICE';
ALTER TYPE "ServiceCategory" ADD VALUE 'OTHER';
