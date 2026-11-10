import {AdminMarketplaceStatementsView} from "@/features/admin/AdminMarketplaceStatementsView";
export default async function MarketplaceStatementPage({params}:{params:Promise<{id:string}>}) {
  const { id } = await params;
  return <AdminMarketplaceStatementsView statementId={id}/>;
}
