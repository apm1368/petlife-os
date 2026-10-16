import {AdminInsuranceProviders} from "@/features/admin-insurance/AdminInsuranceProviders";
export default function InsuranceProviderPage({params}:{params:{id:string}}){return <AdminInsuranceProviders providerId={params.id}/>}
