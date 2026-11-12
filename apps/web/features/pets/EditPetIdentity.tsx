"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar, Button, Camera, Input } from "@petlife/ui";
import { NeuteredStatus, PetSex, WeightUnit, type PetDto } from "@petlife/types";
import { petsService } from "@/services/pets.service";
import { BirthDateField } from "@/features/shared/date-picker/BirthDateField";

const COPY = {
  fa: {
    title: "ویرایش مشخصات",
    photo: "عکس",
    choose: "انتخاب عکس",
    replace: "تغییر عکس",
    remove: "حذف عکس",
    photoHint: "JPG، PNG یا WebP، حداکثر ۱۰ مگابایت.",
    tooBig: "حجم عکس بیشتر از ۱۰ مگابایت است.",
    name: "نام",
    sex: "جنسیت",
    sexes: { MALE: "نر", FEMALE: "ماده", UNKNOWN: "نمی‌دانم" },
    birth: "تاریخ تولد",
    breed: "نژاد",
    color: "رنگ و نشانه‌های ظاهری",
    weight: "وزن",
    units: { KG: "کیلوگرم", LB: "پوند" },
    microchip: "شمارهٔ میکروچیپ",
    neutered: "عقیم‌سازی",
    neuteredOptions: { NEUTERED: "عقیم شده", INTACT: "عقیم نشده", UNKNOWN: "نمی‌دانم" },
    cancel: "انصراف",
    save: "ذخیره",
    failed: "ذخیره انجام نشد. دوباره تلاش کنید.",
    photoFailed: "عکس بارگذاری نشد؛ هیچ‌کدام از تغییرها ذخیره نشد. دوباره تلاش کنید.",
  },
  en: {
    title: "Edit details",
    photo: "Photo",
    choose: "Choose a photo",
    replace: "Replace photo",
    remove: "Remove photo",
    photoHint: "JPG, PNG or WebP, up to 10 MB.",
    tooBig: "The photo is larger than 10 MB.",
    name: "Name",
    sex: "Sex",
    sexes: { MALE: "Male", FEMALE: "Female", UNKNOWN: "Not sure" },
    birth: "Birth date",
    breed: "Breed",
    color: "Colour and markings",
    weight: "Weight",
    units: { KG: "kg", LB: "lb" },
    microchip: "Microchip number",
    neutered: "Neutered",
    neuteredOptions: { NEUTERED: "Neutered", INTACT: "Not neutered", UNKNOWN: "Not sure" },
    cancel: "Cancel",
    save: "Save",
    failed: "Saving didn't work. Please try again.",
    photoFailed: "The photo didn't upload, so none of the changes were saved. Please try again.",
  },
  de: {
    title: "Angaben bearbeiten", photo: "Foto", choose: "Foto auswählen", replace: "Foto ändern", remove: "Foto entfernen", photoHint: "JPG, PNG oder WebP, höchstens 10 MB.", tooBig: "Das Foto ist größer als 10 MB.", name: "Name", sex: "Geschlecht", sexes: { MALE: "Männlich", FEMALE: "Weiblich", UNKNOWN: "Nicht sicher" }, birth: "Geburtsdatum", breed: "Rasse", color: "Farbe und besondere Merkmale", weight: "Gewicht", units: { KG: "kg", LB: "lb" }, microchip: "Mikrochipnummer", neutered: "Kastrationsstatus", neuteredOptions: { NEUTERED: "Kastriert", INTACT: "Nicht kastriert", UNKNOWN: "Nicht bekannt" }, cancel: "Abbrechen", save: "Speichern", failed: "Speichern fehlgeschlagen. Bitte versuchen Sie es erneut.", photoFailed: "Das Foto konnte nicht hochgeladen werden; es wurden keine Änderungen gespeichert. Bitte versuchen Sie es erneut.",
  },
  es: {
    title: "Editar datos", photo: "Foto", choose: "Elegir una foto", replace: "Cambiar foto", remove: "Quitar foto", photoHint: "JPG, PNG o WebP, hasta 10 MB.", tooBig: "La foto supera los 10 MB.", name: "Nombre", sex: "Sexo", sexes: { MALE: "Macho", FEMALE: "Hembra", UNKNOWN: "No lo sé" }, birth: "Fecha de nacimiento", breed: "Raza", color: "Color y marcas", weight: "Peso", units: { KG: "kg", LB: "lb" }, microchip: "Número de microchip", neutered: "Esterilización", neuteredOptions: { NEUTERED: "Esterilizada", INTACT: "No esterilizada", UNKNOWN: "No lo sé" }, cancel: "Cancelar", save: "Guardar", failed: "No se pudo guardar. Inténtalo de nuevo.", photoFailed: "No se pudo subir la foto; no se guardó ningún cambio. Inténtalo de nuevo.",
  },
  ar: {
    title: "تعديل البيانات", photo: "الصورة", choose: "اختر صورة", replace: "استبدال الصورة", remove: "إزالة الصورة", photoHint: "JPG أو PNG أو WebP، حتى 10 ميغابايت.", tooBig: "حجم الصورة أكبر من 10 ميغابايت.", name: "الاسم", sex: "الجنس", sexes: { MALE: "ذكر", FEMALE: "أنثى", UNKNOWN: "غير متأكد" }, birth: "تاريخ الميلاد", breed: "السلالة", color: "اللون والعلامات", weight: "الوزن", units: { KG: "كغ", LB: "رطل" }, microchip: "رقم الشريحة الإلكترونية", neutered: "التعقيم", neuteredOptions: { NEUTERED: "معقّم", INTACT: "غير معقّم", UNKNOWN: "غير متأكد" }, cancel: "إلغاء", save: "حفظ", failed: "تعذّر الحفظ. حاول مرة أخرى.", photoFailed: "لم تُرفع الصورة، لذا لم يُحفظ أي من التغييرات. حاول مرة أخرى.",
  },
  nl: {
    title: "Gegevens bewerken", photo: "Foto", choose: "Kies een foto", replace: "Foto vervangen", remove: "Foto verwijderen", photoHint: "JPG, PNG of WebP, maximaal 10 MB.", tooBig: "De foto is groter dan 10 MB.", name: "Naam", sex: "Geslacht", sexes: { MALE: "Mannetje", FEMALE: "Vrouwtje", UNKNOWN: "Weet ik niet" }, birth: "Geboortedatum", breed: "Ras", color: "Kleur en aftekening", weight: "Gewicht", units: { KG: "kg", LB: "lb" }, microchip: "Chipnummer", neutered: "Gesteriliseerd", neuteredOptions: { NEUTERED: "Gesteriliseerd", INTACT: "Niet gesteriliseerd", UNKNOWN: "Weet ik niet" }, cancel: "Annuleren", save: "Opslaan", failed: "Opslaan is niet gelukt. Probeer het opnieuw.", photoFailed: "De foto is niet geüpload, dus er zijn geen wijzigingen opgeslagen. Probeer het opnieuw.",
  },
} as const;

