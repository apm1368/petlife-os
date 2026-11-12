import type { Metadata } from "next";
import { isRouteLocale, locales, type RouteLocale } from "@/lib/i18n/config";
import { OG_LOCALE, SITE_NAME, SITE_ORIGIN, SITE_SHARE_IMAGE_PATH, localeHomePath } from "./site";

export { SITE_ORIGIN };

type Copy = Record<RouteLocale, { title: string; description: string }>;

const pages = {
  home: {
    path: "",
    indexable: true,
    copy: {
      fa: { title: "اپت‌لایف؛ یک دنیا برای تو و همراهت", description: "خدمات و ابزارهای نگهداری از حیوانات خانگی، در یک اپلیکیشن." },
      en: { title: "Opetlife | A world for you and your companion", description: "Pet care, services and useful tools for life with your companion in one place." },
      de: { title: "opetlife | Eine Welt für dich und dein Tier", description: "Tierpflege, Services und praktische Werkzeuge für das Leben mit deinem Tier an einem Ort." },
      es: { title: "opetlife | Un mundo para ti y tu compañero", description: "Cuidados, servicios y herramientas para compartir la vida con tu mascota en un solo lugar." },
      ar: { title: "Opetlife | عالم لك ولرفيقك", description: "رعاية الحيوانات الأليفة والخدمات والأدوات المفيدة لحياتك مع رفيقك في مكان واحد." },
      nl: {
        title: "Opetlife | Een wereld voor jou en je maatje",
        description: "Huisdierzorg, diensten en handige tools voor het leven met je maatje, op één plek."
      },
    },
  },
  services: {
    path: "services",
    indexable: true,
    copy: {
      fa: { title: "خدمات حیوانات خانگی | اپت‌لایف", description: "خدمات و ارائه‌دهندگان مرتبط با حیوانات خانگی را ببینید و جزئیات و زمان‌های قابل رزرو را پیش از ثبت درخواست بررسی کنید." },
      en: { title: "Pet services | Opetlife", description: "Explore services for pets and review provider details and available times before requesting a booking." },
      de: { title: "Services für Haustiere | opetlife", description: "Entdecke Services für Haustiere und prüfe Anbieter sowie verfügbare Zeiten vor einer Buchungsanfrage." },
      es: { title: "Servicios para mascotas | opetlife", description: "Explora servicios para mascotas y consulta los datos del proveedor y los horarios disponibles antes de solicitar una reserva." },
      ar: {
        title: "خدمات الحيوانات الأليفة | Opetlife",
        description: "استكشف خدمات الحيوانات الأليفة وراجع تفاصيل مقدمي الخدمة والمواعيد المتاحة قبل طلب الحجز."
      },
      nl: {
        title: "Diensten voor huisdieren | Opetlife",
        description: "Ontdek diensten voor huisdieren en bekijk gegevens en beschikbare tijden van aanbieders voordat je een boeking aanvraagt."
      },
    },
  },
  community: {
    path: "community",
    indexable: true,
    copy: {
      fa: { title: "جامعهٔ اپت‌لایف | گفتگو دربارهٔ حیوانات خانگی", description: "گفتگوها و نوشته‌های عمومی جامعهٔ اپت‌لایف دربارهٔ زندگی با حیوانات خانگی." },
      en: { title: "Opetlife community | Pet conversations", description: "Public conversations from the Opetlife community about life with pets." },
      de: { title: "opetlife Community | Austausch über Haustiere", description: "Öffentliche Beiträge der opetlife Community rund um das Leben mit Haustieren." },
      es: { title: "Comunidad opetlife | Conversaciones sobre mascotas", description: "Conversaciones públicas de la comunidad opetlife sobre la vida con mascotas." },
      ar: { title: "مجتمع Opetlife | محادثات عن الحيوانات الأليفة", description: "محادثات عامة من مجتمع Opetlife حول الحياة مع الحيوانات الأليفة." },
      nl: {
        title: "Opetlife-community | Gesprekken over huisdieren",
        description: "Openbare gesprekken uit de Opetlife-community over het leven met huisdieren."
      },
    },
  },
  lostPets: {
    path: "lost-pets",
    indexable: true,
    copy: {
      fa: { title: "حیوانات گمشده | اپت‌لایف", description: "گزارش‌های عمومی حیوانات گمشده و پیدا‌شده را ببینید؛ اطلاعات تماس و مکان فقط طبق تنظیمات حریم خصوصی نمایش داده می‌شوند." },
      en: { title: "Lost pets | Opetlife", description: "View public lost-and-found pet reports. Contact and location details are shown only according to privacy settings." },
      de: { title: "Vermisste Haustiere | opetlife", description: "Sieh öffentliche Vermisst- und Fundmeldungen. Kontakt- und Standortangaben erscheinen nur gemäß den Datenschutzeinstellungen." },
      es: { title: "Mascotas perdidas | opetlife", description: "Consulta avisos públicos de mascotas perdidas y encontradas. Los datos de contacto y ubicación dependen de la configuración de privacidad." },
      ar: {
        title: "الحيوانات الأليفة المفقودة | Opetlife",
        description: "اعرض البلاغات العامة عن الحيوانات الأليفة المفقودة والمعثور عليها. تُعرض تفاصيل التواصل والموقع وفق إعدادات الخصوصية فقط."
      },
      nl: {
        title: "Vermiste huisdieren | Opetlife",
        description: "Bekijk openbare meldingen van vermiste en gevonden huisdieren. Contact- en locatiegegevens worden alleen getoond volgens de privacyinstellingen."
      },
    },
  },
  animalSupport: {
    path: "animal-support",
    indexable: true,
    copy: {
      fa: { title: "حمایت از حیوانات | اپت‌لایف", description: "نیازها و سازمان‌های حمایت از حیوانات را در اپت‌لایف ببینید." },
      en: { title: "Animal support | Opetlife", description: "Explore animal-support needs and organizations listed on Opetlife." },
      de: { title: "Tierschutz | opetlife", description: "Entdecke Unterstützungsbedarfe und Organisationen für Tiere auf opetlife." },
      es: { title: "Apoyo animal | opetlife", description: "Consulta necesidades y organizaciones de apoyo animal en opetlife." },
      ar: { title: "دعم الحيوانات | Opetlife", description: "استكشف احتياجات دعم الحيوانات والمنظمات المدرجة في Opetlife." },
      nl: { title: "Dierenhulp | Opetlife", description: "Ontdek behoeften op het gebied van dierenhulp en organisaties op Opetlife." },
    },
  },
  travel: {
    path: "travel",
    indexable: true,
    copy: {
      fa: { title: "سفر و اقامت با حیوان خانگی | اپت‌لایف", description: "اقامتگاه‌های مناسب حیوان خانگی را کشف کنید. پیش از رزرو، قیمت، ظرفیت و قوانین پذیرش حیوان را در منبع تأیید کنید." },
      en: { title: "Pet-friendly travel and stays | Opetlife", description: "Discover pet-friendly stays. Confirm price, availability and pet rules with the source before booking." },
      de: { title: "Reisen und Unterkünfte mit Haustier | opetlife", description: "Entdecke haustierfreundliche Unterkünfte. Bestätige Preis, Verfügbarkeit und Haustierregeln vor der Buchung bei der Quelle." },
      es: { title: "Viajes y alojamientos con mascotas | opetlife", description: "Descubre alojamientos que admiten mascotas. Confirma precio, disponibilidad y normas con la fuente antes de reservar." },
      ar: {
        title: "سفر وإقامة صديقة للحيوانات الأليفة | Opetlife",
        description: "اكتشف أماكن إقامة ترحّب بالحيوانات الأليفة. تأكد من السعر والتوفر وقواعد الحيوانات الأليفة لدى المصدر قبل الحجز."
      },
      nl: {
        title: "Huisdiervriendelijk reizen en verblijven | Opetlife",
        description: "Ontdek huisdiervriendelijke verblijven. Controleer prijs, beschikbaarheid en huisdierregels bij de bron voordat je boekt."
      },
    },
  },
  contact: {
    path: "contact",
    indexable: true,
    copy: {
      fa: { title: "تماس با اپت‌لایف", description: "راه‌های تماس و دریافت پشتیبانی از اپت‌لایف." },
      en: { title: "Contact Opetlife", description: "Contact information and support options for Opetlife." },
      de: { title: "Kontakt zu opetlife", description: "Kontaktmöglichkeiten und Support-Optionen für opetlife." },
      es: { title: "Contacta con opetlife", description: "Información de contacto y opciones de soporte de opetlife." },
      ar: { title: "تواصل مع Opetlife", description: "معلومات التواصل وخيارات الدعم في Opetlife." },
      nl: { title: "Contact met Opetlife", description: "Contactgegevens en ondersteuningsopties van Opetlife." },
    },
  },
  credits: {
    path: "credits",
    indexable: true,
    copy: {
      fa: { title: "اعتبار تصاویر و رسانه‌ها | اپت‌لایف", description: "اعتبار و مجوز رسانه‌هایی که در وب‌سایت اپت‌لایف استفاده شده‌اند." },
      en: { title: "Media credits | Opetlife", description: "Attributions and licence information for media used on the Opetlife website." },
      de: { title: "Mediennachweise | opetlife", description: "Urheberangaben und Lizenzinformationen zu den auf der opetlife-Website verwendeten Medien." },
      es: { title: "Créditos de medios | opetlife", description: "Atribuciones e información de licencias de los medios utilizados en opetlife." },
      ar: { title: "حقوق الوسائط | Opetlife", description: "الإسناد ومعلومات الترخيص للوسائط المستخدمة في موقع Opetlife." },
      nl: { title: "Mediavermeldingen | Opetlife", description: "Bronvermeldingen en licentie-informatie voor media op de website van Opetlife." },
    },
  },
  status: {
    path: "status",
    indexable: true,
    copy: {
      fa: { title: "وضعیت سامانه | اپت‌لایف", description: "وضعیت سرویس‌های اپت‌لایف و اطلاعیه‌های منتشرشدهٔ نگهداری یا اختلال." },
      en: { title: "System status | Opetlife", description: "Opetlife service status and published maintenance or incident notices." },
      de: { title: "Systemstatus | opetlife", description: "Status der opetlife-Dienste und veröffentlichte Wartungs- oder Störungsmeldungen." },
      es: { title: "Estado del sistema | opetlife", description: "Estado de los servicios de opetlife y avisos publicados de mantenimiento o incidencias." },
      ar: { title: "حالة النظام | Opetlife", description: "حالة خدمة Opetlife وإشعارات الصيانة أو الأعطال المنشورة." },
      nl: { title: "Systeemstatus | Opetlife", description: "Status van de Opetlife-dienst en gepubliceerde onderhouds- of storingsmeldingen." },
    },
  },
  shop: {
    path: "shop",
    indexable: false,
    copy: {
      fa: { title: "فروشگاه اپت‌لایف", description: "محصولات کاتالوگ مرکزی و پیشنهادهای فروشندگان اپت‌لایف." },
      en: { title: "Opetlife shop", description: "Central catalog products and seller offers on Opetlife." },
      de: { title: "opetlife Shop", description: "Produkte aus dem zentralen Katalog und Angebote von Verkäufern auf opetlife." },
      es: { title: "Tienda opetlife", description: "Productos del catálogo central y ofertas de vendedores en opetlife." },
      ar: { title: "متجر Opetlife", description: "منتجات الكتالوج المركزي وعروض البائعين في Opetlife." },
      nl: { title: "Opetlife-winkel", description: "Producten uit de centrale catalogus en aanbiedingen van verkopers op Opetlife." },
    },
  },
  help: {
    path: "help",
    indexable: false,
    copy: {
      fa: { title: "مرکز راهنمای اپت‌لایف", description: "پاسخ‌ها و راهنماهای رسمی اپت‌لایف، در صورت انتشار." },
      en: { title: "Opetlife Help Center", description: "Official Opetlife help topics and answers when published." },
      de: { title: "opetlife Hilfe-Center", description: "Offizielle Hilfethemen und Antworten von opetlife, sobald sie veröffentlicht sind." },
      es: { title: "Centro de ayuda opetlife", description: "Temas de ayuda y respuestas oficiales de opetlife cuando estén publicados." },
      ar: { title: "مركز مساعدة Opetlife", description: "موضوعات المساعدة الرسمية من Opetlife وإجاباتها عند نشرها." },
      nl: { title: "Opetlife Helpcentrum", description: "Officiële hulponderwerpen en antwoorden van Opetlife, zodra ze zijn gepubliceerd." },
    },
  },
  legal: {
    path: "legal",
    indexable: false,
    copy: {
      fa: { title: "اسناد حقوقی اپت‌لایف", description: "نسخه‌های رسمی اسناد حقوقی پس از تأیید و انتشار نمایش داده می‌شوند." },
      en: { title: "Opetlife legal documents", description: "Official legal documents are shown after approval and publication." },
      de: { title: "Rechtliche Dokumente von opetlife", description: "Offizielle rechtliche Dokumente werden nach Freigabe und Veröffentlichung angezeigt." },
      es: { title: "Documentos legales de opetlife", description: "Los documentos legales oficiales se muestran tras su aprobación y publicación." },
      ar: { title: "المستندات القانونية لـ Opetlife", description: "تُعرض المستندات القانونية الرسمية بعد اعتمادها ونشرها." },
      nl: { title: "Juridische documenten van Opetlife", description: "Officiële juridische documenten worden getoond na goedkeuring en publicatie." },
    },
  },
  blog: {
    path: "blog",
    indexable: true,
    copy: {
      fa: { title: "مجله اپت‌لایف | آموزش و نگهداری سگ و گربه", description: "مقاله‌های کاربردی دربارهٔ آموزش، تغذیه، سلامت و نگهداری سگ و گربه؛ نوشته‌شده با نگاه دامپزشکی و قابل اجرا در خانه." },
      en: { title: "Opetlife magazine | Dog and cat training and care", description: "Practical articles on training, feeding, health and everyday care for dogs and cats, written to be used at home." },
      de: { title: "opetlife Magazin | Hunde- und Katzenerziehung und Pflege", description: "Praktische Artikel zu Erziehung, Ernährung, Gesundheit und Pflege von Hunden und Katzen – für den Alltag zu Hause." },
      es: { title: "Revista opetlife | Educación y cuidado de perros y gatos", description: "Artículos prácticos sobre educación, alimentación, salud y cuidados diarios de perros y gatos, para aplicar en casa." },
      ar: {
        title: "مجلة Opetlife | تدريب الكلاب والقطط ورعايتها",
        description: "مقالات عملية عن تدريب الكلاب والقطط وتغذيتها وصحتها ورعايتها اليومية، مكتوبة لتُطبَّق في المنزل."
      },
      nl: {
        title: "Opetlife-magazine | Training en verzorging van honden en katten",
        description: "Praktische artikelen over training, voeding, gezondheid en dagelijkse verzorging van honden en katten, geschreven om thuis te gebruiken."
      },
    },
  },
  guides: {
    path: "guides",
    indexable: true,
    copy: {
      fa: { title: "راهنماهای مراقبت از سگ و گربه | اپت‌لایف", description: "راهنماهای قدم‌به‌قدم مراقبت از سگ و گربه: واکسن، تغذیه، رفتار و کارهایی که در موقعیت‌های مهم باید انجام دهید." },
      en: { title: "Dog and cat care guides | Opetlife", description: "Step-by-step dog and cat care guides: vaccines, feeding, behaviour and what to do in the moments that matter." },
      de: { title: "Pflege-Ratgeber für Hund und Katze | opetlife", description: "Schritt-für-Schritt-Ratgeber für Hund und Katze: Impfungen, Ernährung, Verhalten und was in wichtigen Momenten zu tun ist." },
      es: { title: "Guías de cuidado de perros y gatos | opetlife", description: "Guías paso a paso para perros y gatos: vacunas, alimentación, comportamiento y qué hacer en los momentos importantes." },
      ar: {
        title: "أدلة رعاية الكلاب والقطط | Opetlife",
        description: "أدلة خطوة بخطوة لرعاية الكلاب والقطط: اللقاحات والتغذية والسلوك وما يجب فعله في اللحظات المهمة."
      },
      nl: {
        title: "Zorggidsen voor honden en katten | Opetlife",
        description: "Stapsgewijze zorggidsen voor honden en katten: vaccinaties, voeding, gedrag en wat je doet op de momenten die ertoe doen."
      },
    },
  },
  vetFind: {
    path: "vet/find",
    indexable: true,
    copy: {
      fa: { title: "پیدا کردن دامپزشک و کلینیک دامپزشکی | اپت‌لایف", description: "دامپزشک‌ها و کلینیک‌های ثبت‌شده در اپت‌لایف را ببینید، اطلاعات و زمان‌های قابل رزرو را بررسی کنید و نوبت بگیرید." },
      en: { title: "Find a vet or veterinary clinic | Opetlife", description: "Browse vets and veterinary clinics listed on Opetlife, check their details and available times, and request an appointment." },
      de: { title: "Tierarzt oder Tierklinik finden | opetlife", description: "Finde Tierärzte und Tierkliniken auf opetlife, prüfe Angaben und freie Termine und stelle eine Terminanfrage." },
      es: { title: "Encuentra un veterinario o clínica | opetlife", description: "Consulta veterinarios y clínicas en opetlife, revisa sus datos y horarios disponibles y solicita una cita." },
      ar: {
        title: "ابحث عن طبيب بيطري أو عيادة بيطرية | Opetlife",
        description: "تصفّح الأطباء البيطريين والعيادات البيطرية المدرجة في Opetlife، وتحقق من تفاصيلهم ومواعيدهم المتاحة، واطلب موعدًا."
      },
      nl: {
        title: "Vind een dierenarts of dierenkliniek | Opetlife",
        description: "Bekijk dierenartsen en dierenklinieken op Opetlife, check hun gegevens en beschikbare tijden en vraag een afspraak aan."
      },
    },
  },
  animalSupportCampaigns: {
    path: "animal-support/campaigns",
    indexable: true,
    copy: {
      fa: { title: "کمپین‌های حمایت از حیوانات | اپت‌لایف", description: "کمپین‌های فعال حمایت از حیوانات بی‌سرپرست و سازمان‌های مردم‌نهاد را ببینید و در آن‌ها مشارکت کنید." },
      en: { title: "Animal support campaigns | Opetlife", description: "See active campaigns supporting stray and rescued animals and the organisations behind them, and take part." },
      de: { title: "Tierschutz-Kampagnen | opetlife", description: "Aktive Kampagnen für Streuner und gerettete Tiere und die Organisationen dahinter – informiere dich und hilf mit." },
      es: { title: "Campañas de apoyo animal | opetlife", description: "Consulta campañas activas para animales callejeros y rescatados, y las organizaciones que las impulsan." },
      ar: {
        title: "حملات دعم الحيوانات | Opetlife",
        description: "اطّلع على الحملات النشطة لدعم الحيوانات الضالة والمُنقَذة والمنظمات التي تقف وراءها، وشارك فيها."
      },
      nl: {
        title: "Campagnes voor dierenhulp | Opetlife",
        description: "Bekijk actieve campagnes voor zwerf- en geredde dieren en de organisaties erachter, en doe mee."
      },
    },
  },
  animalSupportNeeds: {
    path: "animal-support/needs",
    indexable: true,
    copy: {
      fa: { title: "نیازهای حیوانات و پناهگاه‌ها | اپت‌لایف", description: "نیازهای ثبت‌شدهٔ پناهگاه‌ها و حامیان حیوانات؛ از غذا و دارو تا سرپناه موقت، و راه‌های کمک کردن." },
      en: { title: "Animal and shelter needs | Opetlife", description: "Listed needs from shelters and animal helpers, from food and medicine to temporary foster homes, and how to help." },
      de: { title: "Bedarf von Tieren und Tierheimen | opetlife", description: "Gemeldeter Bedarf von Tierheimen und Helfern – von Futter und Medikamenten bis Pflegestellen – und wie du helfen kannst." },
      es: { title: "Necesidades de animales y refugios | opetlife", description: "Necesidades publicadas por refugios y protectores, desde comida y medicinas hasta hogares temporales, y cómo ayudar." },
      ar: {
        title: "احتياجات الحيوانات والملاجئ | Opetlife",
        description: "احتياجات مدرجة من الملاجئ ومساعدي الحيوانات، من الطعام والدواء إلى بيوت الرعاية المؤقتة، وكيف تساعد."
      },
      nl: {
        title: "Behoeften van dieren en asielen | Opetlife",
        description: "Behoeften van asielen en dierenhelpers, van voer en medicijnen tot tijdelijke opvanggezinnen, en hoe je kunt helpen."
      },
    },
  },
  travelExternal: {
    path: "travel/external",
    indexable: true,
    copy: {
      fa: { title: "اقامتگاه‌های پذیرای حیوان خانگی | اپت‌لایف", description: "فهرست روزانهٔ اقامتگاه‌هایی که پذیرش حیوان خانگی را اعلام کرده‌اند؛ پیش از رزرو، شرایط را در منبع بررسی کنید." },
      en: { title: "Stays that accept pets | Opetlife", description: "A daily list of stays that state they accept pets. Check the conditions with the source before booking." },
      de: { title: "Unterkünfte, die Haustiere erlauben | opetlife", description: "Tägliche Liste von Unterkünften, die Haustiere erlauben. Prüfe die Bedingungen vor der Buchung bei der Quelle." },
      es: { title: "Alojamientos que aceptan mascotas | opetlife", description: "Lista diaria de alojamientos que indican aceptar mascotas. Confirma las condiciones con la fuente antes de reservar." },
      ar: {
        title: "أماكن إقامة تقبل الحيوانات الأليفة | Opetlife",
        description: "قائمة يومية بأماكن الإقامة التي تعلن قبولها الحيوانات الأليفة. تحقّق من الشروط لدى المصدر قبل الحجز."
      },
      nl: {
        title: "Verblijven die huisdieren toelaten | Opetlife",
        description: "Een dagelijkse lijst van verblijven die aangeven huisdieren toe te laten. Controleer de voorwaarden bij de bron voordat je boekt."
      },
    },
  },
  places: {
    path: "places",
    indexable: false,
    copy: {
      fa: { title: "مکان‌های دوستدار حیوانات | اپت‌لایف", description: "مکان‌های عمومی دوستدار حیوانات خانگی را در اپت‌لایف جست‌وجو کنید." },
      en: { title: "Pet-friendly places | Opetlife", description: "Explore public pet-friendly places listed on Opetlife." },
      de: { title: "Haustierfreundliche Orte | opetlife", description: "Entdecke öffentliche, haustierfreundliche Orte auf opetlife." },
      es: { title: "Lugares pet-friendly | opetlife", description: "Explora lugares públicos que admiten mascotas en opetlife." },
      ar: { title: "أماكن صديقة للحيوانات الأليفة | Opetlife", description: "استكشف الأماكن العامة الصديقة للحيوانات الأليفة المدرجة في Opetlife." },
      nl: { title: "Huisdiervriendelijke plekken | Opetlife", description: "Ontdek openbare huisdiervriendelijke plekken op Opetlife." },
    },
  },
  insurance: {
    path: "insurance",
    indexable: false,
    copy: {
      fa: { title: "مقایسهٔ بیمهٔ حیوانات خانگی | اپت‌لایف", description: "اطلاعات بیمه‌گرها و طرح‌های منتشرشده را بررسی کنید؛ شرایط نهایی را از بیمه‌گر بپرسید." },
      en: { title: "Pet insurance comparison | Opetlife", description: "Review published insurer and plan information; confirm final terms with the insurer." },
      de: { title: "Vergleich von Tierversicherungen | opetlife", description: "Prüfe veröffentlichte Angaben zu Versicherern und Tarifen; bestätige die Bedingungen beim Versicherer." },
      es: { title: "Comparación de seguros para mascotas | opetlife", description: "Consulta la información publicada de aseguradoras y planes; confirma las condiciones con la aseguradora." },
      ar: {
        title: "مقارنة تأمين الحيوانات الأليفة | Opetlife",
        description: "راجع معلومات شركات التأمين وخططها المنشورة؛ وتأكد من الشروط النهائية مع شركة التأمين."
      },
      nl: {
        title: "Huisdierverzekeringen vergelijken | Opetlife",
        description: "Bekijk gepubliceerde informatie over verzekeraars en polissen; bevestig de definitieve voorwaarden bij de verzekeraar."
      },
    },
  },
  memorials: {
    path: "memorials",
    indexable: true,
    copy: {
      fa: { title: "یادبود حیوانات خانگی | اپت‌لایف", description: "یادبود همراهانی که رفته‌اند؛ فقط با اجازهٔ صاحبشان و پس از بررسی." },
      en: { title: "Pet memorials | Opetlife", description: "Remembering companions who have passed, shared by their families and reviewed before they appear." },
      de: { title: "Gedenkseite für Haustiere | opetlife", description: "Erinnerungen an verstorbene Tiere, von ihren Familien geteilt und vor der Veröffentlichung geprüft." },
      es: { title: "Memoriales de mascotas | opetlife", description: "Recuerdos de compañeros que ya no están, compartidos por sus familias y revisados antes de publicarse." },
      ar: { title: "تذكارات الحيوانات الأليفة | Opetlife", description: "نستذكر رفاقًا رحلوا، تشاركها عائلاتهم وتُراجَع قبل نشرها." },
      nl: { title: "Herdenkingen voor huisdieren | Opetlife", description: "Ter herinnering aan overleden dieren, gedeeld door hun families en beoordeeld voordat ze verschijnen." },
    },
  },
  about: {
    path: "about",
    indexable: true,
    copy: {
      fa: { title: "درباره اپت‌لایف | چرا هستیم و چه تعهدی داریم", description: "داستان اپت‌لایف: چرا ساخته شد، پرونده، دامپزشکی، فروشگاه، سفر و حمایت چطور کنار هم کار می‌کنند و چه تعهدهایی دربارهٔ اعتماد و حریم خصوصی داریم." },
      en: { title: "About Opetlife | Why we exist and what we promise", description: "The story behind Opetlife: why we built it, how pet records, vets, the shop, travel and rescue work together, and the promises we keep on trust and privacy." },
      de: { title: "Über opetlife | Warum es uns gibt und was wir versprechen", description: "Die Geschichte hinter opetlife: warum wir es gebaut haben, wie Gesundheitsakte, Tierärzte, Shop, Reisen und Tierschutz zusammenwirken und was wir bei Vertrauen und Datenschutz versprechen." },
      es: { title: "Sobre opetlife | Por qué existimos y qué prometemos", description: "La historia de opetlife: por qué lo creamos, cómo funcionan juntos el historial, los veterinarios, la tienda, los viajes y el rescate, y lo que prometemos sobre confianza y privacidad." },
      ar: { title: "عن Opetlife | لماذا وُجدنا وما الذي نتعهّد به", description: "قصة Opetlife: لماذا أنشأناه، وكيف تتكامل سجلات الحيوانات الأليفة والأطباء البيطريون والمتجر والسفر والإنقاذ، والوعود التي نلتزم بها في الثقة والخصوصية." },
      nl: { title: "Over Opetlife | Waarom we bestaan en wat we beloven", description: "Het verhaal van Opetlife: waarom we het bouwden, hoe dossiers, dierenartsen, winkel, reizen en opvang samenwerken en onze beloftes over vertrouwen en privacy." },
    },
  },
} as const satisfies Record<string, { path: string; indexable: boolean; copy: Copy }>;

