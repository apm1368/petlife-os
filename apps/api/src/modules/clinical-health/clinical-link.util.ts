import { PrismaService } from "../../common/prisma/prisma.service";
import { ClinicalVisitNotFoundException } from "../../common/errors/api-exception";

/**
 * Every provider-created sub-record (lab/imaging/referral/dental/nutrition/
 * rehab/document) that optionally links to a ClinicalVisit must be defending
 * against a mismatched petId — a client could otherwise attach a result to
 * one pet's visit while claiming a different pet in the request body. Called
 * before every such create.
 */
export async function assertVisitBelongsToPet(prisma: PrismaService, clinicalVisitId: string | undefined, petId: string): Promise<void> {
  if (!clinicalVisitId) return;
  const visit = await prisma.clinicalVisit.findUnique({ where: { id: clinicalVisitId } });
  if (!visit || visit.petId !== petId) throw new ClinicalVisitNotFoundException({ clinicalVisitId });
}
