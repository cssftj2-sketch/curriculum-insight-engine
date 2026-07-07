import { useState } from "react";
import type { Page, Workspace } from "@/lib/workspace-store";
import { actions } from "@/lib/workspace-store";

export function Sidebar({
  workspace,
  selectedId,
  onSelect,
}: {
  workspace: Workspace;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-l border-border bg-card">
      <div className="flex items-center justify-between border-b border-border p-3">
        <span className="text-sm font-semibold">مساحة العمل</span>
        <button
          onClick={() => {
            const id = actions.addChild(null, { title: "صفحة جديدة" });
            onSelect(id);
          }}
          className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
          title="صفحة جديدة"
        >
          + جديد
        </button>
      </div>
      <div className="flex-1 overflow-auto p-2">
        <ul className="space-y-0.5">
          {workspace.pages.map((page) => (
            <TreeItem
              key={page.id}
              page={page}
              depth={0}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </ul>
      </div>
      <div className="flex gap-1 border-t border-border p-2 text-xs">
        <button
          onClick={() => {
            const blob = new Blob([JSON.stringify(workspace, null, 2)], {
              type: "application/json",
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "workspace.json";
            a.click();
            URL.revokeObjectURL(url);
          }}
          className="flex-1 rounded-md border border-input px-2 py-1.5 hover:bg-accent"
        >
          تصدير
        </button>
        <label className="flex-1 cursor-pointer rounded-md border border-input px-2 py-1.5 text-center hover:bg-accent">
          استيراد
          <input
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const reader = new FileReader();
              reader.onload = () => {
                try {
                  actions.replaceAll(JSON.parse(String(reader.result)));
                } catch {
                  alert("ملف JSON غير صالح");
                }
              };
              reader.readAsText(f);
            }}
          />
        </label>
        <button
          onClick={() => confirm("إعادة التعيين إلى الحالة الافتراضية؟") && actions.reset()}
          className="flex-1 rounded-md border border-input px-2 py-1.5 hover:bg-accent"
        >
          إعادة تعيين
        </button>
      </div>
    </aside>
  );
}

function TreeItem({
  page,
  depth,
  selectedId,
  onSelect,
}: {
  page: Page;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(depth < 1);
  const hasChildren = page.children.length > 0;
  const isSelected = page.id === selectedId;

  return (
    <li>
      <div
        className={`group flex items-center gap-1 rounded px-1.5 py-1 text-sm hover:bg-accent ${
          isSelected ? "bg-accent font-semibold" : ""
        }`}
        style={{ paddingRight: depth * 12 + 6 }}
      >
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-4 shrink-0 text-muted-foreground"
        >
          {hasChildren ? (open ? "▾" : "◂") : ""}
        </button>
        <button
          onClick={() => onSelect(page.id)}
          className="flex flex-1 items-center gap-1.5 truncate text-right"
        >
          <span>{page.icon}</span>
          <span className="truncate">{page.title}</span>
        </button>
        <button
          onClick={() => {
            const id = actions.addChild(page.id, { title: "صفحة فرعية" });
            setOpen(true);
            onSelect(id);
          }}
          className="hidden shrink-0 px-1 text-xs text-muted-foreground hover:text-foreground group-hover:block"
          title="إضافة صفحة فرعية"
        >
          +
        </button>
        <button
          onClick={() => {
            if (confirm(`حذف "${page.title}" وكل ما بداخلها؟`)) actions.deletePage(page.id);
          }}
          className="hidden shrink-0 px-1 text-xs text-muted-foreground hover:text-destructive group-hover:block"
          title="حذف"
        >
          🗑
        </button>
      </div>
      {open && hasChildren && (
        <ul className="space-y-0.5">
          {page.children.map((c) => (
            <TreeItem key={c.id} page={c} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </li>
  );
}
