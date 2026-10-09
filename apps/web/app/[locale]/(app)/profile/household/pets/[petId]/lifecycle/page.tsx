import { PetLifecycleView } from "@/features/account/PetLifecycleView";
export default async function Page({params}:{params:Promise<{petId:string}>}){const {petId}=await params;return <PetLifecycleView petId={petId}/>}
