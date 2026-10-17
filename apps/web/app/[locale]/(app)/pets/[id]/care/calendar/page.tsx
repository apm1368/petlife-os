import { PetCareCalendarView } from "@/features/care-calendar/PetCareCalendarView";
export default async function Page({params}:{params:Promise<{id:string}>}) { const {id}=await params; return <PetCareCalendarView petId={id}/>; }
