import Flow from "@/app/[locale]/(auth)/welcome/page";
import { ParkAuthModal } from "@/features/auth/ParkAuthModal";

export default function AuthOverlay() {
  return <ParkAuthModal><Flow /></ParkAuthModal>;
}
