import type { StatusTone } from "@petlife/ui";
import type { PetPolicyMatchDto, PetPolicyMatchOutcome, TravelBookingDto, TravelBookingStatus, TravelListingType, TravelPaymentStatus, TravelPetPolicyDto, TravelRatePlanSnapshotDto } from "@petlife/types";
import { formatCurrency } from "@/lib/currency/format-currency";
import { formatDay, localizeDigits } from "@/lib/date/jalali";

export type Lang = "fa" | "en";
type Pair = [string, string];
const pick = (p: Pair, lang: Lang) => (lang === "fa" ? p[0] : p[1]);

export const LISTING_TYPE: Record<string, Pair> = {
  HOTEL: ["هتل", "Hotel"],
  ECO_LODGE: ["اقامتگاه بوم‌گردی", "Eco-lodge"],
  GUESTHOUSE: ["مهمان‌خانه", "Guesthouse"],
  RESORT: ["ریزورت", "Resort"],
  PET_HOTEL: ["هتل حیوانات", "Pet hotel"],
  PET_FRIENDLY_HOTEL: ["هتل دوستدار حیوانات", "Pet-friendly hotel"],
  VILLA: ["ویلا", "Villa"],
  APARTMENT: ["آپارتمان", "Apartment"],
  RESIDENCE: ["اقامتگاه", "Residence"],
  BOARDING: ["پانسیون", "Boarding"],
  PET_TAXI: ["تاکسی حیوانات", "Pet taxi"],
  INTERCITY_TRANSPORT: ["حمل بین‌شهری", "Intercity transport"],
};
/** Stay types a traveller can search for (transport types are not stays). */
export const STAY_TYPES: TravelListingType[] = ["HOTEL", "PET_FRIENDLY_HOTEL", "ECO_LODGE", "GUESTHOUSE", "RESORT", "VILLA", "APARTMENT", "RESIDENCE", "PET_HOTEL"] as TravelListingType[];
export const listingTypeLabel = (t: string, lang: Lang) => pick(LISTING_TYPE[t] ?? [t, t], lang);

export const AMENITY: Record<string, Pair> = {
  WIFI: ["اینترنت", "Wi-Fi"],
  PARKING: ["پارکینگ", "Parking"],
  YARD: ["حیاط", "Yard"],
  FENCED_YARD: ["حیاط محصور", "Fenced yard"],
  POOL: ["استخر", "Pool"],
  KITCHEN: ["آشپزخانه", "Kitchen"],
  BREAKFAST: ["صبحانه", "Breakfast"],
  AIR_CONDITIONING: ["تهویه", "Air conditioning"],
  HEATING: ["گرمایش", "Heating"],
  PET_BED: ["جای خواب حیوان", "Pet bed"],
  PET_BOWLS: ["ظرف آب و غذا", "Pet bowls"],
  DOG_PARK_NEARBY: ["پارک سگ در نزدیکی", "Dog park nearby"],
  PET_SITTING: ["نگهداری حیوان", "Pet sitting"],
  GROOMING: ["آرایش حیوان", "Grooming"],
  VET_ON_CALL: ["دامپزشک آنکال", "Vet on call"],
  WALKING_TRAILS: ["مسیر پیاده‌روی", "Walking trails"],
  RESTAURANT: ["رستوران", "Restaurant"],
  ELEVATOR: ["آسانسور", "Elevator"],
};
export const amenityLabel = (a: string, lang: Lang) => pick(AMENITY[a] ?? [a.replace(/_/g, " ").toLowerCase(), a.replace(/_/g, " ").toLowerCase()], lang);

