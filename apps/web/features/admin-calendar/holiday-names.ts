/**
 * Official holiday names arrive in Persian (the official calendar's wording). For en/de/es the admin shows a
 * translated name: each " · "-separated part is matched by a distinctive phrase, first match wins; anything unknown
 * keeps its Persian text.
 */
const RULES: ReadonlyArray<[string, string]> = [
  ["تعطیل به مناسبت عید سعید فطر", "eidAlFitr2"],
  ["فطر", "eidAlFitr"],
  ["نوروز", "nowruz"],
  ["جمهوری اسلامی", "republicDay"],
  ["سیزده", "natureDay"],
  ["میلاد رسول", "mawlid"],
  ["امام جعفر صادق", "sadiqMartyrdom"],
  ["قربان", "eidAlAdha"],
  ["امام خمینی", "khomeini"],
  ["غدیر", "ghadir"],
  ["15 خرداد", "khordad15"],
  ["تاسوعا", "tasua"],
  ["عاشورا", "ashura"],
  ["اربعین", "arbaeen"],
  ["رحلت", "prophetDeath"],
  ["امام رضا", "reza"],
  ["عسکری", "askari"],
  ["فاطمه", "fatima"],
  ["ولادت امام علی", "aliBirth"],
  ["مبعث", "mabath"],
  ["شعبان", "midShaban"],
  ["انقلاب", "revolution"],
  ["حضرت علی", "aliMartyrdom"],
  ["نفت", "oil"],
];

export function holidayNameKeys(title: string): Array<string | { raw: string }> {
  return title.split(" · ").map((part) => RULES.find(([phrase]) => part.includes(phrase))?.[1] ?? { raw: part.trim() });
}
