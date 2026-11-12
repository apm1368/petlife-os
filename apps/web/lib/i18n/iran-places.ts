import type { RouteLocale } from "@/lib/i18n/config";

/**
 * Display names for Iran's provinces and the main cities, for text people typed in Persian
 * (travel listings, support needs, clinic locations, the OSM seed). Stored values never change:
 * links and filters keep the original text, only what the reader sees is localized. Anything not
 * in the table is shown exactly as it was entered.
 */
type Names = { en: string; ar: string; de?: string; es?: string; nl?: string };

const PLACES: Record<string, Names> = {
  // Provinces (31)
  "تهران": { en: "Tehran", ar: "طهران", de: "Teheran", es: "Teherán", nl: "Teheran" },
  "البرز": { en: "Alborz", ar: "ألبرز" },
  "اصفهان": { en: "Isfahan", ar: "أصفهان", es: "Isfahán" },
  "فارس": { en: "Fars", ar: "فارس" },
  "خراسان رضوی": { en: "Razavi Khorasan", ar: "خراسان رضوي", de: "Razavi-Chorasan", es: "Jorasán Razaví", nl: "Razavi-Khorasan" },
  "خراسان شمالی": { en: "North Khorasan", ar: "خراسان الشمالية", de: "Nord-Chorasan", es: "Jorasán del Norte", nl: "Noord-Khorasan" },
  "خراسان جنوبی": { en: "South Khorasan", ar: "خراسان الجنوبية", de: "Süd-Chorasan", es: "Jorasán del Sur", nl: "Zuid-Khorasan" },
  "آذربایجان شرقی": { en: "East Azerbaijan", ar: "أذربيجان الشرقية", de: "Ost-Aserbaidschan", es: "Azerbaiyán Oriental", nl: "Oost-Azerbeidzjan" },
  "آذربایجان غربی": { en: "West Azerbaijan", ar: "أذربيجان الغربية", de: "West-Aserbaidschan", es: "Azerbaiyán Occidental", nl: "West-Azerbeidzjan" },
  "اردبیل": { en: "Ardabil", ar: "أردبيل", es: "Ardebil" },
  "زنجان": { en: "Zanjan", ar: "زنجان", de: "Sandschan", es: "Zanyán" },
  "قزوین": { en: "Qazvin", ar: "قزوين", es: "Qazvín" },
  "قم": { en: "Qom", ar: "قم", de: "Ghom" },
  "مرکزی": { en: "Markazi", ar: "المركزية", es: "Markazí" },
  "همدان": { en: "Hamadan", ar: "همدان", es: "Hamadán" },
  "کردستان": { en: "Kurdistan", ar: "كردستان", es: "Kurdistán", nl: "Koerdistan" },
  "کرمانشاه": { en: "Kermanshah", ar: "كرمانشاه", de: "Kermanschah" },
  "ایلام": { en: "Ilam", ar: "إيلام" },
  "لرستان": { en: "Lorestan", ar: "لرستان", es: "Lorestán" },
  "خوزستان": { en: "Khuzestan", ar: "خوزستان", de: "Chuzestan", es: "Juzestán" },
  "چهارمحال و بختیاری": { en: "Chaharmahal and Bakhtiari", ar: "جهارمحال وبختياري", de: "Tschahar Mahal und Bachtiyari", es: "Chahar Mahal y Bajtiarí", nl: "Chaharmahal en Bakhtiari" },
  "کهگیلویه و بویراحمد": { en: "Kohgiluyeh and Boyer-Ahmad", ar: "كهكيلويه وبوير أحمد", de: "Kohgiluye und Boyer Ahmad", es: "Kohkiluyeh y Boyer Ahmad", nl: "Kohgiluyeh en Boyer-Ahmad" },
  "بوشهر": { en: "Bushehr", ar: "بوشهر", de: "Buschehr" },
  "هرمزگان": { en: "Hormozgan", ar: "هرمزكان", es: "Hormozgán" },
  "کرمان": { en: "Kerman", ar: "كرمان", es: "Kermán" },
  "سیستان و بلوچستان": { en: "Sistan and Baluchestan", ar: "سيستان وبلوشستان", de: "Sistan und Belutschistan", es: "Sistán y Baluchistán", nl: "Sistan en Beloetsjistan" },
  "یزد": { en: "Yazd", ar: "يزد" },
  "سمنان": { en: "Semnan", ar: "سمنان", es: "Semnán" },
  "مازندران": { en: "Mazandaran", ar: "مازندران", de: "Masandaran", es: "Mazandarán" },
  "گلستان": { en: "Golestan", ar: "كلستان", es: "Golestán" },
  "گیلان": { en: "Gilan", ar: "جيلان", es: "Guilán" },
  // Main cities (province capitals that differ from the province name, plus the OSM seed list)
  "کرج": { en: "Karaj", ar: "كرج" },
  "مشهد": { en: "Mashhad", ar: "مشهد", de: "Maschhad" },
  "شیراز": { en: "Shiraz", ar: "شيراز", de: "Schiras" },
  "تبریز": { en: "Tabriz", ar: "تبريز", de: "Täbris" },
  "اهواز": { en: "Ahvaz", ar: "الأهواز" },
  "رشت": { en: "Rasht", ar: "رشت", de: "Rascht" },
  "کیش": { en: "Kish", ar: "كيش" },
  "ارومیه": { en: "Urmia", ar: "أرومية", es: "Urmía" },
  "بندرعباس": { en: "Bandar Abbas", ar: "بندر عباس" },
  "ساری": { en: "Sari", ar: "ساري" },
  "گرگان": { en: "Gorgan", ar: "جرجان" },
  "اراک": { en: "Arak", ar: "أراك" },
  "زاهدان": { en: "Zahedan", ar: "زاهدان", es: "Zahedán" },
  "سنندج": { en: "Sanandaj", ar: "سنندج", de: "Sanandadsch" },
  "خرم‌آباد": { en: "Khorramabad", ar: "خرم آباد", de: "Chorramabad", es: "Jorramabad" },
  "بیرجند": { en: "Birjand", ar: "بيرجند", de: "Birdschand" },
  "بجنورد": { en: "Bojnurd", ar: "بجنورد", de: "Bodschnurd" },
  "شهرکرد": { en: "Shahrekord", ar: "شهركرد", de: "Schahr-e Kord" },
  "یاسوج": { en: "Yasuj", ar: "ياسوج", de: "Yasudsch" },
  "کاشان": { en: "Kashan", ar: "كاشان", de: "Kaschan" },
  "قشم": { en: "Qeshm", ar: "قشم", de: "Gheschm" },
  "رامسر": { en: "Ramsar", ar: "رامسر" },
  "چالوس": { en: "Chalus", ar: "جالوس", de: "Tschalus" },
};

