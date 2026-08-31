import { Inter, Vazirmatn } from "next/font/google";

// next/font self-hosts these at build time (no runtime Google Fonts request,
// no binaries committed to the repo) and exposes them as CSS variables so
// [dir="rtl"]/[dir="ltr"] in typography.css can select the right family.
export const vazirmatn = Vazirmatn({
  subsets: ["arabic", "latin"],
  variable: "--font-vazirmatn",
  display: "swap",
});

export const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
