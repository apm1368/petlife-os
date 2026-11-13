// On-screen copy for the one-minute reel "10 searches of dog and cat owners" (countdown 10 → 1).
// Order = relative Google Trends interest (Iran, 12 months to 2026-11-12) of the Persian keyword; ties at the
// bottom are near zero and ordered by autocomplete breadth. Each item names the batch-B article it leads to.
// Subtitles: one short line per scene (≤ 9 words), revealed word by word.
module.exports = {
  items: [
    { rank: 10, article: 28, kw: { fa: "پت تاکسی", en: "pet taxi", de: "Tiertaxi", es: "taxi para mascotas" , ar: "تاكسي الحيوانات الأليفة", nl: "dierentaxi" },
      tip: { fa: "گربه را فقط داخل باکس حمل جابه‌جا کن.", en: "Cats travel in a carrier — every single time.", de: "Katzen reisen immer in der Transportbox.", es: "El gato viaja siempre en su transportín." , ar: "انقل القطة دائمًا داخل صندوق النقل.", nl: "Katten reizen altijd in een reismand." } },
    { rank: 9, article: 27, kw: { fa: "آرایشگاه سگ", en: "dog grooming", de: "Hundefriseur", es: "peluquería canina" , ar: "تجميل الكلاب", nl: "hondentrimsalon" },
      tip: { fa: "موی دولایه را در تابستان نتراش؛ برس بزن.", en: "Don't shave a double coat. Brush it instead.", de: "Doppeltes Fell nicht scheren – lieber bürsten.", es: "No rapes un manto doble: cepíllalo." , ar: "لا تحلق الفرو المزدوج صيفًا؛ مشّطه.", nl: "Een dubbele vacht niet scheren, maar borstelen." } },
    { rank: 8, article: 29, kw: { fa: "مربی سگ", en: "dog trainer", de: "Hundetrainer", es: "adiestrador canino" , ar: "مدرب كلاب", nl: "hondentrainer" },
      tip: { fa: "مربی خوب با تشویق آموزش می‌دهد، نه تنبیه.", en: "Good trainers reward. They never punish.", de: "Gute Trainer belohnen, statt zu strafen.", es: "Un buen adiestrador premia, no castiga." , ar: "المدرب الجيد يكافئ ولا يعاقب.", nl: "Goede trainers belonen en straffen nooit." } },
    { rank: 7, article: 26, kw: { fa: "پانسیون سگ", en: "dog boarding", de: "Hundepension", es: "residencia canina" , ar: "فندق الكلاب", nl: "hondenpension" },
      tip: { fa: "قبل از سپردن، حتماً از پانسیون بازدید کن.", en: "Visit the boarding place before you book.", de: "Schau dir die Tierpension vorher an.", es: "Visita la residencia antes de reservar." , ar: "زر الفندق بنفسك قبل أن تحجز.", nl: "Bezoek het pension voordat je boekt." } },
    { rank: 6, article: 24, kw: { fa: "غذای خشک سگ", en: "dry dog food", de: "Trockenfutter Hund", es: "pienso para perros" , ar: "طعام جاف للكلاب", nl: "droogvoer hond" },
      tip: { fa: "غذا را با سن، اندازه و تحرک سگ بسنج.", en: "Match food to age, size and activity.", de: "Futter passend zu Alter, Größe und Aktivität.", es: "Elige según edad, tamaño y actividad." , ar: "اختر الطعام حسب العمر والحجم والنشاط.", nl: "Kies voer op leeftijd, formaat en activiteit." } },
    { rank: 5, article: 30, kw: { fa: "بیمه حیوانات خانگی", en: "pet insurance", de: "Tierversicherung", es: "seguro para mascotas" , ar: "تأمين الحيوانات الأليفة", nl: "huisdierenverzekering" },
      tip: { fa: "قبل از امضا، استثناهای بیمه‌نامه را بخوان.", en: "Read the exclusions before you sign.", de: "Lies die Ausschlüsse, bevor du unterschreibst.", es: "Lee las exclusiones antes de firmar." , ar: "اقرأ الاستثناءات قبل أن توقّع.", nl: "Lees de uitsluitingen voordat je tekent." } },
    { rank: 4, article: 21, kw: { fa: "دامپزشکی شبانه‌روزی", en: "24-hour vet", de: "Tierarzt Notdienst", es: "veterinario 24 horas" , ar: "طبيب بيطري 24 ساعة", nl: "dierenarts 24 uur" },
      tip: { fa: "شمارهٔ دامپزشکی شبانه‌روزی را از امروز ذخیره کن.", en: "Save your nearest 24-hour vet's number today.", de: "Speichere heute die Nummer des Notdienstes.", es: "Guarda hoy el número del veterinario 24 h." , ar: "احفظ اليوم رقم أقرب طبيب بيطري طوارئ.", nl: "Sla vandaag het nummer van de spoeddierenarts op." } },
    { rank: 3, article: 23, kw: { fa: "غذای خشک گربه", en: "dry cat food", de: "Trockenfutter Katze", es: "pienso para gatos" , ar: "طعام جاف للقطط", nl: "droogvoer kat" },
      tip: { fa: "کنار غذای خشک، آب تازه همیشه در دسترس باشد.", en: "Dry food? Keep fresh water within reach.", de: "Zum Trockenfutter immer frisches Wasser.", es: "Con pienso, agua fresca siempre a mano." , ar: "مع الطعام الجاف، وفّر ماءً عذبًا دائمًا.", nl: "Droogvoer? Zorg altijd voor vers water." } },
    { rank: 2, article: 25, kw: { fa: "خاک گربه", en: "cat litter", de: "Katzenstreu", es: "arena para gatos" , ar: "رمل القطط", nl: "kattenbakvulling" },
      tip: { fa: "هر روز خاک را تمیز کن؛ یک ظرف اضافه بگذار.", en: "Scoop daily. One more box than cats.", de: "Täglich reinigen. Ein Klo mehr als Katzen.", es: "Limpia a diario. Un arenero más que gatos." , ar: "نظّف الرمل يوميًا، وأضف صندوقًا إضافيًا.", nl: "Dagelijks scheppen. Eén bak meer dan katten." } },
    { rank: 1, article: 22, kw: { fa: "پت شاپ", en: "pet shop", de: "Zoohandlung", es: "tienda de mascotas" , ar: "متجر الحيوانات الأليفة", nl: "dierenwinkel" },
      tip: { fa: "قبل از خرید، تاریخ انقضا و پلمب را چک کن.", en: "Check expiry date and seal before buying.", de: "Vor dem Kauf: Haltbarkeit und Siegel prüfen.", es: "Antes de comprar, revisa caducidad y precinto." , ar: "تحقّق من تاريخ الانتهاء والختم قبل الشراء.", nl: "Check houdbaarheid en verzegeling vóór aankoop." } },
  ],
  hook: {
    fa: { q: "صاحبان سگ و گربه در گوگل چه می‌پرسند؟", count: "۱۰ جست‌وجو، تا شمارهٔ ۱", note: "ترتیب: Google Trends ایران · ۱۲ ماه اخیر" },
    en: { q: "What do dog and cat owners Google?", count: "10 searches, counting down to #1", note: "Order: Google Trends, Iran · last 12 months" },
    de: { q: "Was googeln Hunde- und Katzenhalter?", count: "10 Suchanfragen – bis Platz 1", note: "Reihenfolge: Google Trends, Iran · 12 Monate" },
    es: { q: "¿Qué buscan en Google los dueños de perros y gatos?", count: "10 búsquedas, hasta el número 1", note: "Orden: Google Trends, Irán · últimos 12 meses" },
    ar: { q: "ماذا يبحث أصحاب الكلاب والقطط في Google؟", count: "10 عمليات بحث، حتى المركز الأول", note: "الترتيب: Google Trends، إيران · آخر 12 شهرًا" },
    nl: { q: "Wat googelen hond- en katteneigenaren?", count: "10 zoekopdrachten, aftellend naar nr. 1", note: "Volgorde: Google Trends, Iran · afgelopen 12 maanden" },
  },
  recap: { fa: "۱۰ جست‌وجو در یک نگاه", en: "All 10 at a glance", de: "Alle 10 auf einen Blick", es: "Las 10 de un vistazo", ar: "العشرة في لمحة", nl: "Alle 10 in één oogopslag" },
  cta: {
    fa: { line: "راهنمای کامل هر ۱۰ مورد در وبلاگ اپت‌لایف", button: "opetlife.ir", share: "ذخیره کن و برای یک صاحب پت بفرست" },
    en: { line: "Full guides to all 10 on the opetlife blog", button: "opetlife.ir", share: "Save it and send it to a pet parent" },
    de: { line: "Ausführliche Ratgeber zu allen 10 im opetlife-Blog", button: "opetlife.ir", share: "Speichern und an Tierfreunde schicken" },
    es: { line: "Guías completas de las 10 en el blog de opetlife", button: "opetlife.ir", share: "Guárdalo y compártelo con quien tenga mascota" },
    ar: { line: "أدلة كاملة للعشرة في مدونة opetlife", button: "opetlife.ir", share: "احفظه وأرسله لصاحب حيوان أليف" },
    nl: { line: "Uitgebreide gidsen over alle 10 op de opetlife-blog", button: "opetlife.ir", share: "Bewaar het en stuur het door naar een baasje" },
  },
  rankLabel: { fa: "رتبهٔ", en: "No.", de: "Platz", es: "N.º", ar: "رقم", nl: "Nr." },
};
