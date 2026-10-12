import { YearReviewView } from "@/features/year-review/YearReviewView";

export default async function YearReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <YearReviewView petId={id} />;
}
