import {AdminVerificationView} from "@/features/partner-verification/AdminVerificationView";
import {notFound} from "next/navigation";
export default async function Page({params}:{params:Promise<{subject:string;id:string}>}){const {subject,id}=await params;const type=subject.toUpperCase();if(type!=="PROVIDER"&&type!=="SELLER")notFound();return <AdminVerificationView subject={type} id={id}/>}
