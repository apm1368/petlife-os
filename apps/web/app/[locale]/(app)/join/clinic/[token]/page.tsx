import { ClinicClientInviteView } from "@/features/clinic/ClinicClientInviteView";

export default async function ClinicClientInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ClinicClientInviteView token={token} />;
}
