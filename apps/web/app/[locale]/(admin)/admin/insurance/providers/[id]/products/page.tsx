import {AdminInsuranceProducts} from "@/features/admin-insurance/AdminInsuranceProducts";
export default function InsuranceProductsPage({params}:{params:{id:string}}){return <AdminInsuranceProducts providerId={params.id}/>}
