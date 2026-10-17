import {ExternalStaysView} from "@/features/travel-external/ExternalStaysView";
export const dynamic="force-dynamic";
export default async function ExternalStayPage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <ExternalStaysView stayId={id}/>}