export type PublicSeoPage = keyof typeof pages;

export const sitemapPages: readonly PublicSeoPage[] = [
  "home", "blog", "guides", "services", "vetFind", "community", "lostPets", "animalSupport", "animalSupportCampaigns", "animalSupportNeeds", "travel", "travelExternal", "about", "contact", "credits", "status", "memorials",
];

export function publicPagePath(locale: RouteLocale, page: PublicSeoPage): string {
  const suffix = pages[page].path;
  return suffix ? `/${locale}/${suffix}` : localeHomePath(locale);
}

/** Canonical + reciprocal hreflang for any public path that exists identically in every locale (`suffix` without the locale). */
export function localizedAlternates(locale: RouteLocale, suffix: string): NonNullable<Metadata["alternates"]> {
  const path = (language: RouteLocale) => (suffix ? `/${language}/${suffix}` : localeHomePath(language));
  return {
    canonical: path(locale),
    languages: { ...Object.fromEntries(locales.map((language) => [language, path(language)])), "x-default": path("fa") },
  };
}

export function publicPageMetadata(localeValue: string, page: PublicSeoPage): Metadata {
  const locale: RouteLocale = isRouteLocale(localeValue) ? localeValue : "fa";
  const pageConfig = pages[page];
  const copy = pageConfig.copy[locale];
  const metadata: Metadata = {
    title: copy.title,
    description: copy.description,
    robots: { index: pageConfig.indexable, follow: true },
  };

  if (pageConfig.indexable) {
    metadata.metadataBase = new URL(SITE_ORIGIN);
    metadata.alternates = {
      canonical: publicPagePath(locale, page),
      languages: {
        ...Object.fromEntries(locales.map((language) => [language, publicPagePath(language, page)])),
        "x-default": publicPagePath("fa", page),
      },
    };
    metadata.openGraph = {
      type: "website",
      siteName: SITE_NAME[locale],
      title: copy.title,
      description: copy.description,
      url: publicPagePath(locale, page),
      locale: OG_LOCALE[locale],
      alternateLocale: locales.filter((l) => l !== locale).map((l) => OG_LOCALE[l]),
      images: [{ url: SITE_SHARE_IMAGE_PATH, alt: SITE_NAME[locale] }],
    };
    metadata.twitter = { card: "summary_large_image", title: copy.title, description: copy.description, images: [SITE_SHARE_IMAGE_PATH] };
  }

  return metadata;
}
