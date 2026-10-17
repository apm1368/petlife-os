import { HouseholdInvitationView } from "@/features/account/HouseholdInvitationView";

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <HouseholdInvitationView token={token} />;
}
