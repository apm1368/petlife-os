import { CareCenterView } from "@/features/care/CareCenterView";
export default async function Page({params}:{params:Promise<{id:string}>}) { const {id}=await params; return <CareCenterView petId={id}/>; }
