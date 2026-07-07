import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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
  const [selectedId, setSelectedId] = useState<string | null>(
    workspace.pages[0]?.id ?? null,
  );

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
