import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useWorkspace, findPage } from "@/lib/workspace-store";
import { Sidebar } from "@/components/workspace/Sidebar";
import { PageEditor } from "@/components/workspace/PageEditor";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [{ title: "مساحة العمل | Curriculum Insight Engine" }],
  }),
  component: WorkspacePage,
});

function WorkspacePage() {
  const workspace = useWorkspace();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    setSelectedId((prev) => prev ?? workspace.pages[0]?.id ?? null);
  }, [workspace.pages]);

  if (!hydrated) {
    return <div dir="rtl" lang="ar" className="flex h-screen items-center justify-center bg-background text-muted-foreground">جارٍ التحميل...</div>;
  }


  const selected = selectedId ? findPage(workspace.pages, selectedId) : null;

  return (
    <div dir="rtl" lang="ar" className="flex h-screen bg-background text-foreground">
      <Sidebar workspace={workspace} selectedId={selectedId} onSelect={setSelectedId} />
      {selected ? (
        <PageEditor workspace={workspace} page={selected} onSelect={setSelectedId} />
      ) : (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          اختر صفحة من الشريط الجانبي
        </div>
      )}
    </div>
  );
}
