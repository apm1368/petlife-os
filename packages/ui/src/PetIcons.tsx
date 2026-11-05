import type { LucideIcon } from "lucide-react";
import { Bone, Cat, Dog, Fish, HeartPulse, PawPrint, Rabbit, Rat, Scissors, ShieldCheck, Stethoscope, Syringe, Trees, Turtle, UtensilsCrossed, CarFront, BedDouble, Plane, HandHeart, Bird } from "lucide-react";

/** DS-08 service icon registry. All Lucide icons inherit the same 2px stroke weight. */
export const petIcons = {
  adoption: HandHeart, boarding: BedDouble, care: HeartPulse, cat: Cat, clinic: Stethoscope,
  dog: Dog, food: UtensilsCrossed, grooming: Scissors, insurance: ShieldCheck, medicine: Syringe,
  park: Trees, paw: PawPrint, rabbit: Rabbit, rodent: Rat, taxi: CarFront, travel: Plane,
  turtle: Turtle, fish: Fish, bird: Bird, nutrition: Bone,
} as const satisfies Record<string, LucideIcon>;

export type PetIconName = keyof typeof petIcons;
