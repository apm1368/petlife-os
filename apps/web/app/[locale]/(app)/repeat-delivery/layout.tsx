import type { ReactNode } from "react";
import { CommercePage } from "@/features/commerce/CommercePage";

export default function RepeatDeliveryLayout({ children }: { children: ReactNode }) {
  return <CommercePage className="commerce-repeat-delivery">{children}</CommercePage>;
}
