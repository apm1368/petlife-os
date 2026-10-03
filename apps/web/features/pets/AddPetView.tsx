"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { Avatar, Bird, Button, Camera, Cat, Dog, Fish, Input, PawPrint, Rabbit, Rat, Turtle } from "@petlife/ui";
import { NeuteredStatus, PetSex, PetSpecies, WeightUnit } from "@petlife/types";
import { petsService } from "@/services/pets.service";
import { usePetStore } from "@/stores/pet-store";
import { BirthDateField } from "@/features/shared/date-picker/BirthDateField";
import { Stepper } from "@/features/shared/Stepper";
import { formatCount } from "@/lib/number/format-number";
import { SPECIES_LABELS } from "./pet-identity";

const SPECIES: { value: PetSpecies; icon: typeof Dog }[] = [
  { value: PetSpecies.DOG, icon: Dog },
  { value: PetSpecies.CAT, icon: Cat },
  { value: PetSpecies.BIRD, icon: Bird },
  { value: PetSpecies.RABBIT, icon: Rabbit },
  { value: PetSpecies.RODENT, icon: Rat },
  { value: PetSpecies.FISH, icon: Fish },
  { value: PetSpecies.REPTILE, icon: Turtle },
  { value: PetSpecies.OTHER, icon: PawPrint },
];

/** Common breeds offered as suggestions only — the field stays free text, and "unknown / mixed" is always an option. */
const BREEDS: Partial<Record<PetSpecies, { fa: string[]; en: string[] }>> = {
  DOG: {
    fa: ["مخلوط", "اشپیتز (پامرانین)", "ژرمن شپرد", "گلدن رتریور", "لابرادور رتریور", "هاسکی سیبری", "شیتزو", "پودل", "تریر یورکشایر", "پاگ", "سرابی", "عروس هلندی"],
    en: ["Mixed", "Pomeranian (Spitz)", "German Shepherd", "Golden Retriever", "Labrador Retriever", "Siberian Husky", "Shih Tzu", "Poodle", "Yorkshire Terrier", "Pug", "Sarabi", "Keeshond"],
  },
  CAT: {
    fa: ["خانگی (مخلوط)", "پرشین", "اسکاتیش فولد", "بریتیش شورت‌هیر", "سیامی", "مین کون", "رگدال", "اسفینکس", "بنگال"],
    en: ["Domestic (mixed)", "Persian", "Scottish Fold", "British Shorthair", "Siamese", "Maine Coon", "Ragdoll", "Sphynx", "Bengal"],
  },
  BIRD: { fa: ["مرغ عشق", "کاسکو", "عروس هلندی", "قناری", "طوطی برزیلی"], en: ["Budgerigar", "African Grey", "Cockatiel", "Canary", "Conure"] },
  RABBIT: { fa: ["لوپ", "هلندی", "لاین‌هد", "رکس"], en: ["Lop", "Dutch", "Lionhead", "Rex"] },
  RODENT: { fa: ["همستر سوری", "همستر روبروفسکی", "خوکچهٔ هندی", "چینچیلا", "موش صحرایی خانگی"], en: ["Syrian hamster", "Roborovski hamster", "Guinea pig", "Chinchilla", "Fancy rat"] },
};

