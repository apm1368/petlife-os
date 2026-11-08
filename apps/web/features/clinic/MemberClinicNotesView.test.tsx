import {beforeEach,describe,expect,it,vi} from "vitest";
import {fireEvent,screen} from "@testing-library/react";
import {renderWithIntl} from "@/test/render-with-intl";
import {clinicCustomerExtrasService} from "@/services/clinic-customer-extras.service";
import {MemberClinicNotesView} from "./MemberClinicNotesView";
vi.mock("@/services/clinic-customer-extras.service",()=>({clinicCustomerExtrasService:{sharedNotes:vi.fn()}}));
describe("MemberClinicNotesView",()=>{
 beforeEach(()=>vi.resetAllMocks());
 it("shows explicitly shared non-clinical notes with their actual clinic and time",async()=>{vi.mocked(clinicCustomerExtrasService.sharedNotes).mockResolvedValue([{id:"note1",householdId:"h1",clinic:{id:"org1",name:"Companion clinic"},body:"Please call reception about your next appointment.",createdAt:"2026-10-15T10:00:00Z"}]);renderWithIntl(<MemberClinicNotesView/>);await screen.findByText("Please call reception about your next appointment.");expect(screen.getByRole("heading",{name:"Companion clinic"})).toBeTruthy();expect(screen.getByText(/Up to 100 recent messages/)).toBeTruthy();expect(screen.queryByRole("button",{name:"Remove note"})).toBeNull()});
 it("does not present a transport failure as no shared messages",async()=>{vi.mocked(clinicCustomerExtrasService.sharedNotes).mockRejectedValueOnce(Error("network")).mockResolvedValueOnce([]);renderWithIntl(<MemberClinicNotesView/>);await screen.findByRole("alert");expect(screen.queryByText("No clinic messages have been shared yet.")).toBeNull();fireEvent.click(screen.getByRole("button",{name:"Retry"}));await screen.findByText("No clinic messages have been shared yet.")});
 it.each([
  ["de", "Kliniknachrichten für Ihren Haushalt", "Wird geladen …", "Es wurden noch keine Kliniknachrichten geteilt."],
  ["es", "Mensajes de la clínica para tu hogar", "Cargando…", "Aún no se ha compartido ningún mensaje de la clínica."],
 ] as const)("renders translated loading and empty page states in %s",async(locale,title,loading,empty)=>{
  type SharedNotes=Awaited<ReturnType<typeof clinicCustomerExtrasService.sharedNotes>>;
  let finish!: (notes:SharedNotes)=>void;
  vi.mocked(clinicCustomerExtrasService.sharedNotes).mockReturnValueOnce(new Promise<SharedNotes>((resolve)=>{finish=resolve}));
  renderWithIntl(<MemberClinicNotesView/>,locale);
  expect(screen.getByRole("heading",{name:title})).toBeTruthy();
  expect(screen.getByRole("status").textContent).toBe(loading);
  finish([]);
  await screen.findByText(empty);
  expect(document.body.textContent).not.toMatch(/[\u0600-\u06ff]/);
 });
 it.each([
  ["de", "Informationen konnten nicht geladen werden.", "Erneut versuchen"],
  ["es", "No se pudo cargar la información.", "Reintentar"],
 ] as const)("renders a translated recoverable error in %s",async(locale,error,retry)=>{
  vi.mocked(clinicCustomerExtrasService.sharedNotes).mockRejectedValueOnce(Error("offline"));
  renderWithIntl(<MemberClinicNotesView/>,locale);
  expect((await screen.findByRole("alert")).textContent).toBe(error);
  expect(screen.getByRole("button",{name:retry})).toBeTruthy();
 });
 it.each([
  ["de", "Kliniknachrichten für Ihren Haushalt", "Bis zu 100 aktuelle Nachrichten aus Ihren Haushalten."],
  ["es", "Mensajes de la clínica para tu hogar", "Se muestran hasta 100 mensajes recientes de tus hogares."],
 ] as const)("translates German/Spanish UI but preserves source-authored note text in %s",async(locale,title,limit)=>{
  const sourceBody="Please call reception about your next appointment.";
  vi.mocked(clinicCustomerExtrasService.sharedNotes).mockResolvedValueOnce([{id:"note-locale",householdId:"h1",clinic:{id:"clinic-1",name:"Companion clinic"},body:sourceBody,createdAt:"2026-10-15T10:00:00.000Z"}]);
  renderWithIntl(<MemberClinicNotesView/>,locale);
  expect(await screen.findByRole("heading",{name:title})).toBeTruthy();
  expect(document.body.textContent).toContain(limit);
  expect(screen.getByText(sourceBody)).toBeTruthy();
  const time=screen.getByText((_,element)=>element?.tagName==="TIME");
  expect(time.textContent).toBe(new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeStyle:"short"}).format(new Date("2026-10-15T10:00:00.000Z")));
  expect(document.body.textContent).not.toMatch(/[\u0600-\u06ff]/);
 });
});