const toLatin = (v: string) => v.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace("٫", ".");

/**
 * The pet's identity in one form — the same fields as adding a pet, prefilled. The photo is uploaded
 * through the signed pet-photo path and only then attached; "remove" clears it.
 */
export function EditPetIdentity({ pet, locale, onCancel, onSaved }: { pet: PetDto; locale: keyof typeof COPY; onCancel: () => void; onSaved: (pet: PetDto) => void }) {
  const c = COPY[locale];
  const [name, setName] = useState(pet.name);
  const [sex, setSex] = useState<PetSex | null>(pet.sex ?? null);
  const [birthDate, setBirthDate] = useState(pet.birthDate?.slice(0, 10) ?? "");
  const [breed, setBreed] = useState(pet.breed ?? "");
  const [color, setColor] = useState(pet.colorMarkings ?? "");
  const [weight, setWeight] = useState(pet.latestWeightValue !== null && pet.latestWeightValue !== undefined ? String(Number(pet.latestWeightValue)) : "");
  const [unit, setUnit] = useState<WeightUnit>((pet.latestWeightUnit as WeightUnit | null) ?? WeightUnit.KG);
  const [microchip, setMicrochip] = useState(pet.microchipNumber ?? "");
  const [neutered, setNeutered] = useState<NeuteredStatus | null>((pet.neuteredStatus as NeuteredStatus | null) ?? null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(pet.photoUrl ?? null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    if (photo && preview) URL.revokeObjectURL(preview);
  }, [photo, preview]);

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      let nextPhotoUrl: string | null | undefined;
      if (photo) {
        const contentType = photo.type === "image/png" || photo.type === "image/webp" ? photo.type : "image/jpeg";
        const target = await petsService.createPhotoUploadUrl(pet.id, contentType);
        const put = await fetch(target.uploadUrl, { method: "PUT", body: photo, headers: target.headers });
        if (!put.ok) throw new Error(String(put.status));
        nextPhotoUrl = target.publicUrl;
      } else if (removePhoto) {
        nextPhotoUrl = null;
      }
      const updated = await petsService.update(pet.id, {
        name: name.trim(),
        sex,
        breed: breed.trim() || null,
        colorMarkings: color.trim() || null,
        microchipNumber: microchip.trim() ? toLatin(microchip.trim()) : null,
        neuteredStatus: neutered,
        ...(birthDate ? { birthDate } : {}),
        ...(Number(toLatin(weight)) > 0 ? { latestWeightValue: Number(toLatin(weight)), latestWeightUnit: unit } : weight.trim() === "" ? { latestWeightValue: null, latestWeightUnit: null } : {}),
        ...(nextPhotoUrl !== undefined ? { photoUrl: nextPhotoUrl } : {}),
      });
      onSaved(updated);
    } catch {
      setMessage(photo ? c.photoFailed : c.failed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="pet-edit" aria-labelledby="pet-edit-title">
      <header className="section-head"><div><h1 id="pet-edit-title">{c.title}</h1></div></header>
      <div className="pet-edit__grid">
        <div className="add-pet-photo">
          <span className="add-pet-label">{c.photo}</span>
          <div className="add-pet-photo__row">
            {/* eslint-disable-next-line @next/next/no-img-element -- a local blob: preview of the chosen file, which next/image cannot load */}
            <span className="add-pet-photo__preview">{preview && !removePhoto ? <img src={preview} alt="" /> : name ? <Avatar name={name} size="lg" /> : <Camera size={26} aria-hidden="true" />}</span>
            <div className="add-pet-photo__actions">
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                if (file.size > 10 * 1024 * 1024) return setMessage(c.tooBig);
                setPhoto(file);
                setRemovePhoto(false);
                setPreview(URL.createObjectURL(file));
              }} />
              <Button variant="secondary" onClick={() => fileRef.current?.click()}>{preview && !removePhoto ? c.replace : c.choose}</Button>
              {preview && !removePhoto ? <Button variant="ghost" onClick={() => { setPhoto(null); setRemovePhoto(true); }}>{c.remove}</Button> : null}
            </div>
          </div>
          <p className="add-pet-hint">{c.photoHint}</p>
        </div>
        <Input label={c.name} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        <fieldset className="add-pet-segment">
          <legend>{c.sex}</legend>
          <div>{([PetSex.MALE, PetSex.FEMALE, PetSex.UNKNOWN] as const).map((v) => <button key={v} type="button" aria-pressed={sex === v} onClick={() => setSex(v)}>{c.sexes[v]}</button>)}</div>
        </fieldset>
        <BirthDateField label={c.birth} value={birthDate} onChange={setBirthDate} />
        <Input label={c.breed} value={breed} onChange={(e) => setBreed(e.target.value)} maxLength={120} />
        <Input label={c.color} value={color} onChange={(e) => setColor(e.target.value)} maxLength={200} />
        <div className="add-pet-age">
          <Input label={c.weight} inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value.replace(/[^\d۰-۹.٫]/g, "").slice(0, 6))} />
          <fieldset className="add-pet-segment">
            <legend className="sr-only">{c.weight}</legend>
            <div>{([WeightUnit.KG, WeightUnit.LB] as const).map((u) => <button key={u} type="button" aria-pressed={unit === u} onClick={() => setUnit(u)}>{c.units[u]}</button>)}</div>
          </fieldset>
        </div>
        <Input label={c.microchip} inputMode="numeric" dir="ltr" value={microchip} onChange={(e) => setMicrochip(e.target.value.slice(0, 64))} />
        <fieldset className="add-pet-segment">
          <legend>{c.neutered}</legend>
          <div>{([NeuteredStatus.NEUTERED, NeuteredStatus.INTACT, NeuteredStatus.UNKNOWN] as const).map((v) => <button key={v} type="button" aria-pressed={neutered === v} onClick={() => setNeutered(v)}>{c.neuteredOptions[v]}</button>)}</div>
        </fieldset>
      </div>
      {message ? <p role="alert" className="add-pet-error">{message}</p> : null}
      <div className="add-pet-wizard__actions">
        <Button variant="ghost" onClick={onCancel}>{c.cancel}</Button>
        <Button variant="primary" isLoading={saving} disabled={!name.trim()} onClick={() => void save()}>{c.save}</Button>
      </div>
    </section>
  );
}
