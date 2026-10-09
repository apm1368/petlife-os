import {ObservationDetailView} from "@/features/health-advanced/ObservationDetailView";
export default async function Page({params}:{params:Promise<{id:string;observationId:string}>}){const{id,observationId}=await params;return <ObservationDetailView petId={id} observationId={observationId}/>;}
