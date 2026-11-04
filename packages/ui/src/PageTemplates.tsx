import type { ReactNode } from "react";
import { cn } from "./cn";

interface TemplateProps { title: ReactNode; children: ReactNode; primaryAction?: ReactNode; className?: string; }
function Frame({ title, children, primaryAction, className }: TemplateProps) {
  return <main className={cn("mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 text-text-primary", className)}><header className="border-b border-border-subtle pb-4"><h1 className="text-page-title">{title}</h1></header>{children}{primaryAction}</main>;
}

/** DS-02 templates are structural only; they do not fetch or route. */
export function ListPageTemplate(props: TemplateProps) { return <Frame {...props} />; }
export function DetailPageTemplate(props: TemplateProps) { return <Frame {...props} />; }
export function MultiStepFormTemplate({ children, ...props }: TemplateProps) { return <Frame {...props}><ol className="flex flex-wrap gap-2 text-metadata text-text-secondary" aria-label="Progress">{children}</ol></Frame>; }
export function DashboardTemplate(props: TemplateProps) { return <Frame {...props} />; }
export function TimelineTemplate({ children, ...props }: TemplateProps) { return <Frame {...props}><ol className="border-s border-border-subtle ps-4">{children}</ol></Frame>; }
export function ResultPageTemplate(props: TemplateProps) { return <Frame {...props} />; }

export const pageTemplates = ["list", "detail", "multi-step-form", "dashboard", "timeline", "result-success"] as const;
export type PageTemplate = (typeof pageTemplates)[number];
