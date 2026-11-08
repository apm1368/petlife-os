import {beforeEach,describe,expect,it,vi} from "vitest";
import {screen} from "@testing-library/react";
import {renderWithIntl} from "@/test/render-with-intl";
import {lostPetService} from "@/services/lost-pet.service";
import {PublicLostPetListView} from "./PublicLostPetListView";
import {PublicLostPetView} from "./PublicLostPetView";

vi.mock("@/services/lost-pet.service",()=>({lostPetService:{listPublic:vi.fn(),getPublic:vi.fn(),requestSightingPhotoUpload:vi.fn(),submitSighting:vi.fn()}}));
vi.mock("@/features/shared/ReportContentPanel",()=>({ReportContentPanel:()=>null}));
vi.mock("@/features/shared/ShareBar",()=>({ShareBar:({text}:{text:string})=><p>{text}</p>}));

const incident={id:"lost-1",petId:"pet-1",petName:"Nala",petSpecies:"CAT",petBreed:"Domestic shorthair",petColorMarkings:"Grey tabby",petApproximateAgeMonths:30,approximateArea:"Yousefabad",lastSeenAt:"2026-10-20T10:00:00.000Z",primaryPhotoUrl:null,publicNotes:"Approach gently",publicContactMode:null,status:"OPEN"};

describe("public lost-pet pages in German and Spanish",()=>{
 beforeEach(()=>{vi.resetAllMocks();vi.mocked(lostPetService.listPublic).mockResolvedValue({items:[],total:0,page:1,pageSize:20});vi.mocked(lostPetService.getPublic).mockResolvedValue(incident as never)});
 it.each([["de","Nach Tierart filtern","Zurzeit gibt es keine aktiven Vermisstmeldungen."],["es","Filtrar por especie","Ahora mismo no hay avisos activos de mascotas perdidas."]] as const)("localizes the public list and empty state in %s",async(locale,filter,empty)=>{
  renderWithIntl(<PublicLostPetListView/>,locale);
  expect(await screen.findByRole("group",{name:filter})).toBeTruthy();
  expect(await screen.findByText(empty)).toBeTruthy();
 });
 it.each([["fa","فیلتر بر اساس گونه","در حال حاضر گزارش فعالی از حیوان گم‌شده ثبت نشده است."],["en","Filter by species","There are no active lost-pet reports right now."]] as const)("preserves the public list in %s",async(locale,filter,empty)=>{
  renderWithIntl(<PublicLostPetListView/>,locale);
  expect(await screen.findByRole("group",{name:filter})).toBeTruthy();
  expect(await screen.findByText(empty)).toBeTruthy();
 });
 it.each([["de","Tierart","Sichtung melden"],["es","Especie","Comunicar un avistamiento"]] as const)("localizes public incident facts and sighting controls in %s",async(locale,species,title)=>{
  renderWithIntl(<PublicLostPetView incidentId="lost-1"/>,locale);
  expect(await screen.findByRole("heading",{name:/Nala/})).toBeTruthy();
  expect(screen.getByText(species)).toBeTruthy();
  expect(screen.getByRole("heading",{name:title})).toBeTruthy();
  expect(screen.getByText(content=>content.includes(new Intl.DateTimeFormat(locale,{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}).format(new Date("2026-10-20T12:00:00.000Z"))))).toBeTruthy();
 });
 it.each([["fa","گونه","گزارش یک مشاهده"],["en","Species","Report a sighting"]] as const)("preserves public incident behavior in %s",async(locale,species,title)=>{
  renderWithIntl(<PublicLostPetView incidentId="lost-1"/>,locale);
  expect(await screen.findByRole("heading",{name:/Nala/})).toBeTruthy();
  expect(screen.getByText(species)).toBeTruthy();
  expect(screen.getByRole("heading",{name:title})).toBeTruthy();
 });
});
