import {AdminExternalSourcesView} from "@/features/admin-travel-external/AdminExternalSourcesView";
export default async function ExternalRunPage({params}:{params:Promise<{id:string}>}){const{id}=await params;return <AdminExternalSourcesView runId={id}/>}
