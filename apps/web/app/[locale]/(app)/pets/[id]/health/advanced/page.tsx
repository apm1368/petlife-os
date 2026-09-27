import {redirect} from "next/navigation";
export default async function Page({params}:{params:Promise<{id:string;locale:string}>}){const{id,locale}=await params;redirect(`/${locale}/pets/${id}/health`);}
