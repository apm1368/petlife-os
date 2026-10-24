import type {Metadata} from "next";
import {PublicHealthShareView} from "@/features/health-depth/PublicHealthShareView";
export const metadata:Metadata={robots:{index:false,follow:false,nocache:true},referrer:"no-referrer"};
export const dynamic="force-dynamic";
export default async function SharedHealthPage({params}:{params:Promise<{token:string}>}){const {token}=await params;return <PublicHealthShareView token={token}/>}
