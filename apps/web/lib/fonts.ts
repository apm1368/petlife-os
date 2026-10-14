import localFont from "next/font/local";

// OFL-licensed variable fonts, self-hosted so builds do not depend on Google
// Fonts egress. Sources and licences live beside the verified font files.
export const vazirmatn = localFont({
  src: [
    { path: "./font-assets/vazirmatn-arabic-wght-normal.woff2", weight: "100 900", style: "normal" },
    { path: "./font-assets/vazirmatn-latin-wght-normal.woff2", weight: "100 900", style: "normal" },
  ],
  variable: "--font-vazirmatn",
  display: "swap",
});

export const inter = localFont({
  src: "./font-assets/inter-latin-wght-normal.woff2",
  weight: "100 900",
  variable: "--font-inter",
  display: "swap",
});