export const BOOKING_STATUS: Record<string, Pair> = {
  HELD: ["در انتظار تکمیل", "Dates held"],
  DRAFT: ["پیش‌نویس", "Draft"],
  AWAITING_PROVIDER: ["در انتظار پاسخ اقامتگاه", "Awaiting the property"],
  AWAITING_PAYMENT: ["در انتظار پرداخت", "Awaiting payment"],
  CONFIRMED: ["تأیید شده", "Confirmed"],
  IN_PROGRESS: ["در حال اقامت", "Checked in"],
  COMPLETED: ["پایان یافته", "Completed"],
  CANCELLED: ["لغو شده", "Cancelled"],
  REJECTED: ["رد شده", "Declined"],
  EXPIRED: ["منقضی شده", "Expired"],
  REFUNDED: ["بازپرداخت شده", "Refunded"],
  NO_SHOW: ["عدم حضور", "No-show"],
  MODIFIED: ["جایگزین شده", "Replaced by a change"],
};
export const bookingStatusLabel = (s: string, lang: Lang) => pick(BOOKING_STATUS[s] ?? [s, s], lang);
export function bookingStatusTone(s: TravelBookingStatus | string): StatusTone {
  switch (s) {
    case "CONFIRMED":
    case "COMPLETED":
    case "IN_PROGRESS":
      return "success";
    case "AWAITING_PROVIDER":
    case "AWAITING_PAYMENT":
    case "HELD":
      return "attention";
    case "REJECTED":
    case "NO_SHOW":
      return "higherConcern";
    default:
      return "neutral";
  }
}

export const PAYMENT_STATUS: Record<TravelPaymentStatus, Pair> = {
  NOT_REQUIRED: ["پرداختی لازم نیست", "No payment needed"],
  AWAITING: ["در انتظار پرداخت", "Awaiting payment"],
  PAID: ["پرداخت شده", "Paid"],
  FAILED: ["پرداخت ناموفق", "Payment failed"],
  REFUND_PENDING: ["بازپرداخت در جریان", "Refund in progress"],
  REFUNDED: ["بازپرداخت شده", "Refunded"],
  PARTIALLY_REFUNDED: ["بخشی بازپرداخت شده", "Partly refunded"],
  PAY_AT_PROPERTY: ["پرداخت در محل", "Pay at the property"],
};
export const paymentStatusLabel = (s: string, lang: Lang) => pick(PAYMENT_STATUS[s as TravelPaymentStatus] ?? [s, s], lang);

export const MATCH_LABEL: Record<PetPolicyMatchOutcome, Pair> = {
  MATCH: ["مطابق قوانین اعلام‌شده", "Fits the stated pet rules"],
  POTENTIAL_CONFLICT: ["احتمال مغایرت با قوانین", "May not fit the pet rules"],
  MORE_INFO_NEEDED: ["اطلاعات بیشتری لازم است", "More information needed"],
};
export function matchTone(o: PetPolicyMatchOutcome | null | undefined): StatusTone {
  return o === "MATCH" ? "success" : o === "POTENTIAL_CONFLICT" ? "higherConcern" : "attention";
}

