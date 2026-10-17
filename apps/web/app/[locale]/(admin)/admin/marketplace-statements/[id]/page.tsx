import {AdminMarketplaceStatementsView} from "@/features/admin/AdminMarketplaceStatementsView";
export default function MarketplaceStatementPage({params}:{params:{id:string}}){return <AdminMarketplaceStatementsView statementId={params.id}/>}
