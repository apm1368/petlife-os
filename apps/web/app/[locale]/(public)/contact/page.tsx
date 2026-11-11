import { ContactView } from "@/features/contact/ContactView";
import { publicPageMetadata } from "@/lib/seo/public-metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return publicPageMetadata((await params).locale, "contact");
}

export default function ContactPage() { return <ContactView />; }
