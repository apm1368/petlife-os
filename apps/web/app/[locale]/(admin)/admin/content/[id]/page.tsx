import { AdminContentArticleEditorView } from "@/features/content/AdminContentArticleEditorView";

export default async function AdminContentArticleEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminContentArticleEditorView articleId={id} />;
}
