import {ExternalStayInspector} from "@/features/admin-travel-external/ExternalStayInspector";
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <ExternalStayInspector id={id}/>}
