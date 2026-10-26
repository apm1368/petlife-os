import { AdminUsersView } from "@/features/admin-users/AdminUsersView";

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminUsersView id={id} />;
}
