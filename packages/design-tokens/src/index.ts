export const typographyTokens = [
  "hero",
  "pageTitle",
  "sectionTitle",
  "body",
  "metadata",
  "status",
  "cta",
  "numeric",
] as const;

export type TypographyToken = (typeof typographyTokens)[number];

export const semanticColorTokens = [
  "surface-base",
  "surface-subtle",
  "surface-elevated",
  "surface-overlay",
  "text-primary",
  "text-secondary",
  "text-inverse",
  "text-disabled",
  "border-subtle",
  "border-strong",
  "brand-natural",
  "brand-natural-strong",
  "brand-mint",
  "brand-mint-strong",
  "ai-primary",
  "ai-primary-strong",
  "state-attention",
  "state-higher-concern",
  "state-urgent",
  "state-emergency",
  "state-success",
] as const;

export type SemanticColorToken = (typeof semanticColorTokens)[number];
