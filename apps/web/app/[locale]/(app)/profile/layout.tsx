import { AccountNav } from "@/features/account/AccountNav";

export default function ProfileLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="account-shell">
      <AccountNav />
      <div className="account-content">{children}</div>
    </div>
  );
}
