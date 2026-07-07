import { useRef, useState } from "react";
import type { Page, Workspace } from "@/lib/workspace-store";
import { actions, pagePath } from "@/lib/workspace-store";
import { AutoDataForm } from "./AutoDataForm";
import { parseCurriculum } from "@/lib/curriculum-parser";
import { curriculumToPages } from "@/lib/curriculum-to-pages";

export function PageEditor({
  workspace,
  page,
  onSelect,
}: {
  workspace: Workspace;
  page: Page;
  onSelect: (id: string) => void;
}) {
  const [tab, setTab] = useState<"content" | "json">("content");
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const crumbs = pagePath(workspace.pages, page.id);
  const showCurriculumImporter = page.type === "chapter-list" || page.type === "unit-list";

  const runImport = (md: string) => {
    setImporting(true);
    try {
      const parsed = parseCurriculum(md);
      const pages = curriculumToPages(parsed.root);
      actions.importCurriculumUnderPage(page.id, pages);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="flex-1 overflow-auto p-8">
      {/* Breadcrumbs */}
      <div className="mb-4 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        {crumbs.map((c, i) => (
          <span key={c.id} className="flex items-center gap-1">
            {i > 0 && <span>/</span>}
            <button
              onClick={() => onSelect(c.id)}
              className="hover:text-foreground hover:underline"
            >
              {c.icon} {c.title}
            </button>
          </span>
        ))}
      </div>

      {/* Icon + title */}
      <div className="mb-1 flex items-center gap-2">
        <input
          value={page.icon}
          onChange={(e) => actions.updatePage(page.id, { icon: e.target.value })}
          className="w-12 rounded-md border border-input bg-background px-2 py-1 text-center text-lg"
        />
        <input
          dir="auto"
          value={page.title}
          onChange={(e) => actions.updatePage(page.id, { title: e.target.value })}
          className="flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-2xl font-bold hover:border-input focus:border-input focus:outline-none"
        />
      </div>
      <div className="mb-6 px-2 text-xs text-muted-foreground">النوع: {page.type}</div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b border-border">
        {(["content", "json"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-3 py-1.5 text-sm ${
              tab === t
                ? "border-primary font-semibold"
                : "border-transparent text-muted-foreground"
            }`}
          >
            {t === "content" ? "المحتوى" : "JSON"}
          </button>
        ))}
      </div>

      {tab === "content" ? (
        <AutoDataForm data={page.data} onChange={(next) => actions.setData(page.id, next)} />
      ) : (
        <textarea
          dir="ltr"
          value={JSON.stringify(page.data, null, 2)}
          onChange={(e) => {
            try {
              actions.setData(page.id, JSON.parse(e.target.value));
            } catch {
              /* keep typing until valid */
            }
          }}
          rows={16}
          className="w-full rounded-md border border-input bg-muted p-3 font-mono text-xs"
        />
      )}

      {/* Curriculum importer */}
      {showCurriculumImporter && (
        <div className="mt-6 rounded-md border border-dashed border-border p-4">
          <p className="mb-2 text-sm font-medium">استيراد من ملف Markdown</p>
          <p className="mb-3 text-xs text-muted-foreground">
            يحلّل الملف تلقائيًا (أبواب، دروس، أقسام) ويضيفها كصفحات فرعية هنا.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={importing}
              className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
            >
              {importing ? "جارٍ الاستيراد..." : "رفع ملف .md"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".md,.markdown,text/markdown,text/plain"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const reader = new FileReader();
                reader.onload = () => runImport(String(reader.result ?? ""));
                reader.readAsText(f);
              }}
            />
          </div>
        </div>
      )}

      {/* Sub-pages */}
      <div className="mt-8">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-muted-foreground">
            الصفحات الفرعية ({page.children.length})
          </h3>
          <button
            onClick={() => actions.addChild(page.id, { title: "صفحة فرعية" })}
            className="rounded-md border border-input px-2 py-1 text-xs hover:bg-accent"
          >
            + إضافة
          </button>
        </div>
        <ul className="divide-y divide-border rounded-md border border-border">
          {page.children.map((c, i) => (
            <li key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <button
                onClick={() => onSelect(c.id)}
                className="flex flex-1 items-center gap-2 text-right hover:underline"
              >
                <span>{c.icon}</span>
                <span>{c.title}</span>
                {c.children.length > 0 && (
                  <span className="text-xs text-muted-foreground">({c.children.length})</span>
                )}
              </button>
              <button
                onClick={() => actions.movePage(c.id, "up")}
                disabled={i === 0}
                className="text-xs text-muted-foreground disabled:opacity-30"
              >
                ▲
              </button>
              <button
                onClick={() => actions.movePage(c.id, "down")}
                disabled={i === page.children.length - 1}
                className="text-xs text-muted-foreground disabled:opacity-30"
              >
                ▼
              </button>
              <button
                onClick={() => confirm(`حذف "${c.title}"؟`) && actions.deletePage(c.id)}
                className="text-xs text-muted-foreground hover:text-destructive"
              >
                🗑
              </button>
            </li>
          ))}
          {page.children.length === 0 && (
            <li className="px-3 py-3 text-xs text-muted-foreground">لا توجد صفحات فرعية بعد.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
