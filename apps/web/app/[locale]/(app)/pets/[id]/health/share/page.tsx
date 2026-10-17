import { VetShareView } from "@/features/health/VetShareView";
export default async function Page({params}:{params:Promise<{id:string}>}){const{id}=await params;return <VetShareView petId={id}/>;}
