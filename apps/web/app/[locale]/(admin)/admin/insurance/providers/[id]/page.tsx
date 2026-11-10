import {AdminInsuranceProviders} from "@/features/admin-insurance/AdminInsuranceProviders";
export default async function InsuranceProviderPage({params}:{params:Promise<{id:string}>}) {
  const { id } = await params;
  return <AdminInsuranceProviders providerId={id}/>;
}
