import { Injectable } from "@nestjs/common";
import { ClaimPrepStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotFoundApiException, ValidationApiException } from "../../common/errors/api-exception";

const KINDS = ["MEDICAL_DOCUMENT", "BOOKING"] as const;
export type ClaimItemKind = (typeof KINDS)[number];

/**
 * A claim-preparation folder: the owner groups this pet's invoices (bookings) and medical documents for a future
 * claim. It is never sent to an insurer — no claim submission exists, and the API says so (`submission:
 * "NOT_AVAILABLE"`). Items must belong to the same pet; their files keep their own access rules.
 */
@Injectable()
export class ClaimPrepService {
  constructor(private readonly prisma: PrismaService) {}

  async list(petId: string) {
    const rows = await this.prisma.insuranceClaimPrep.findMany({ where: { petId }, orderBy: { createdAt: "desc" }, include: { _count: { select: { items: true } } } });
    return rows.map((r) => ({ id: r.id, title: r.title, incidentDate: r.incidentDate?.toISOString().slice(0, 10) ?? null, status: r.status, itemCount: r._count.items, submission: "NOT_AVAILABLE" as const, createdAt: r.createdAt.toISOString() }));
  }

  async create(petId: string, userId: string, input: { title: string; incidentDate?: string; notes?: string }) {
    const pet = await this.prisma.pet.findUniqueOrThrow({ where: { id: petId }, select: { householdId: true } });
    const title = input.title.trim();
    if (!title) throw new ValidationApiException({ field: "title" });
    const row = await this.prisma.insuranceClaimPrep.create({ data: { petId, householdId: pet.householdId, createdByUserId: userId, title, incidentDate: input.incidentDate ? new Date(input.incidentDate) : null, notes: input.notes?.trim() || null } });
    return this.get(petId, row.id);
  }

  async get(petId: string, id: string) {
    const prep = await this.prisma.insuranceClaimPrep.findFirst({ where: { id, petId }, include: { items: { orderBy: { createdAt: "asc" } } } });
    if (!prep) throw new NotFoundApiException("ClaimPrep");
    const docIds = prep.items.filter((i) => i.kind === "MEDICAL_DOCUMENT").map((i) => i.refId);
    const bookingIds = prep.items.filter((i) => i.kind === "BOOKING").map((i) => i.refId);
    const [docs, bookings] = await Promise.all([
      this.prisma.medicalDocument.findMany({ where: { id: { in: docIds } }, select: { id: true, title: true, documentType: true, uploadedAt: true, voidedAt: true } }),
      this.prisma.booking.findMany({ where: { id: { in: bookingIds } }, select: { id: true, bookingNumber: true, serviceNameSnapshot: true, startAt: true, priceAmount: true, discountAmount: true, currency: true, bookingStatus: true } }),
    ]);
    return {
      id: prep.id, title: prep.title, incidentDate: prep.incidentDate?.toISOString().slice(0, 10) ?? null, notes: prep.notes, status: prep.status, submission: "NOT_AVAILABLE" as const,
      items: prep.items.map((i) => {
        const doc = i.kind === "MEDICAL_DOCUMENT" ? docs.find((d) => d.id === i.refId) : undefined;
        const b = i.kind === "BOOKING" ? bookings.find((x) => x.id === i.refId) : undefined;
        return {
          id: i.id, kind: i.kind, refId: i.refId,
          document: doc ? { title: doc.title, documentType: doc.documentType, uploadedAt: doc.uploadedAt.toISOString(), voided: Boolean(doc.voidedAt) } : null,
          booking: b ? { bookingNumber: b.bookingNumber, serviceName: b.serviceNameSnapshot, startAt: b.startAt.toISOString(), status: b.bookingStatus, amount: b.priceAmount ? b.priceAmount.minus(b.discountAmount).toString() : null, currency: b.currency } : null,
        };
      }),
    };
  }

  async addItem(petId: string, id: string, kind: ClaimItemKind, refId: string) {
    await this.get(petId, id);
    const belongs = kind === "MEDICAL_DOCUMENT" ? await this.prisma.medicalDocument.count({ where: { id: refId, petId } }) : await this.prisma.booking.count({ where: { id: refId, petId } });
    if (!belongs) throw new NotFoundApiException(kind === "MEDICAL_DOCUMENT" ? "MedicalDocument" : "Booking");
    try {
      await this.prisma.insuranceClaimPrepItem.create({ data: { claimPrepId: id, kind, refId } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new ValidationApiException({ reason: "ALREADY_IN_FOLDER" });
      throw e;
    }
    return this.get(petId, id);
  }

  async removeItem(petId: string, id: string, itemId: string) {
    await this.get(petId, id);
    const removed = await this.prisma.insuranceClaimPrepItem.deleteMany({ where: { id: itemId, claimPrepId: id } });
    if (!removed.count) throw new NotFoundApiException("ClaimPrepItem");
    return this.get(petId, id);
  }

  async setStatus(petId: string, id: string, status: ClaimPrepStatus) {
    const done = await this.prisma.insuranceClaimPrep.updateMany({ where: { id, petId }, data: { status } });
    if (!done.count) throw new NotFoundApiException("ClaimPrep");
    return this.get(petId, id);
  }
}
