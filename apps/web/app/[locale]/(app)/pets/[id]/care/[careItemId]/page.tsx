import { CareCenterView } from "@/features/care/CareCenterView";
export default async function Page({params}:{params:Promise<{id:string;careItemId:string}>}) { const {id,careItemId}=await params; return <CareCenterView petId={id} itemId={careItemId}/>; }
