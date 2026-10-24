import { PetAccessView } from "@/features/account/PetAccessView";
export default async function Page({params}:{params:Promise<{petId:string}>}){const {petId}=await params;return <PetAccessView petId={petId}/>}
