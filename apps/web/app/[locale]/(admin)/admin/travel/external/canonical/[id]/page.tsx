import {ExternalMatchesView} from "@/features/admin-travel-external/ExternalMatchesView";
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <ExternalMatchesView canonicalId={id}/>}
