import {AdminAccessView} from "@/features/admin-access/AdminAccessView";
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <AdminAccessView id={id}/>}