const COPY = {
  fa: {
    title: "افزودن حیوان",
    intro: "سه قدم کوتاه؛ فقط قدم اول و سن الزامی است و بقیه را بعداً هم می‌توانید کامل کنید.",
    steps: ["هویت", "جزئیات", "شناسنامهٔ سلامت"],
    stepsLabel: "مراحل افزودن حیوان",
    species: "نوع حیوان",
    name: "نام",
    photo: "عکس",
    choosePhoto: "انتخاب عکس",
    replacePhoto: "تغییر عکس",
    removePhoto: "حذف عکس",
    photoHint: "JPG یا PNG، حداکثر ۱۰ مگابایت. عکس روی پروفایل و کارت حیوان دیده می‌شود.",
    photoTooBig: "حجم عکس بیشتر از ۱۰ مگابایت است.",
    sex: "جنسیت",
    sexes: { MALE: "نر", FEMALE: "ماده", UNKNOWN: "نمی‌دانم" },
    birth: "تاریخ تولد",
    noBirth: "تاریخ دقیق را نمی‌دانم؛ سن تقریبی",
    years: "سال",
    months: "ماه",
    breed: "نژاد",
    breedHint: "از پیشنهادها انتخاب کنید یا بنویسید.",
    breedUnknown: "نژاد را نمی‌دانم یا مخلوط است",
    color: "رنگ و نشانه‌های ظاهری",
    colorHint: "مثلاً «سفید با لکهٔ قهوه‌ای روی گوش چپ» — برای پیدا کردن در صورت گم شدن مفید است.",
    weight: "وزن",
    unit: "واحد",
    units: { KG: "کیلوگرم", LB: "پوند" },
    microchip: "شمارهٔ میکروچیپ",
    microchipHint: "معمولاً ۱۵ رقم؛ روی کارت واکسن یا گواهی کاشت آمده است.",
    neutered: "عقیم‌سازی",
    neuteredOptions: { NEUTERED: "عقیم شده", INTACT: "عقیم نشده", UNKNOWN: "نمی‌دانم" },
    healthNote: "این قدم اختیاری است. مدارک و واکسن‌ها را بعد از ذخیره، از پروندهٔ سلامت اضافه کنید.",
    back: "قبلی",
    next: "ادامه",
    skipSave: "رد کردن و ذخیره",
    save: "ذخیرهٔ حیوان",
    saving: "در حال ذخیره…",
    needName: "نام حیوان را بنویسید.",
    needAge: "تاریخ تولد یا سن تقریبی را وارد کنید.",
    failed: "ثبت حیوان انجام نشد. دوباره تلاش کنید.",
    photoFailed: "حیوان ثبت شد، اما عکس بارگذاری نشد؛ می‌توانید از پروفایل دوباره امتحان کنید.",
    preview: "پیش‌نمایش پروفایل",
    unnamed: "نام حیوان",
    noHousehold: "خانوار شما هنوز آماده نیست؛ صفحه را تازه کنید.",
  },
  en: {
    title: "Add a pet",
    intro: "Three short steps — only the first step and an age are required; the rest can wait.",
    steps: ["Identity", "Details", "Health identity"],
    stepsLabel: "Add-a-pet steps",
    species: "Species",
    name: "Name",
    photo: "Photo",
    choosePhoto: "Choose a photo",
    replacePhoto: "Replace photo",
    removePhoto: "Remove photo",
    photoHint: "JPG or PNG, up to 10 MB. Shown on the pet's profile and card.",
    photoTooBig: "The photo is larger than 10 MB.",
    sex: "Sex",
    sexes: { MALE: "Male", FEMALE: "Female", UNKNOWN: "Not sure" },
    birth: "Birth date",
    noBirth: "I don't know the exact date — approximate age",
    years: "Years",
    months: "Months",
    breed: "Breed",
    breedHint: "Pick a suggestion or type your own.",
    breedUnknown: "Unknown or mixed breed",
    color: "Colour and markings",
    colorHint: "For example “white with a brown patch on the left ear” — it helps if they are ever lost.",
    weight: "Weight",
    unit: "Unit",
    units: { KG: "kg", LB: "lb" },
    microchip: "Microchip number",
    microchipHint: "Usually 15 digits; printed on the vaccination card or implant certificate.",
    neutered: "Neutered",
    neuteredOptions: { NEUTERED: "Neutered", INTACT: "Not neutered", UNKNOWN: "Not sure" },
    healthNote: "This step is optional. Add documents and vaccinations from the health record after saving.",
    back: "Back",
    next: "Continue",
    skipSave: "Skip and save",
    save: "Save pet",
    saving: "Saving…",
    needName: "Enter the pet's name.",
    needAge: "Enter a birth date or an approximate age.",
    failed: "We couldn't add this pet. Please try again.",
    photoFailed: "The pet was saved, but the photo didn't upload; you can try again from the profile.",
    preview: "Profile preview",
    unnamed: "Pet's name",
    noHousehold: "Your household isn't ready yet; refresh the page.",
  },
} as const;

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/**
 * Add a pet in three short steps: identity (species, name, photo, sex), details (age, breed, colour)
 * and an optional health identity (weight, microchip, neutered). The pet is created once at the end;
 * the photo then goes through the same signed-upload path as onboarding.
 */
