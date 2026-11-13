import {describe,expect,it} from "vitest";
import {screen} from "@testing-library/react";
import {renderWithIntl} from "@/test/render-with-intl";
import {externalStay} from "@/test/fixtures/external-stay";
import {ExternalStayCard,matchingExternalPrice,timeAgo} from "./ExternalStayCard";
const context={checkIn:"2026-10-20",checkOut:"2026-10-22",guests:2,pets:1};
describe("ExternalStayCard",()=>{
 it("only shows a quote matching the exact dates, guest and pet counts",()=>{expect(matchingExternalPrice(externalStay,context)?.priceIrr).toBe(1000000);expect(matchingExternalPrice(externalStay,{...context,guests:3})).toBeNull();expect(matchingExternalPrice(externalStay,{...context,pets:2})).toBeNull();expect(matchingExternalPrice(externalStay,{...context,checkOut:"2026-10-23"})).toBeNull()});
 it("never treats expired or stale quotes as current",()=>{expect(matchingExternalPrice({...externalStay,price:{...externalStay.price!,expiresAt:"2000-01-01T00:00:00Z"}},context)).toBeNull();expect(matchingExternalPrice({...externalStay,price:{...externalStay.price!,state:"STALE"}},context)).toBeNull()});
 it("labels unknown pet acceptance and links to the real outbound endpoint",()=>{renderWithIntl(<ExternalStayCard stay={externalStay} context={context}/>);expect(screen.getByText("Pet acceptance unknown")).toBeTruthy();expect(screen.getByText("100,000 Toman")).toBeTruthy();expect(screen.getByRole("link",{name:/^View stay/}).getAttribute("href")).toContain("/travel/external/stays/stay1/out?checkIn=2026-10-20");expect(screen.queryByRole("button",{name:/book/i})).toBeNull()});
 it("does not show a stale amount as zero or as an exact trip quote",()=>{renderWithIntl(<ExternalStayCard stay={{...externalStay,price:{...externalStay.price!,state:"STALE",priceIrr:null}}} context={context}/>);expect(screen.queryByText("100,000 Toman")).toBeNull();expect(screen.getByText("The previous price is outdated and is not shown as a current quote.")).toBeTruthy()});
 it.each([
  ["de","Haustieraufnahme unbekannt","100.000 Toman",/^Unterkunft ansehen/],
  ["es","Se desconoce si admite mascotas","100.000 Toman",/^Ver alojamiento/],
 ] as const)("renders source evidence and price copy in %s",(locale,policy,price,sourceAction)=>{renderWithIntl(<ExternalStayCard stay={externalStay} context={context}/>,locale);expect(screen.getByText(policy)).toBeTruthy();expect(screen.getByText(price)).toBeTruthy();expect(screen.getByRole("link",{name:sourceAction})).toBeTruthy()});
 const jajiga={...externalStay,source:{...externalStay.source,sourceType:"UNOFFICIAL_PUBLIC_WEB_ENDPOINT",code:"JAJIGA",nameFa:"جاجیگا",nameEn:"Jajiga"},pet:{...externalStay.pet,policyStatus:"CONFIRMED_ALLOWED" as const,accepted:true,evidenceType:"SOURCE_FILTER",evidenceText:"Listed in Jajiga's public pet-permitted search (rules=pet) with its is_pet_friendly marker.",evidenceObservedAt:"2026-11-11T21:00:00Z"}};
 it.each([
  ["fa",/فیلتر عمومی «مجاز برای ورود حیوان خانگی» سایت اقامتگاه/,/آخرین همگام‌سازی موفق با منبع/],
  ["en",/listing site’s public “pets allowed” filter/,/Last successful source sync/],
  ["de",/„Haustiere erlaubt“ der Inseratsseite/,/Letzte erfolgreiche Synchronisierung/],
  ["es",/«se admiten mascotas» del sitio del anuncio/,/Última sincronización correcta/],
 ] as const)("localizes automated source-filter pet evidence and the sync time in %s",(locale,evidence,synced)=>{renderWithIntl(<ExternalStayCard stay={jajiga} context={{}} detail/>,locale);expect(screen.getByText(evidence)).toBeTruthy();expect(screen.getByText(synced)).toBeTruthy();expect(screen.queryByText(/is_pet_friendly/)).toBeNull()});
 it("keeps staff-entered evidence text for manual records",()=>{renderWithIntl(<ExternalStayCard stay={{...jajiga,source:{...jajiga.source,sourceType:"MANUAL_ENTRY"},pet:{...jajiga.pet,evidenceText:"Host confirmed small dogs by phone"}}} context={{}} detail/>);expect(screen.getByText("Host confirmed small dogs by phone")).toBeTruthy()});
 // Owner, 2026-11-13: Jajiga only marks a stay pet-friendly. Say it is Jajiga's claim, show every unknown pet condition as
 // unknown, price as a starting price with its age, and send the member to the exact listing through /out.
 const synced=new Date(Date.now()-3*3600e3).toISOString();
 const listed={...jajiga,lastSuccessfulSyncAt:synced,pet:{...jajiga.pet,policy:{dogs:"UNKNOWN",cats:"UNKNOWN",maxPets:"UNKNOWN",sizeLimit:"UNKNOWN",indoor:"UNKNOWN",extraFeeIrr:"UNKNOWN",approvalRequired:"UNKNOWN"}},fromPrice:{priceType:"FROM_PRICE" as const,priceIrr:25_000_000,currency:"IRR",priceBasis:"PER_NIGHT",observedAt:synced,freshness:"FRESH"}};
 it("says a listed stay is pet-friendly according to the listing site, never verified, without naming the source",()=>{
  renderWithIntl(<ExternalStayCard stay={listed} context={{}}/>,"fa");
  expect(screen.getByText("طبق اطلاعات سایت اقامتگاه، حیوان خانگی پذیرفته می‌شود.")).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/جاجیگا|Jajiga/);
  expect(screen.getByText("اطلاعات از منبع بیرونی؛ رزرو در سایت منبع انجام می‌شود.")).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/تأیید ?شده|تاییدشده/);
  expect(screen.getAllByText("نامشخص")).toHaveLength(5);
  expect(screen.getByText(/شروع قیمت از/)).toBeTruthy();
  expect(screen.getByText(/به‌روزرسانی ۳ ساعت پیش/)).toBeTruthy();
  const button=screen.getByRole("link",{name:/^مشاهدهٔ اقامتگاه/});
  expect(button.getAttribute("rel")).toBe("noopener nofollow");
  expect(button.getAttribute("href")).toMatch(/\/travel\/external\/stays\/stay1\/out$/);
 });
 it.each([
  ["en","Pets accepted, according to the listing site.","Unknown","Starting from",/^View stay/],
  ["de","Laut Inseratsseite sind Haustiere willkommen.","Unbekannt","Ab",/^Unterkunft ansehen/],
  ["es","Admite mascotas, según el sitio del anuncio.","Desconocido","Desde",/^Ver alojamiento/],
  ["ar","تُقبل الحيوانات الأليفة حسب موقع الإعلان","غير معروف","ابتداءً من",/^عرض الإقامة/],
  ["nl","Huisdieren welkom, volgens de advertentiesite.","Onbekend","Vanaf",/^Verblijf bekijken/],
 ] as const)("tells the same honest story in %s",(locale,claim,unknown,start,button)=>{
  renderWithIntl(<ExternalStayCard stay={listed} context={{}}/>,locale);
  expect(screen.getByText(new RegExp(claim.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")))).toBeTruthy();
  expect(screen.getAllByText(unknown)).toHaveLength(5);
  expect(screen.getByText(new RegExp(`^${start}`))).toBeTruthy();
  expect(screen.getByRole("link",{name:button})).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/verified|bestätigt|verificad|تحقّقت|bevestigd/i);
 });
 it("says verified only when opetlife staff confirmed the pet policy, and shows conditions the source does state",()=>{
  renderWithIntl(<ExternalStayCard stay={{...listed,pet:{...listed.pet,authority:"ADMIN_CONFIRMED",policy:{dogs:true,cats:false,sizeLimit:"10kg",indoor:true,extraFeeIrr:0,approvalRequired:true}}}} context={{}}/>);
  expect(screen.getByText("Pet acceptance checked and verified by opetlife")).toBeTruthy();
  expect(screen.getByText("Dogs: Yes · Cats: No")).toBeTruthy();
  expect(screen.getByText("Up to 10kg")).toBeTruthy();
  expect(screen.getByText("No fee")).toBeTruthy();
  expect(screen.getByText("Required")).toBeTruthy();
  expect(screen.queryByText("Unknown")).toBeNull();
 });
 it("formats how long ago a sync happened",()=>{
  const now=Date.parse("2026-11-13T12:00:00Z");
  expect(timeAgo("2026-11-13T11:30:00Z","en",now)).toBe("30 minutes ago");
  expect(timeAgo("2026-11-13T07:00:00Z","en",now)).toBe("5 hours ago");
  expect(timeAgo("2026-11-11T12:00:00Z","en",now)).toBe("2 days ago");
 });
});
