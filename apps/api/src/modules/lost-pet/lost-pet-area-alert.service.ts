import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { SetLostPetAreaAlertDto } from "./dto/lost-pet.dto";

/** Rough upper bound on how many neighbours one report may alert, so a dense area never turns into a broadcast. */
export const MAX_AREA_ALERT_RECIPIENTS = 300;
const MAX_RADIUS_KM = 10;
const EARTH_KM = 6371;

export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** ~1.1 km precision. */
export const roundToKm = (degrees: number) => Math.round(degrees * 100) / 100;

export interface LostPetAreaAlertDto {
  active: boolean;
  radiusKm: number | null;
}

/**
 * #290 Q53 ("publish instantly and alert people in the same neighbourhood"), opt-in: a member chooses to hear about new
 * lost-pet reports within 1–10 km of a point they share once. The point is never returned, not even to its owner,
 * beyond "on, N km".
 */
@Injectable()
export class LostPetAreaAlertService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<LostPetAreaAlertDto> {
    const row = await this.prisma.lostPetAreaAlert.findUnique({ where: { userId }, select: { radiusKm: true } });
    return { active: !!row, radiusKm: row?.radiusKm ?? null };
  }

  async set(userId: string, dto: SetLostPetAreaAlertDto): Promise<LostPetAreaAlertDto> {
    // Stored to ~1 km (2 decimals): enough to match nearby reports, never a member's exact home.
    const data = { latitude: roundToKm(dto.latitude), longitude: roundToKm(dto.longitude), radiusKm: dto.radiusKm };
    const row = await this.prisma.lostPetAreaAlert.upsert({ where: { userId }, create: { userId, ...data }, update: data, select: { radiusKm: true } });
    return { active: true, radiusKm: row.radiusKm };
  }

  async remove(userId: string): Promise<LostPetAreaAlertDto> {
    await this.prisma.lostPetAreaAlert.deleteMany({ where: { userId } });
    return { active: false, radiusKm: null };
  }

  /** Members whose own radius covers the point, nearest first, without the given users (the pet's household). */
  async recipientsNear(latitude: number, longitude: number, excludeUserIds: string[]): Promise<string[]> {
    const dLat = MAX_RADIUS_KM / 111;
    const dLng = MAX_RADIUS_KM / (111 * Math.max(0.2, Math.cos((latitude * Math.PI) / 180)));
    const candidates = await this.prisma.lostPetAreaAlert.findMany({
      where: {
        latitude: { gte: latitude - dLat, lte: latitude + dLat },
        longitude: { gte: longitude - dLng, lte: longitude + dLng },
        userId: { notIn: excludeUserIds },
        user: { accountStatus: "ACTIVE" },
      },
      select: { userId: true, latitude: true, longitude: true, radiusKm: true },
      take: 5000,
    });
    return candidates
      .map((c) => ({ userId: c.userId, km: distanceKm(latitude, longitude, c.latitude, c.longitude), radiusKm: c.radiusKm }))
      .filter((c) => c.km <= c.radiusKm)
      .sort((a, b) => a.km - b.km)
      .slice(0, MAX_AREA_ALERT_RECIPIENTS)
      .map((c) => c.userId);
  }
}