/** One human sentence per structured reason; never a safety verdict. */
export function matchReason(r: PetPolicyMatchDto["reasons"][number], lang: Lang): string {
  const d = (r.detail ?? {}) as Record<string, number | string | null>;
  const who = r.petName ?? (lang === "fa" ? "حیوان شما" : "Your pet");
  const n = (v: unknown) => localizeDigits(String(v ?? "—"), lang);
  switch (r.code) {
    case "POLICY_NOT_STATED":
      return lang === "fa" ? "اقامتگاه قوانین حیوانات را اعلام نکرده است. پیش از رزرو از اقامتگاه بپرسید." : "The property has not stated its pet rules. Ask before you book.";
    case "TOO_MANY_PETS":
      return lang === "fa" ? `حداکثر ${n(d.maxPets)} حیوان پذیرفته می‌شود؛ شما ${n(d.requested)} حیوان انتخاب کرده‌اید.` : `Up to ${d.maxPets} pets are accepted; you selected ${d.requested}.`;
    case "SPECIES_NOT_ACCEPTED":
      return lang === "fa" ? `${who}: این گونه طبق قوانین اعلام‌شده پذیرفته نمی‌شود.` : `${who}: this species is not accepted under the stated rules.`;
    case "WEIGHT_UNKNOWN":
      return lang === "fa" ? `${who}: وزن ثبت نشده و اقامتگاه محدودیت وزن دارد. وزن را در پروفایل ثبت کنید.` : `${who}: no weight on file and the property has a weight limit. Add a weight to the profile.`;
    case "OVER_MAX_WEIGHT":
      return lang === "fa" ? `${who}: وزن ثبت‌شده ${n(d.weightKg)} کیلوگرم، بیش از سقف ${n(d.maxWeightKg)} کیلوگرم است.` : `${who}: recorded weight ${d.weightKg} kg is above the ${d.maxWeightKg} kg limit.`;
    case "UNDER_MIN_WEIGHT":
      return lang === "fa" ? `${who}: وزن ثبت‌شده ${n(d.weightKg)} کیلوگرم، کمتر از حداقل ${n(d.minWeightKg)} کیلوگرم است.` : `${who}: recorded weight ${d.weightKg} kg is below the ${d.minWeightKg} kg minimum.`;
    case "UNIT_PET_LIMIT":
      return lang === "fa" ? `این واحد حداکثر ${n(d.maxPets)} حیوان می‌پذیرد.` : `This room accepts up to ${d.maxPets} pets.`;
    default:
      return r.code;
  }
}

/** Plain-language cancellation terms of a rate plan (or its snapshot). */
export function cancellationSummary(plan: Pick<TravelRatePlanSnapshotDto, "cancellationType" | "freeCancellationDays" | "lateRefundPercent"> | null, lang: Lang): string {
  if (!plan) return lang === "fa" ? "شرایط لغو در قوانین اقامتگاه آمده است." : "Cancellation terms are in the property's policy.";
  const days = localizeDigits(plan.freeCancellationDays ?? 0, lang);
  const late = localizeDigits(plan.lateRefundPercent ?? 0, lang);
  switch (plan.cancellationType) {
    case "FREE_UNTIL":
      return lang === "fa" ? `لغو رایگان تا ${days} روز پیش از ورود؛ پس از آن ${late}٪ بازپرداخت.` : `Free cancellation until ${plan.freeCancellationDays ?? 0} days before check-in; ${plan.lateRefundPercent ?? 0}% refund after that.`;
    case "PARTIAL":
      return lang === "fa" ? `در صورت لغو، ${late}٪ مبلغ پرداختی بازگردانده می‌شود.` : `If you cancel, ${plan.lateRefundPercent ?? 0}% of what you paid is refunded.`;
    case "NON_REFUNDABLE":
      return lang === "fa" ? "غیرقابل استرداد: با لغو، مبلغی بازگردانده نمی‌شود." : "Non-refundable: nothing is refunded if you cancel.";
    default:
      return "";
  }
}

export function paymentTimingSummary(plan: Pick<TravelRatePlanSnapshotDto, "paymentTiming" | "depositPercent"> | null, lang: Lang): string {
  if (!plan || plan.paymentTiming === "PAY_NOW") return lang === "fa" ? "پرداخت کامل هنگام رزرو" : "Pay in full when booking";
  if (plan.paymentTiming === "DEPOSIT") return lang === "fa" ? `پیش‌پرداخت ${localizeDigits(plan.depositPercent ?? 0, lang)}٪، مابقی در محل` : `${plan.depositPercent ?? 0}% deposit now, the rest at the property`;
  return lang === "fa" ? "پرداخت در محل اقامت" : "Pay at the property";
}

