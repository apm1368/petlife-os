import {TripExternalStaysView} from "@/features/travel-external/TripExternalStaysView";
export default async function TripExternalStaysPage({params}:{params:Promise<{id:string;tripId:string}>}){const {id,tripId}=await params;return <TripExternalStaysView petId={id} tripId={tripId}/>}
