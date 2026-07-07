import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  actions,
  findPage,
  pagePath,
  useWorkspace,
  type Page,
} from "@/lib/workspace-store";
import { parseCurriculum, type CurriculumNode } from "@/lib/curriculum-parser";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "منصّة تصميم المناهج التكيّفية | Adaptive Curriculum Studio" },
      {
        name: "description",
        content:
          "مساحة عمل تفاعلية على غرار Notion/Linear لبناء المنهاج، خرائط المعرفة والمهارات، بنك الأسئلة، والتشخيص التكويني.",
      },
      { property: "og:title", content: "Adaptive Curriculum Studio" },
      { property: "og:description", content: "Design curricula, skill graphs, and question banks visually." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StudioPage,
});

function StudioPage() {
  const ws = useWorkspace();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!selectedId && ws.pages[0]) setSelectedId(ws.pages[0].id);
  }, [ws, selectedId]);

  const selected = useMemo(
    () => (selectedId ? findPage(ws.pages, selectedId) : null),
    [ws, selectedId],
  );

  const breadcrumbs = useMemo(
    () => (selectedId ? pagePath(ws.pages, selectedId) : []),
    [ws, selectedId],
  );

  return (
    <div dir="rtl" lang="ar" className="flex h-screen bg-background text-foreground">
      <Sidebar
        pages={ws.pages}
        selectedId={selectedId}
        onSelect={setSelectedId}
        query={query}
        onQueryChange={setQuery}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar breadcrumbs={breadcrumbs} onSelect={setSelectedId} />
        <div className="flex-1 overflow-auto">
          {selected ? (
            <PageEditor key={selected.id} page={selected} onSelect={setSelectedId} />
          ) : (
            <div className="p-10 text-muted-foreground">اختر صفحة من الشريط الجانبي.</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============ Sidebar ============

function Sidebar({
  pages,
  selectedId,
  onSelect,
  query,
  onQueryChange,
}: {
  pages: Page[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  query: string;
  onQueryChange: (v: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const exportAll = () => {
    const blob = new Blob([JSON.stringify({ version: 1, pages }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "workspace.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importAll = (f: File) => {
    const r = new FileReader();
    r.onload = () => {
      try {
        const parsed = JSON.parse(String(r.result));
        if (parsed?.pages) actions.replaceAll(parsed);
      } catch {
        alert("ملف JSON غير صالح");
      }
    };
    r.readAsText(f);
  };

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-l border-border bg-card">
      <div className="border-b border-border p-3">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <div className="text-sm font-bold">Curriculum Studio</div>
            <div className="text-[10px] text-muted-foreground">مساحة عمل تفاعلية</div>
          </div>
          <div className="flex gap-1">
            <IconBtn title="تصدير" onClick={exportAll}>⇩</IconBtn>
            <IconBtn title="استيراد" onClick={() => fileRef.current?.click()}>⇧</IconBtn>
            <IconBtn
              title="إعادة تعيين"
              onClick={() => confirm("سيتم استبدال البيانات بالنموذج الافتراضي.") && actions.reset()}
            >↺</IconBtn>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && importAll(e.target.files[0])}
            />
          </div>
        </div>
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="بحث..."
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      <div className="flex-1 overflow-auto p-2">
        <ul className="space-y-0.5">
          {pages.map((page) => (
            <TreeItem
              key={page.id}
              node={page}
              depth={0}
              selectedId={selectedId}
              onSelect={onSelect}
              query={query.trim().toLowerCase()}
            />
          ))}
        </ul>
        <button
          onClick={() => {
            const id = actions.addChild(null, { icon: "📁", title: "قسم جديد", type: "section" });
            onSelect(id);
          }}
          className="mt-2 w-full rounded px-2 py-1.5 text-right text-xs text-muted-foreground hover:bg-accent"
        >
          + إضافة قسم علوي
        </button>
      </div>
    </aside>
  );
}

function matchesQuery(n: Page, q: string): boolean {
  if (!q) return true;
  if (n.title.toLowerCase().includes(q)) return true;
  return n.children.some((c) => matchesQuery(c, q));
}

function TreeItem({
  node,
  depth,
  selectedId,
  onSelect,
  query,
}: {
  node: Page;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  query: string;
}) {
  const [open, setOpen] = useState(depth < 1);
  useEffect(() => {
    if (query) setOpen(true);
  }, [query]);

  if (!matchesQuery(node, query)) return null;

  const hasChildren = node.children.length > 0;
  const isSel = selectedId === node.id;

  return (
    <li>
      <div
        className={`group flex items-center gap-1 rounded px-1 py-1 text-sm hover:bg-accent ${
          isSel ? "bg-accent font-semibold" : ""
        }`}
        style={{ paddingRight: 4 + depth * 12 }}
      >
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-4 shrink-0 text-xs text-muted-foreground"
          aria-label="toggle"
        >
          {hasChildren ? (open ? "▾" : "◂") : "·"}
        </button>
        <span className="w-5 shrink-0 text-center">{node.icon}</span>
        <button
          onClick={() => onSelect(node.id)}
          className="flex-1 truncate text-right"
          title={node.title}
        >
          {node.title}
        </button>
        <button
          onClick={() => {
            const id = actions.addChild(node.id, {
              icon: "📄",
              title: "صفحة جديدة",
              type: "generic",
            });
            onSelect(id);
            setOpen(true);
          }}
          className="hidden shrink-0 rounded px-1 text-xs text-muted-foreground hover:bg-background group-hover:block"
          title="إضافة صفحة فرعية"
        >
          +
        </button>
      </div>
      {open && hasChildren && (
        <ul className="space-y-0.5">
          {node.children.map((c) => (
            <TreeItem
              key={c.id}
              node={c}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              query={query}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function IconBtn({
  children,
  title,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="grid h-7 w-7 place-items-center rounded border border-input text-xs hover:bg-accent"
    >
      {children}
    </button>
  );
}

// ============ Top bar ============

function TopBar({
  breadcrumbs,
  onSelect,
}: {
  breadcrumbs: Page[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex h-11 items-center gap-1 border-b border-border bg-card/50 px-4 text-xs text-muted-foreground">
      {breadcrumbs.map((p, i) => (
        <span key={p.id} className="flex items-center gap-1">
          {i > 0 && <span className="opacity-50">/</span>}
          <button
            onClick={() => onSelect(p.id)}
            className="rounded px-1 hover:bg-accent hover:text-foreground"
          >
            <span className="ml-1">{p.icon}</span>
            {p.title}
          </button>
        </span>
      ))}
    </div>
  );
}

// ============ Page editor ============

function PageEditor({ page, onSelect }: { page: Page; onSelect: (id: string) => void }) {
  const [title, setTitle] = useState(page.title);
  const [icon, setIcon] = useState(page.icon);
  const [json, setJson] = useState(() => JSON.stringify(page.data, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [mode, setMode] = useState<"page" | "json">("page");

  useEffect(() => {
    setTitle(page.title);
    setIcon(page.icon);
    setJson(JSON.stringify(page.data, null, 2));
    setJsonError(null);
  }, [page.id]);

  const commitMeta = () => {
    if (title !== page.title || icon !== page.icon) {
      actions.updatePage(page.id, { title: title || "بدون عنوان", icon: icon || "📄" });
    }
  };

  const commitJson = (val: string) => {
    setJson(val);
    try {
      const parsed = JSON.parse(val);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        actions.setData(page.id, parsed as Record<string, unknown>);
        setJsonError(null);
      } else {
        setJsonError("يجب أن يكون كائن JSON.");
      }
    } catch (e) {
      setJsonError((e as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-2 flex items-center gap-3">
        <input
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          onBlur={commitMeta}
          className="w-14 rounded bg-transparent text-center text-4xl outline-none hover:bg-accent"
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitMeta}
          className="flex-1 bg-transparent text-3xl font-bold outline-none"
        />
        <div className="flex gap-1">
          <button
            onClick={() => setMode(mode === "page" ? "json" : "page")}
            className="rounded-md border border-input px-3 py-1.5 text-xs hover:bg-accent"
          >
            {mode === "page" ? "عرض JSON" : "عرض الصفحة"}
          </button>
          <button
            onClick={() => {
              if (confirm("حذف هذه الصفحة وكل ما تحتها؟")) actions.deletePage(page.id);
            }}
            className="rounded-md border border-input px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
          >
            حذف
          </button>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
        <span className="rounded bg-muted px-2 py-0.5 font-mono">{page.type}</span>
        <span className="rounded bg-muted px-2 py-0.5 font-mono">id: {page.id.slice(0, 8)}</span>
        <button
          onClick={() => actions.movePage(page.id, "up")}
          className="rounded border border-input px-2 hover:bg-accent"
        >
          ↑
        </button>
        <button
          onClick={() => actions.movePage(page.id, "down")}
          className="rounded border border-input px-2 hover:bg-accent"
        >
          ↓
        </button>
      </div>

      {mode === "page" ? (
        <PageBody page={page} onSelect={onSelect} />
      ) : (
        <div>
          <textarea
            value={json}
            onChange={(e) => commitJson(e.target.value)}
            dir="ltr"
            spellCheck={false}
            className="min-h-[400px] w-full rounded-md border border-input bg-background p-3 font-mono text-xs outline-none focus:ring-2 focus:ring-ring"
          />
          {jsonError && (
            <p className="mt-2 text-xs text-destructive">JSON غير صالح: {jsonError}</p>
          )}
        </div>
      )}
    </div>
  );
}

function PageBody({ page, onSelect }: { page: Page; onSelect: (id: string) => void }) {
  return (
    <div className="space-y-8">
      <TypedRenderer page={page} />
      <ChildrenBlock page={page} onSelect={onSelect} />
    </div>
  );
}

function ChildrenBlock({ page, onSelect }: { page: Page; onSelect: (id: string) => void }) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground">
          الصفحات الفرعية ({page.children.length})
        </h3>
        <button
          onClick={() => {
            const id = actions.addChild(page.id, {
              icon: "📄",
              title: "صفحة جديدة",
              type: "generic",
            });
            onSelect(id);
          }}
          className="rounded-md border border-input px-3 py-1 text-xs hover:bg-accent"
        >
          + صفحة فرعية
        </button>
      </div>
      {page.children.length === 0 ? (
        <p className="rounded border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          لا توجد صفحات فرعية بعد.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {page.children.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className="flex items-center gap-3 rounded-md border border-border bg-card p-3 text-right hover:border-primary/50 hover:bg-accent"
            >
              <span className="text-2xl">{c.icon}</span>
              <div className="flex-1 overflow-hidden">
                <div className="truncate text-sm font-medium">{c.title}</div>
                <div className="truncate text-[10px] text-muted-foreground">
                  {c.type} · {c.children.length} فرعية
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============ Typed renderers per page type ============

function TypedRenderer({ page }: { page: Page }) {
  switch (page.type) {
    case "chapter-list":
      return <ChapterListView page={page} />;
    case "kg-nodes":
      return <KgNodesView page={page} />;
    case "kg-edges":
      return <KgEdgesView page={page} />;
    case "question-list":
      return <QuestionListView page={page} />;
    case "hypothesis-list":
      return <HypothesisListView page={page} />;
    case "lo-list":
      return <ListView page={page} listKey="outcomes" label="ناتج تعلّم" />;
    case "prereq-list":
      return <ListView page={page} listKey="items" label="متطلّب سابق" />;
    default:
      return <KeyValueView page={page} />;
  }
}

function KeyValueView({ page }: { page: Page }) {
  const entries = Object.entries(page.data);
  if (entries.length === 0) {
    return (
      <p className="rounded border border-dashed border-border p-4 text-sm text-muted-foreground">
        لا توجد بيانات. استخدم <b>عرض JSON</b> لإضافة حقول.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {entries.map(([k, v]) => (
        <div key={k} className="rounded-md border border-border bg-card p-3">
          <div className="mb-1 text-[11px] font-mono text-muted-foreground">{k}</div>
          <div className="text-sm">
            {typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? (
              String(v)
            ) : (
              <pre dir="ltr" className="overflow-auto text-xs">
                {JSON.stringify(v, null, 2)}
              </pre>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ListView({ page, listKey, label }: { page: Page; listKey: string; label: string }) {
  const items = (page.data[listKey] as unknown[]) ?? [];
  const [text, setText] = useState("");
  const add = () => {
    if (!text.trim()) return;
    actions.setData(page.id, { ...page.data, [listKey]: [...items, text.trim()] });
    setText("");
  };
  const remove = (i: number) => {
    const next = items.slice();
    next.splice(i, 1);
    actions.setData(page.id, { ...page.data, [listKey]: next });
  };
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`أضف ${label}...`}
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <button
          onClick={add}
          className="rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
        >
          إضافة
        </button>
      </div>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li
            key={i}
            className="flex items-center gap-2 rounded border border-border bg-card px-3 py-2 text-sm"
          >
            <span className="w-6 text-xs text-muted-foreground">{i + 1}.</span>
            <span className="flex-1">{typeof it === "string" ? it : JSON.stringify(it)}</span>
            <button onClick={() => remove(i)} className="text-xs text-destructive">حذف</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function QuestionListView({ page }: { page: Page }) {
  const questions = ((page.data.questions as Array<Record<string, unknown>>) ?? []);
  const [draft, setDraft] = useState({ stem: "", answer: "", skill: "" });
  const add = () => {
    if (!draft.stem.trim()) return;
    const next = [...questions, { id: "q." + Math.random().toString(36).slice(2, 8), ...draft }];
    actions.setData(page.id, { ...page.data, questions: next });
    setDraft({ stem: "", answer: "", skill: "" });
  };
  const remove = (i: number) => {
    const next = questions.slice();
    next.splice(i, 1);
    actions.setData(page.id, { ...page.data, questions: next });
  };
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border bg-card p-3">
        <div className="mb-2 text-xs font-semibold">سؤال جديد</div>
        <textarea
          value={draft.stem}
          onChange={(e) => setDraft({ ...draft, stem: e.target.value })}
          placeholder="نصّ السؤال..."
          className="w-full rounded border border-input bg-background p-2 text-sm"
          rows={2}
        />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <input
            value={draft.answer}
            onChange={(e) => setDraft({ ...draft, answer: e.target.value })}
            placeholder="الإجابة"
            className="rounded border border-input bg-background px-2 py-1.5 text-sm"
          />
          <input
            value={draft.skill}
            onChange={(e) => setDraft({ ...draft, skill: e.target.value })}
            placeholder="skill.id"
            className="rounded border border-input bg-background px-2 py-1.5 text-sm"
            dir="ltr"
          />
        </div>
        <div className="mt-2 text-left">
          <button
            onClick={add}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
          >
            إضافة سؤال
          </button>
        </div>
      </div>
      {questions.length === 0 ? (
        <p className="text-xs text-muted-foreground">لا توجد أسئلة بعد.</p>
      ) : (
        <ul className="space-y-2">
          {questions.map((q, i) => (
            <li key={i} className="rounded-md border border-border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="text-sm">{String(q.stem ?? "")}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    الإجابة: {String(q.answer ?? "—")} · المهارة:{" "}
                    <span dir="ltr" className="font-mono">{String(q.skill ?? "—")}</span>
                  </div>
                </div>
                <button onClick={() => remove(i)} className="text-xs text-destructive">حذف</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function HypothesisListView({ page }: { page: Page }) {
  const items = ((page.data.items as Array<Record<string, unknown>>) ?? []);
  const [text, setText] = useState("");
  const add = () => {
    if (!text.trim()) return;
    const next = [...items, { id: "h." + Math.random().toString(36).slice(2, 6), text: text.trim() }];
    actions.setData(page.id, { ...page.data, items: next });
    setText("");
  };
  const remove = (i: number) => {
    const next = items.slice();
    next.splice(i, 1);
    actions.setData(page.id, { ...page.data, items: next });
  };
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="فرضية تشخيصية جديدة..."
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <button
          onClick={add}
          className="rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
        >
          إضافة
        </button>
      </div>
      <ul className="space-y-1">
        {items.map((h, i) => (
          <li key={i} className="flex items-center gap-2 rounded border border-border bg-card px-3 py-2 text-sm">
            <span dir="ltr" className="font-mono text-[10px] text-muted-foreground">{String(h.id)}</span>
            <span className="flex-1">{String(h.text)}</span>
            <button onClick={() => remove(i)} className="text-xs text-destructive">حذف</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function KgNodesView({ page }: { page: Page }) {
  const nodes = ((page.data.nodes as Array<{ id: string; label: string }>) ?? []);
  const [draft, setDraft] = useState({ id: "", label: "" });
  const add = () => {
    if (!draft.id.trim() || !draft.label.trim()) return;
    actions.setData(page.id, { ...page.data, nodes: [...nodes, draft] });
    setDraft({ id: "", label: "" });
  };
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input dir="ltr" value={draft.id} onChange={(e) => setDraft({ ...draft, id: e.target.value })}
          placeholder="node id" className="w-32 rounded border border-input bg-background px-2 py-1.5 text-sm" />
        <input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          placeholder="التسمية" className="flex-1 rounded border border-input bg-background px-2 py-1.5 text-sm" />
        <button onClick={add} className="rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground">+</button>
      </div>
      <div className="flex flex-wrap gap-2">
        {nodes.map((n, i) => (
          <span key={i} className="rounded-full border border-border bg-card px-3 py-1 text-xs">
            <span dir="ltr" className="ml-1 font-mono text-[10px] text-muted-foreground">{n.id}</span>
            {n.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function KgEdgesView({ page }: { page: Page }) {
  const edges = ((page.data.edges as Array<{ from: string; to: string; type: string }>) ?? []);
  return (
    <div>
      {edges.length === 0 ? (
        <p className="text-xs text-muted-foreground">لا توجد روابط.</p>
      ) : (
        <ul dir="ltr" className="space-y-1 font-mono text-xs">
          {edges.map((e, i) => (
            <li key={i} className="rounded border border-border bg-card px-3 py-1.5">
              {e.from} <span className="text-muted-foreground">─ {e.type} →</span> {e.to}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">
        عدّل الروابط من عرض JSON.
      </p>
    </div>
  );
}

// ============ Chapter list — imports from Markdown ============

function ChapterListView({ page }: { page: Page }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const importFromText = (text: string) => {
    setBusy(true);
    try {
      const { root } = parseCurriculum(text);
      const imported = curriculumToPages(root);
      actions.importCurriculumUnderPage(page.id, imported);
    } finally {
      setBusy(false);
    }
  };

  const importSample = async () => {
    const res = await fetch("/samples/math-1am.md");
    importFromText(await res.text());
  };

  const importFile = (f: File) => {
    const r = new FileReader();
    r.onload = () => importFromText(String(r.result ?? ""));
    r.readAsText(f);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-dashed border-border bg-muted/30 p-4">
        <div className="mb-2 text-sm font-semibold">استيراد الفصول من ملف Markdown</div>
        <p className="mb-3 text-xs text-muted-foreground">
          يكتشف المحلّل الأبواب، الدروس، أنشطة «اكتشف»، «أتمرّن»، «أقوم تعلّماتي»، والوضعيات
          تلقائيًا ويضيفها كصفحات فرعية.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={importSample}
            disabled={busy}
            className="rounded-md border border-input px-3 py-1.5 text-xs hover:bg-accent"
          >
            استيراد الملف النموذجي (رياضيات 1م)
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
          >
            رفع ملف .md
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".md,.markdown,text/markdown,text/plain"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])}
          />
        </div>
      </div>
    </div>
  );
}

const TYPE_TO_ICON: Record<string, string> = {
  chapter: "📘", learn: "📗", discover: "🔎", methods: "🧰",
  assess: "🧪", integration: "🧩", "prior-knowledge": "🎒",
  summary: "📝", exercises: "✏️", deepen: "🚀", ict: "💻",
  situation: "🎬", guidance: "🧭", solution: "✅",
  "numbered-lesson": "📑", "learning-goals": "🎯",
  "front-matter": "📄", toc: "📇", section: "📁", root: "🗂️",
};

function curriculumToPages(root: CurriculumNode): Page[] {
  const uid = () => (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 12));
  const convert = (n: CurriculumNode): Page => ({
    id: uid(),
    icon: TYPE_TO_ICON[n.type] ?? "📄",
    title: n.title,
    type: `md.${n.type}`,
    data: {
      sourceType: n.type,
      level: n.level,
      startLine: n.startLine,
      endLine: n.endLine,
      images: n.images,
      content: n.content,
    },
    children: n.children.map(convert),
  });
  return root.children.map(convert);
}
