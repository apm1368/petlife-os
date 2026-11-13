import { bookingPrice, bookingSpanMinutes, stayNights } from "./booking-pricing.util";

const day = (d: number) => new Date(Date.UTC(2026, 10, 20 + d, 12));

describe("multi-pet booking price rules (owner 2026-11-13)", () => {
  it("a pet taxi is one price per ride, however many pets ride; a distance fare wins", () => {
    expect(bookingPrice({ category: "PET_TAXI", locationMode: "TRANSPORT", unitPrice: 2_000_000, petCount: 3, start: day(0), end: day(0) })).toMatchObject({ total: 2_000_000, quantity: 1, basis: "PER_RIDE" });
    expect(bookingPrice({ category: "OTHER", locationMode: "TRANSPORT", unitPrice: 2_000_000, petCount: 2, start: day(0), end: day(0), distanceFare: 1_340_000 }).total).toBe(1_340_000);
  });

  it("boarding and sitting are per night per pet, at least one night", () => {
    expect(bookingPrice({ category: "BOARDING", unitPrice: 500_000, petCount: 2, start: day(0), end: day(3) })).toMatchObject({ total: 3_000_000, quantity: 6, nights: 3, basis: "PER_PET_NIGHT" });
    expect(bookingPrice({ category: "SITTING", unitPrice: 400_000, petCount: 1, start: day(0), end: day(0) }).total).toBe(400_000);
    expect(stayNights(day(0), day(1))).toBe(1);
  });

  it("grooming, vet, training, walking are per pet; an unpriced service stays unpriced", () => {
    expect(bookingPrice({ category: "GROOMING", unitPrice: 900_000, petCount: 2, start: day(0), end: day(0) })).toMatchObject({ total: 1_800_000, quantity: 2, basis: "PER_PET" });
    expect(bookingPrice({ category: "WALKING", unitPrice: 300_000, petCount: 3, start: day(0), end: day(0) }).total).toBe(900_000);
    expect(bookingPrice({ category: "VET", unitPrice: null, petCount: 2, start: day(0), end: day(0) }).total).toBeNull();
  });

  it("grooming, vet and training take pets one after another; other appointments keep one duration", () => {
    expect(bookingSpanMinutes("GROOMING", 45, 2)).toBe(90);
    expect(bookingSpanMinutes("VET", 30, 3)).toBe(90);
    expect(bookingSpanMinutes("TRAINING", 60, 1)).toBe(60);
    expect(bookingSpanMinutes("WALKING", 30, 3)).toBe(30);
    expect(bookingSpanMinutes("PET_TAXI", 60, 3)).toBe(60);
  });
});