export function AddPetView() {
  const router = useRouter();
  const locale = useLocale() === "en" ? "en" : "fa";
  const c = COPY[locale];
  const fa = locale === "fa";
  const householdId = usePetStore((s) => s.householdId);
  const upsertPet = usePetStore((s) => s.upsertPet);
  const setActivePetId = usePetStore((s) => s.setActivePetId);
  const activePetId = usePetStore((s) => s.activePetId);

  const [step, setStep] = useState(0);
  const [species, setSpecies] = useState<PetSpecies>(PetSpecies.DOG);
  const [name, setName] = useState("");
  const [sex, setSex] = useState<PetSex | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [birthDate, setBirthDate] = useState("");
  const [approximate, setApproximate] = useState(false);
  const [ageYears, setAgeYears] = useState("");
  const [ageMonths, setAgeMonths] = useState("");
  const [breed, setBreed] = useState("");
  const [breedUnknown, setBreedUnknown] = useState(false);
  const [color, setColor] = useState("");
  const [weight, setWeight] = useState("");
  const [unit, setUnit] = useState<WeightUnit>(WeightUnit.KG);
  const [microchip, setMicrochip] = useState("");
  const [neutered, setNeutered] = useState<NeuteredStatus | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  const approxMonths = (Number(toLatin(ageYears)) || 0) * 12 + (Number(toLatin(ageMonths)) || 0);
  const hasAge = approximate ? approxMonths > 0 : Boolean(birthDate);
  const breedOptions = useMemo(() => BREEDS[species]?.[locale] ?? [], [species, locale]);

  function choosePhoto(file: File | undefined) {
    setPhotoError(null);
    if (!file) return;
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError(c.photoTooBig);
      return;
    }
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
  }

  function goNext() {
    setError(null);
    if (step === 0 && !name.trim()) return setError(c.needName);
    if (step === 1 && !hasAge) return setError(c.needAge);
    setStep((s) => Math.min(2, s + 1));
  }

  async function submit() {
    setError(null);
    if (!name.trim()) return setError(c.needName);
    if (!hasAge) return setError(c.needAge);
    if (!householdId) return setError(c.noHousehold);
    setIsSubmitting(true);
    try {
      const pet = await petsService.create(
        householdId,
        {
          name: name.trim(),
          species,
          ...(sex ? { sex } : {}),
          ...(approximate ? { approximateAgeMonths: approxMonths } : { birthDate }),
          ...(!breedUnknown && breed.trim() ? { breed: breed.trim() } : {}),
          ...(color.trim() ? { colorMarkings: color.trim() } : {}),
          ...(Number(toLatin(weight)) > 0 ? { latestWeightValue: Number(toLatin(weight)), latestWeightUnit: unit } : {}),
          ...(microchip.trim() ? { microchipNumber: toLatin(microchip.trim()) } : {}),
          ...(neutered ? { neuteredStatus: neutered } : {}),
        },
        `add-pet-${householdId}-${name.trim()}-${Date.now()}`,
      );
      let saved = pet;
      if (photo) {
        try {
          const target = await petsService.createPhotoUploadUrl(pet.id, photo.type === "image/png" ? "image/png" : "image/jpeg");
          const put = await fetch(target.uploadUrl, { method: "PUT", body: photo, headers: target.headers });
          if (!put.ok) throw new Error(String(put.status));
          saved = await petsService.update(pet.id, { photoUrl: target.publicUrl });
        } catch {
          setError(c.photoFailed);
        }
      }
      upsertPet(saved);
      if (!activePetId) setActivePetId(saved.id);
      router.push(`/${locale}/pets/${saved.id}`);
    } catch {
      setError(c.failed);
      setIsSubmitting(false);
    }
  }

  const SpeciesIcon = SPECIES.find((s) => s.value === species)!.icon;

  return (
    <div className="add-pet-wizard">
      <header className="section-head">
        <div>
          <h1>{c.title}</h1>
          <p>{c.intro}</p>
        </div>
      </header>

      <div className="add-pet-wizard__layout">
        <div className="add-pet-wizard__form">
          <Stepper steps={[...c.steps]} current={step} label={c.stepsLabel} />

          {step === 0 ? (
            <div className="add-pet-wizard__step" key="identity">
              <fieldset className="add-pet-species">
                <legend>{c.species}</legend>
                <div>
                  {SPECIES.map(({ value, icon: Icon }) => (
                    <button key={value} type="button" aria-pressed={species === value} onClick={() => { setSpecies(value); setBreed(""); }}>
                      <Icon size={22} aria-hidden="true" />
                      <span>{SPECIES_LABELS[value]![fa ? 0 : 1]}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
              <Input label={c.name} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
              <div className="add-pet-photo">
                <span className="add-pet-label">{c.photo}</span>
                <div className="add-pet-photo__row">
                  <span className="add-pet-photo__preview">
                    {/* eslint-disable-next-line @next/next/no-img-element -- a local blob: preview of the chosen file, which next/image cannot load */}
                    {photoPreview ? <img src={photoPreview} alt="" /> : <Camera size={26} aria-hidden="true" />}
                  </span>
                  <div className="add-pet-photo__actions">
                    <input ref={fileRef} type="file" accept="image/jpeg,image/png" hidden onChange={(e) => { choosePhoto(e.target.files?.[0]); e.target.value = ""; }} />
                    <Button variant="secondary" onClick={() => fileRef.current?.click()}>{photo ? c.replacePhoto : c.choosePhoto}</Button>
                    {photo ? <Button variant="ghost" onClick={() => { setPhoto(null); setPhotoPreview(null); }}>{c.removePhoto}</Button> : null}
                  </div>
                </div>
                <p className="add-pet-hint">{c.photoHint}</p>
                {photoError ? <p role="alert" className="add-pet-error">{photoError}</p> : null}
              </div>
              <fieldset className="add-pet-segment">
                <legend>{c.sex}</legend>
                <div>
                  {([PetSex.MALE, PetSex.FEMALE, PetSex.UNKNOWN] as const).map((value) => (
                    <button key={value} type="button" aria-pressed={sex === value} onClick={() => setSex(value)}>{c.sexes[value]}</button>
                  ))}
                </div>
              </fieldset>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="add-pet-wizard__step" key="details">
              {approximate ? (
                <div className="add-pet-age">
                  <Input label={c.years} inputMode="numeric" value={ageYears} onChange={(e) => setAgeYears(e.target.value.replace(/[^\d۰-۹]/g, "").slice(0, 2))} />
                  <Input label={c.months} inputMode="numeric" value={ageMonths} onChange={(e) => setAgeMonths(e.target.value.replace(/[^\d۰-۹]/g, "").slice(0, 2))} />
                </div>
              ) : (
                <BirthDateField label={c.birth} value={birthDate} onChange={setBirthDate} />
              )}
              <label className="add-pet-check">
                <input type="checkbox" checked={approximate} onChange={(e) => setApproximate(e.target.checked)} />
                {c.noBirth}
              </label>
              <div className="add-pet-field">
                <Input label={c.breed} list="add-pet-breeds" value={breed} disabled={breedUnknown} onChange={(e) => setBreed(e.target.value)} maxLength={120} />
                <datalist id="add-pet-breeds">{breedOptions.map((b) => <option key={b} value={b} />)}</datalist>
                <p className="add-pet-hint">{c.breedHint}</p>
                <label className="add-pet-check">
                  <input type="checkbox" checked={breedUnknown} onChange={(e) => setBreedUnknown(e.target.checked)} />
                  {c.breedUnknown}
                </label>
              </div>
              <div className="add-pet-field">
                <Input label={c.color} value={color} onChange={(e) => setColor(e.target.value)} maxLength={200} />
                <p className="add-pet-hint">{c.colorHint}</p>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="add-pet-wizard__step" key="health">
              <p className="calm-note">{c.healthNote}</p>
              <div className="add-pet-age">
                <Input label={c.weight} inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value.replace(/[^\d۰-۹.٫]/g, "").slice(0, 6))} />
                <fieldset className="add-pet-segment">
                  <legend>{c.unit}</legend>
                  <div>
                    {([WeightUnit.KG, WeightUnit.LB] as const).map((u) => (
                      <button key={u} type="button" aria-pressed={unit === u} onClick={() => setUnit(u)}>{c.units[u]}</button>
                    ))}
                  </div>
                </fieldset>
              </div>
              <div className="add-pet-field">
                <Input label={c.microchip} inputMode="numeric" dir="ltr" value={microchip} onChange={(e) => setMicrochip(e.target.value.slice(0, 64))} />
                <p className="add-pet-hint">{c.microchipHint}</p>
              </div>
              <fieldset className="add-pet-segment">
                <legend>{c.neutered}</legend>
                <div>
                  {([NeuteredStatus.NEUTERED, NeuteredStatus.INTACT, NeuteredStatus.UNKNOWN] as const).map((v) => (
                    <button key={v} type="button" aria-pressed={neutered === v} onClick={() => setNeutered(v)}>{c.neuteredOptions[v]}</button>
                  ))}
                </div>
              </fieldset>
            </div>
          ) : null}

          {error ? <p role="alert" className="add-pet-error">{error}</p> : null}

          <div className="add-pet-wizard__actions">
            {step > 0 ? <Button variant="ghost" onClick={() => { setError(null); setStep((s) => s - 1); }} disabled={isSubmitting}>{c.back}</Button> : <span />}
            <div>
              {step === 2 ? null : step === 1 ? <Button variant="ghost" onClick={() => void submit()} disabled={isSubmitting || !hasAge}>{c.skipSave}</Button> : null}
              {step < 2 ? (
                <Button variant="primary" onClick={goNext}>{c.next}</Button>
              ) : (
                <Button variant="primary" isLoading={isSubmitting} onClick={() => void submit()}>{isSubmitting ? c.saving : c.save}</Button>
              )}
            </div>
          </div>
        </div>

        <aside className="add-pet-preview" aria-label={c.preview}>
          <p className="add-pet-preview__label">{c.preview}</p>
          <div className="add-pet-preview__card">
            {/* eslint-disable-next-line @next/next/no-img-element -- a local blob: preview of the chosen file, which next/image cannot load */}
            {photoPreview ? <img className="add-pet-preview__photo" src={photoPreview} alt="" /> : <Avatar name={name || "?"} size="lg" />}
            <div>
              <strong>{name.trim() || c.unnamed}</strong>
              <span><SpeciesIcon size={14} aria-hidden="true" /> {[SPECIES_LABELS[species]![fa ? 0 : 1], sex && sex !== "UNKNOWN" ? c.sexes[sex] : null, !breedUnknown && breed.trim() ? breed.trim() : null].filter(Boolean).join(" · ")}</span>
              {approximate && approxMonths > 0 ? <span>{fa ? `حدود ${formatCount(Math.floor(approxMonths / 12), "fa")} سال و ${formatCount(approxMonths % 12, "fa")} ماه` : `About ${Math.floor(approxMonths / 12)}y ${approxMonths % 12}m`}</span> : null}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Persian/Arabic-Indic digits and the Persian decimal mark typed on a Persian keyboard → Latin, before parsing. */
function toLatin(value: string): string {
  return value.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace("٫", ".");
}
