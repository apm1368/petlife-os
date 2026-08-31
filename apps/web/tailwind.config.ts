import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: [
    "./app/**/*.{ts,tsx}",
    "./features/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        "surface-base": "var(--surface-base)",
        "surface-subtle": "var(--surface-subtle)",
        "surface-elevated": "var(--surface-elevated)",
        "surface-overlay": "var(--surface-overlay)",
        "text-primary": "var(--text-primary)",
        "text-secondary": "var(--text-secondary)",
        "text-inverse": "var(--text-inverse)",
        "text-disabled": "var(--text-disabled)",
        "border-subtle": "var(--border-subtle)",
        "border-strong": "var(--border-strong)",
        "brand-natural": "var(--brand-natural)",
        "brand-natural-strong": "var(--brand-natural-strong)",
        "brand-mint": "var(--brand-mint)",
        "brand-mint-strong": "var(--brand-mint-strong)",
        "ai-primary": "var(--ai-primary)",
        "ai-primary-strong": "var(--ai-primary-strong)",
        "state-attention": "var(--state-attention)",
        "state-higher-concern": "var(--state-higher-concern)",
        "state-urgent": "var(--state-urgent)",
        "state-emergency": "var(--state-emergency)",
        "state-success": "var(--state-success)",
      },
      fontSize: {
        hero: ["var(--text-hero-size)", { lineHeight: "var(--text-hero-line)", fontWeight: "var(--text-hero-weight)" }],
        "page-title": [
          "var(--text-page-title-size)",
          { lineHeight: "var(--text-page-title-line)", fontWeight: "var(--text-page-title-weight)" },
        ],
        "section-title": [
          "var(--text-section-title-size)",
          { lineHeight: "var(--text-section-title-line)", fontWeight: "var(--text-section-title-weight)" },
        ],
        body: ["var(--text-body-size)", { lineHeight: "var(--text-body-line)", fontWeight: "var(--text-body-weight)" }],
        metadata: [
          "var(--text-metadata-size)",
          { lineHeight: "var(--text-metadata-line)", fontWeight: "var(--text-metadata-weight)" },
        ],
        status: ["var(--text-status-size)", { lineHeight: "var(--text-status-line)", fontWeight: "var(--text-status-weight)" }],
        cta: ["var(--text-cta-size)", { lineHeight: "var(--text-cta-line)", fontWeight: "var(--text-cta-weight)" }],
        numeric: ["var(--text-numeric-size)", { lineHeight: "var(--text-numeric-line)", fontWeight: "var(--text-numeric-weight)" }],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
      },
    },
  },
  plugins: [],
};

export default config;