/** Only facts the provider stated; unknowns are said to be unknown, never assumed. */
export function policyFacts(p: TravelPetPolicyDto | null, lang: Lang): { label: string; value: string }[] {
  const fa = lang === "fa";
  const NS = fa ? "اعلام نشده" : "Not specified";
  if (!p) return [{ label: fa ? "قوانین حیوانات" : "Pet policy", value: NS }];
  const yesNo = (v: boolean) => (v ? (fa ? "بله" : "Yes") : fa ? "خیر" : "No");
  const kg = (v: number | null) => (v === null ? NS : fa ? `${localizeDigits(v, "fa")} کیلوگرم` : `${v} kg`);
  return [
    { label: fa ? "سگ" : "Dogs", value: yesNo(p.dogsAllowed) },
    { label: fa ? "گربه" : "Cats", value: yesNo(p.catsAllowed) },
    { label: fa ? "سایر حیوانات" : "Other pets", value: yesNo(p.otherAllowed) },
    { label: fa ? "حداکثر تعداد" : "Maximum pets", value: p.maxPets === null ? NS : localizeDigits(p.maxPets, lang) },
    { label: fa ? "حداکثر وزن" : "Maximum weight", value: kg(p.maxWeightKg) },
    { label: fa ? "هزینهٔ حیوان (برای هر حیوان در هر اقامت)" : "Pet fee (per pet, per stay)", value: p.petFeeIrr === null ? NS : p.petFeeIrr === 0 ? (fa ? "رایگان" : "Free") : formatCurrency(p.petFeeIrr, lang) },
    { label: fa ? "ودیعهٔ حیوان" : "Pet deposit", value: p.depositIrr === null ? NS : formatCurrency(p.depositIrr, lang) },
    { label: fa ? "گواهی واکسن" : "Vaccination proof", value: p.vaccinationRequired ? (fa ? "لازم است" : "Required") : fa ? "اعلام نشده" : "Not stated as required" },
    { label: fa ? "گواهی سلامت" : "Health certificate", value: p.healthCertificateRequired ? (fa ? "لازم است" : "Required") : fa ? "اعلام نشده" : "Not stated as required" },
    { label: fa ? "قلاده" : "Leash", value: p.leashRequired ? (fa ? "الزامی در فضاهای عمومی" : "Required in shared areas") : NS },
    { label: fa ? "باکس حمل" : "Carrier", value: p.carrierRequired ? (fa ? "الزامی" : "Required") : NS },
    { label: fa ? "محدودیت نژاد" : "Breed restrictions", value: p.breedRestrictions.length ? p.breedRestrictions.join("، ") : NS },
    { label: fa ? "فضاهای ممنوع" : "Restricted areas", value: p.restrictedAreas ?? NS },
  ];
}

export function stayDates(b: Pick<TravelBookingDto, "checkIn" | "checkOut" | "nights">, lang: Lang): string {
  const n = lang === "fa" ? `${localizeDigits(b.nights, "fa")} شب` : `${b.nights} night${b.nights === 1 ? "" : "s"}`;
  // "،" (not "·") between the date and the night count keeps Persian digit runs from reordering in RTL.
  return `${formatDay(b.checkIn.slice(0, 10), lang, { year: false })} — ${formatDay(b.checkOut.slice(0, 10), lang)}${lang === "fa" ? "، " : " · "}${n}`;
}

export function money(v: number | null | undefined, lang: Lang): string {
  return v === null || v === undefined ? (lang === "fa" ? "—" : "—") : formatCurrency(v, lang);
}

export function ratingText(avg: number | null, count: number, lang: Lang): string {
  if (!count || avg === null) return lang === "fa" ? "هنوز نظری ثبت نشده" : "No reviews yet";
  return lang === "fa" ? `${localizeDigits(avg.toFixed(1), "fa")} از ۵ · ${localizeDigits(count, "fa")} نظر تأییدشده` : `${avg.toFixed(1)} of 5 · ${count} verified review${count === 1 ? "" : "s"}`;
}

export function countdown(msLeft: number, lang: Lang): string {
  const s = Math.max(0, Math.floor(msLeft / 1000));
  const text = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  return localizeDigits(text, lang);
}
