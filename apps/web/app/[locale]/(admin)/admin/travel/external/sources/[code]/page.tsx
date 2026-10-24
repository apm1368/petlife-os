import {AdminExternalSourcesView} from "@/features/admin-travel-external/AdminExternalSourcesView";
export default async function ExternalSourcePage({params}:{params:Promise<{code:string}>}){const{code}=await params;return <AdminExternalSourcesView sourceCode={code}/>}
