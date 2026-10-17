import {HealthActivityView} from "@/features/health-depth/HealthActivityView";
export default async function HealthActivityPage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <HealthActivityView petId={id}/>}
