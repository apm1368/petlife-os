import { InsurerApplicationView } from "@/features/insurer/InsurerPortalViews";

export default async function InsurerApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <InsurerApplicationView applicationId={id} />;
}
