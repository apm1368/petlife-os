import {describe,expect,it} from "vitest";
import {screen} from "@testing-library/react";
import {renderWithIntl} from "@/test/render-with-intl";
import {externalStay} from "@/test/fixtures/external-stay";
import {ExternalStayCard,matchingExternalPrice} from "./ExternalStayCard";
const context={checkIn:"2026-10-20",checkOut:"2026-10-22",guests:2,pets:1};
describe("ExternalStayCard",()=>{
 it("only shows a quote matching the exact dates, guest and pet counts",()=>{expect(matchingExternalPrice(externalStay,context)?.priceIrr).toBe(1000000);expect(matchingExternalPrice(externalStay,{...context,guests:3})).toBeNull();expect(matchingExternalPrice(externalStay,{...context,pets:2})).toBeNull();expect(matchingExternalPrice(externalStay,{...context,checkOut:"2026-10-23"})).toBeNull()});
 it("never treats expired or stale quotes as current",()=>{expect(matchingExternalPrice({...externalStay,price:{...externalStay.price!,expiresAt:"2000-01-01T00:00:00Z"}},context)).toBeNull();expect(matchingExternalPrice({...externalStay,price:{...externalStay.price!,state:"STALE"}},context)).toBeNull()});
 it("labels unknown pet acceptance and links to the real outbound endpoint",()=>{renderWithIntl(<ExternalStayCard stay={externalStay} context={context}/>);expect(screen.getByText("Pet acceptance unknown")).toBeTruthy();expect(screen.getByText("100,000 Toman")).toBeTruthy();expect(screen.getByRole("link",{name:"View and check at source website"}).getAttribute("href")).toContain("/travel/external/stays/stay1/out?checkIn=2026-10-20");expect(screen.queryByRole("button",{name:/book/i})).toBeNull()});
 it("does not show a stale amount as zero or as an exact trip quote",()=>{renderWithIntl(<ExternalStayCard stay={{...externalStay,price:{...externalStay.price!,state:"STALE",priceIrr:null}}} context={context}/>);expect(screen.queryByText("100,000 Toman")).toBeNull();expect(screen.getByText("The previous price is outdated and is not shown as a current quote.")).toBeTruthy()});
 it.each([
  ["de","Haustieraufnahme unbekannt","100.000 Toman","Bei der Quellwebsite ansehen und prüfen"],
  ["es","Se desconoce si admite mascotas","100.000 Toman","Ver y consultar en el sitio de origen"],
 ] as const)("renders source evidence and price copy in %s",(locale,policy,price,sourceAction)=>{renderWithIntl(<ExternalStayCard stay={externalStay} context={context}/>,locale);expect(screen.getByText(policy)).toBeTruthy();expect(screen.getByText(price)).toBeTruthy();expect(screen.getByRole("link",{name:sourceAction})).toBeTruthy()});
 const jajiga={...externalStay,source:{...externalStay.source,sourceType:"UNOFFICIAL_PUBLIC_WEB_ENDPOINT",code:"JAJIGA",nameFa:"جاجیگا",nameEn:"Jajiga"},pet:{...externalStay.pet,policyStatus:"CONFIRMED_ALLOWED" as const,accepted:true,evidenceType:"SOURCE_FILTER",evidenceText:"Listed in Jajiga's public pet-permitted search (rules=pet) with its is_pet_friendly marker.",evidenceObservedAt:"2026-11-11T21:00:00Z"}};
 it.each([
  ["fa",/فیلتر عمومی «مجاز برای ورود حیوان خانگی» جاجیگا/,/آخرین همگام‌سازی موفق با منبع/],
  ["en",/“pets allowed” filter on Jajiga/,/Last successful source sync/],
  ["de",/„Haustiere erlaubt“ von Jajiga/,/Letzte erfolgreiche Synchronisierung/],
  ["es",/«se admiten mascotas» de Jajiga/,/Última sincronización correcta/],
 ] as const)("localizes automated source-filter pet evidence and the sync time in %s",(locale,evidence,synced)=>{renderWithIntl(<ExternalStayCard stay={jajiga} context={{}} detail/>,locale);expect(screen.getByText(evidence)).toBeTruthy();expect(screen.getByText(synced)).toBeTruthy();expect(screen.queryByText(/is_pet_friendly/)).toBeNull()});
 it("keeps staff-entered evidence text for manual records",()=>{renderWithIntl(<ExternalStayCard stay={{...jajiga,source:{...jajiga.source,sourceType:"MANUAL_ENTRY"},pet:{...jajiga.pet,evidenceText:"Host confirmed small dogs by phone"}}} context={{}} detail/>);expect(screen.getByText("Host confirmed small dogs by phone")).toBeTruthy()});
});
