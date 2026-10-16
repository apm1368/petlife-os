import {HealthSharesView} from "@/features/health-depth/HealthSharesView";
export default async function HealthLinksPage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <HealthSharesView petId={id}/>}
