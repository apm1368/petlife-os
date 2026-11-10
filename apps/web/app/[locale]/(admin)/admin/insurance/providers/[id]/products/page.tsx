import {AdminInsuranceProducts} from "@/features/admin-insurance/AdminInsuranceProducts";
export default async function InsuranceProductsPage({params}:{params:Promise<{id:string}>}) {
  const { id } = await params;
  return <AdminInsuranceProducts providerId={id}/>;
}
