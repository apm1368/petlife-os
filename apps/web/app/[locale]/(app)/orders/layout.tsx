import type { ReactNode } from "react";
import { CommercePage } from "@/features/commerce/CommercePage";

export default function OrdersLayout({ children }: { children: ReactNode }) {
  return <CommercePage className="commerce-orders">{children}</CommercePage>;
}
