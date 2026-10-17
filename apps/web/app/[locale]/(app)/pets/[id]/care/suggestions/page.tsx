import {CareSuggestionsView} from "@/features/health-depth/CareSuggestionsView";
export default async function CareSuggestionsPage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <CareSuggestionsView petId={id}/>}
