import type { Metadata } from "next";
import { PartnerJoinView } from "@/features/partners/PartnerJoinView";

export const metadata: Metadata = { title: "ثبت‌نام همکار | opetlife" };

export default function PartnerJoinPage() {
  return <PartnerJoinView />;
}
