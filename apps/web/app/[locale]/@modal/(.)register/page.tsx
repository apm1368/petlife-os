import Flow from "@/app/[locale]/(auth)/register/page";
import { ParkAuthModal } from "@/features/auth/ParkAuthModal";

export default function AuthOverlay() {
  return <ParkAuthModal registration><Flow /></ParkAuthModal>;
}