/** Persian spelling variants people type (Arabic yeh/kaf, a plain space instead of the zero-width non-joiner, extra spaces). */
function normalize(name: string): string {
  return name.replace(/ي/g, "ی").replace(/ك/g, "ک").replace(/‌/g, " ").replace(/\s+/g, " ").trim();
}

const INDEX = new Map(Object.entries(PLACES).map(([fa, names]) => [normalize(fa), names]));

export function placeName(name: string | null | undefined, locale: RouteLocale): string {
  if (!name) return "";
  if (locale === "fa") return name;
  const names = INDEX.get(normalize(name));
  if (!names) return name;
  return locale === "en" ? names.en : locale === "ar" ? names.ar : names[locale] ?? names.en;
}

const PERSIAN_SCRIPT = /[؀-ۿ]/;

/**
 * Text a partner typed in Persian (an insurer's coverage summary, a clinic's note) cannot be translated
 * faithfully on the fly. Outside fa it is marked as Persian, so screen readers switch voice and the
 * line runs right-to-left, and the page says where it came from.
 */
export function persianSourceProps(text: string | null | undefined, locale: RouteLocale): { lang?: "fa"; dir?: "rtl" } {
  return locale !== "fa" && text && PERSIAN_SCRIPT.test(text) ? { lang: "fa", dir: "rtl" } : {};
}

const REVERSE = new Map<string, string>();
for (const [fa, names] of Object.entries(PLACES)) {
  for (const n of [names.en, names.ar, names.de, names.es, names.nl]) if (n) REVERSE.set(n.toLocaleLowerCase("en"), fa);
}

/** A place name someone typed in any UI language ("Tehran", "Teherán") → the Persian value stored in listings, for search filters. */
export function placeQuery(input: string): string {
  const q = input.trim();
  return REVERSE.get(q.toLocaleLowerCase("en")) ?? q;
}
