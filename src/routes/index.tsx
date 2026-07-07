import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  parseCurriculum,
  type CurriculumNode,
  type HeadingType,
  type ParseResult,
} from "@/lib/curriculum-parser";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "محلل ومعاين المنهاج | Curriculum Parser & Viewer" },
      {
        name: "description",
        content:
          "معاين ذكي لملفات المنهاج (Markdown) يكتشف الأبواب والدروس والتمارين تلقائيًا ويصدّرها إلى JSON.",
      },
      { property: "og:title", content: "محلل ومعاين المنهاج" },
      {
        property: "og:description",
        content: "حلّل كتابك المدرسي (Markdown) واستخرج بنيته إلى JSON.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CurriculumViewerPage,
});

// ─────────────────────────────────────────────────────────────────────────
// Local presentation layer — the new parser no longer exports TYPE_LABELS_AR
// or toJSON(), so both live here now, keyed on HeadingType instead of the
// old NodeType.
// ─────────────────────────────────────────────────────────────────────────

const TYPE_LABELS_AR: Record<HeadingType, string> = {
  front_matter: "مقدمة",
  toc: "الفهرس",
  chapter: "باب",
  learning_goals: "أهداف التعلم",
  numbered_lesson: "درس مرقّم",
  section_marker: "علامة قسم",
  subsection: "قسم فرعي",
  content_block: "كتلة محتوى",
  other: "أخرى",
};

const TYPE_COLORS: Record<HeadingType, string> = {
  front_matter: "bg-slate-200 text-slate-800",
  toc: "bg-slate-200 text-slate-800",
  chapter: "bg-primary text-primary-foreground",
  learning_goals: "bg-amber-200 text-amber-900",
  numbered_lesson: "bg-blue-200 text-blue-900",
  section_marker: "bg-sky-200 text-sky-900",
  subsection: "bg-teal-200 text-teal-900",
  content_block: "bg-orange-200 text-orange-900",
  other: "bg-muted text-muted-foreground",
};

function nodeToJSON(n: CurriculumNode, includeContent: boolean): unknown {
  return {
    id: n.id,
    title: n.title,
    level: n.level,
    type: n.type,
    ...(includeContent
      ? { paragraphs: n.paragraphs, images: n.images, content: n.content }
      : { images: n.images }),
    children: n.children.map((c) => nodeToJSON(c, includeContent)),
  };
}

// Per-type counts for the header badges — the new ParseResult.stats no
// longer includes a `byType` breakdown, so it's derived here.
function computeTypeCounts(root: CurriculumNode): Record<string, number> {
  const counts: Record<string, number> = {};
  const walk = (n: CurriculumNode) => {
    if (n.id !== "root") counts[n.type] = (counts[n.type] ?? 0) + 1;
    n.children.forEach(walk);
  };
  walk(root);
  return counts;
}

function CurriculumViewerPage() {
  const [markdown, setMarkdown] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parsed: ParseResult | null = useMemo(
    () => (markdown ? parseCurriculum(markdown) : null),
    [markdown],
  );

  const typeCounts = useMemo(
    () => (parsed ? computeTypeCounts(parsed.root) : {}),
    [parsed],
  );

  // Auto-select first top-level node after parse
  useEffect(() => {
    if (parsed && !selectedId && parsed.root.children[0]) {
      setSelectedId(parsed.root.children[0].id);
    }
  }, [parsed, selectedId]);

  const loadSample = async () => {
    setLoading(true);
    try {
      const res = await fetch("/samples/math-1am.md");
      const text = await res.text();
      setMarkdown(text);
      setFileName("math-1am.md (نموذج)");
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  };

  const onFile = (f: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      setMarkdown(String(reader.result ?? ""));
      setFileName(f.name);
      setSelectedId(null);
    };
    reader.readAsText(f);
  };

  const selected = useMemo(() => {
    if (!parsed || !selectedId) return null;
    return findNode(parsed.root, selectedId);
  }, [parsed, selectedId]);

  const exportJson = (mode: "full" | "structure") => {
    if (!parsed) return;
    const data = nodeToJSON(parsed.root, mode === "full");
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (fileName.replace(/\.[^.]+$/, "") || "curriculum") +
      (mode === "full" ? ".full.json" : ".structure.json");
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div dir="rtl" lang="ar" className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3 px-6 py-4">
          <div className="flex-1">
            <h1 className="text-xl font-bold">محلل ومعاين المنهاج</h1>
            <p className="text-xs text-muted-foreground">
              يكتشف الأبواب، الدروس، التمارين، والوضعيات تلقائيًا من ملفات Markdown
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={loadSample}
              disabled={loading}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent"
            >
              تحميل الملف النموذجي
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              رفع ملف .md
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.markdown,text/markdown,text/plain"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            />
            <button
              onClick={() => exportJson("structure")}
              disabled={!parsed}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
            >
              تصدير البنية JSON
            </button>
            <button
              onClick={() => exportJson("full")}
              disabled={!parsed}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent disabled:opacity-50"
            >
              تصدير JSON كامل
            </button>
          </div>
        </div>
        {parsed && (
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-1 px-6 pb-3 text-xs text-muted-foreground">
            <span>الملف: <b className="text-foreground">{fileName}</b></span>
            <span>العناوين: <b className="text-foreground">{parsed.stats.totalHeadings}</b></span>
            <span>الأبواب: <b className="text-foreground">{parsed.stats.chapters}</b></span>
            <span>الدروس: <b className="text-foreground">{parsed.stats.lessons}</b></span>
            <span>الصور المرجعية: <b className="text-foreground">{parsed.stats.images}</b></span>
            <span title="عدد العناوين التي صُنّفت بثقة قوية مقابل ضعيفة (استدلال)">
              الثقة: <b className="text-foreground">{parsed.stats.confidence.strong}</b> قوية /{" "}
              <b className="text-foreground">{parsed.stats.confidence.weak}</b> ضعيفة
            </span>
            <span className="flex flex-wrap gap-1">
              {Object.entries(typeCounts).map(([t, n]) => (
                <span
                  key={t}
                  className={`rounded px-1.5 py-0.5 ${TYPE_COLORS[t as HeadingType] ?? ""}`}
                >
                  {TYPE_LABELS_AR[t as HeadingType] ?? t}: {n}
                </span>
              ))}
            </span>
          </div>
        )}
      </header>

      {!parsed ? (
        <EmptyState onLoadSample={loadSample} loading={loading} />
      ) : (
        <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-4 px-6 py-6 lg:grid-cols-[380px_1fr]">
          <aside className="max-h-[calc(100vh-180px)] overflow-auto rounded-lg border border-border bg-card p-3">
            <input
              placeholder="بحث في العناوين..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="mb-3 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <TreeView
              node={parsed.root}
              selectedId={selectedId}
              onSelect={setSelectedId}
              query={query.trim().toLowerCase()}
              depth={0}
            />
          </aside>

          <main className="max-h-[calc(100vh-180px)] overflow-auto rounded-lg border border-border bg-card p-6">
            {selected ? <NodeDetail node={selected} /> : (
              <p className="text-muted-foreground">اختر عنصرًا من الشجرة لعرض محتواه.</p>
            )}
          </main>
        </div>
      )}
    </div>
  );
}

function findNode(root: CurriculumNode, id: string): CurriculumNode | null {
  if (root.id === id) return root;
  for (const c of root.children) {
    const f = findNode(c, id);
    if (f) return f;
  }
  return null;
}

function nodeMatchesQuery(n: CurriculumNode, q: string): boolean {
  if (!q) return true;
  if (n.title.toLowerCase().includes(q)) return true;
  return n.children.some((c) => nodeMatchesQuery(c, q));
}

function TreeView({
  node,
  selectedId,
  onSelect,
  query,
  depth,
}: {
  node: CurriculumNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
  query: string;
  depth: number;
}) {
  const [open, setOpen] = useState(depth < 2);
  useEffect(() => {
    if (query) setOpen(true);
  }, [query]);

  const isRoot = node.id === "root";
  const visibleChildren = node.children.filter((c) => nodeMatchesQuery(c, query));

  if (isRoot) {
    return (
      <ul className="space-y-0.5">
        {visibleChildren.map((c) => (
          <li key={c.id}>
            <TreeView
              node={c}
              selectedId={selectedId}
              onSelect={onSelect}
              query={query}
              depth={depth + 1}
            />
          </li>
        ))}
      </ul>
    );
  }

  const hasChildren = visibleChildren.length > 0;
  const isSelected = node.id === selectedId;

  return (
    <div>
      <div
        className={`flex items-center gap-1 rounded px-1 py-1 text-sm hover:bg-accent ${
          isSelected ? "bg-accent font-semibold" : ""
        }`}
      >
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-4 shrink-0 text-muted-foreground"
          aria-label="toggle"
        >
          {hasChildren ? (open ? "▾" : "◂") : "•"}
        </button>
        <button
          onClick={() => onSelect(node.id)}
          className="flex-1 truncate text-right"
          title={node.title}
        >
          {node.title}
        </button>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${TYPE_COLORS[node.type]}`}
        >
          {TYPE_LABELS_AR[node.type]}
        </span>
      </div>
      {open && hasChildren && (
        <ul className="mr-4 border-r border-border pr-2">
          {visibleChildren.map((c) => (
            <li key={c.id}>
              <TreeView
                node={c}
                selectedId={selectedId}
                onSelect={onSelect}
                query={query}
                depth={depth + 1}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NodeDetail({ node }: { node: CurriculumNode }) {
  const [tab, setTab] = useState<"view" | "raw" | "json">("view");
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className={`rounded px-2 py-0.5 text-xs ${TYPE_COLORS[node.type]}`}>
          {TYPE_LABELS_AR[node.type]}
        </span>
        <h2 className="text-xl font-bold">{node.title}</h2>
        <span className="text-xs text-muted-foreground">
          المستوى الدلالي: {node.level}
        </span>
      </div>

      <div className="mb-4 flex gap-1 border-b border-border">
        {(["view", "raw", "json"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-b-2 px-3 py-1.5 text-sm ${
              tab === t ? "border-primary font-semibold" : "border-transparent text-muted-foreground"
            }`}
          >
            {t === "view" ? "عرض" : t === "raw" ? "Markdown" : "JSON"}
          </button>
        ))}
      </div>

      {tab === "view" && <RenderedContent node={node} />}
      {tab === "raw" && (
        <pre dir="rtl" className="whitespace-pre-wrap rounded bg-muted p-4 text-sm">
          {node.content || "(لا يوجد محتوى)"}
        </pre>
      )}
      {tab === "json" && (
        <pre dir="ltr" className="overflow-auto rounded bg-muted p-4 text-xs">
          {JSON.stringify(nodeToJSON(node, true), null, 2)}
        </pre>
      )}
    </div>
  );
}

function RenderedContent({ node }: { node: CurriculumNode }) {
  if (node.paragraphs.length === 0 && node.children.length === 0) {
    return <p className="text-muted-foreground">(هذا العنوان لا يحتوي محتوى مباشرًا)</p>;
  }
  return (
    <div className="space-y-4 leading-relaxed">
      {node.paragraphs.map((p, i) => (
        <ParagraphBlock key={i} text={p} />
      ))}
      {node.children.length > 0 && (
        <div className="mt-6 rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
          يحتوي هذا القسم على <b>{node.children.length}</b> عنصر فرعي — استعرضها من الشجرة.
        </div>
      )}
    </div>
  );
}

function ParagraphBlock({ text }: { text: string }) {
  const imgMatch = text.match(/^!\[[^\]]*\]\(([^)]+)\)$/);
  if (imgMatch) {
    return (
      <div className="rounded border border-dashed border-border bg-muted/40 p-3 text-center text-xs text-muted-foreground">
        [صورة مرجعية: {imgMatch[1]}]
      </div>
    );
  }
  return <p className="whitespace-pre-wrap">{text}</p>;
}

function EmptyState({ onLoadSample, loading }: { onLoadSample: () => void; loading: boolean }) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-center">
      <h2 className="text-2xl font-bold">ابدأ بتحليل ملفك</h2>
      <p className="mt-3 text-muted-foreground">
        ارفع ملف Markdown لكتاب مدرسي (مثل كتاب الرياضيات للسنة الأولى متوسط) وسيقوم المحلل
        باكتشاف بنيته تلقائيًا: الأبواب، الدروس، أنشطة «اكتشف»، «أتعلّم»، «أتمرّن»،
        «أقوم تعلّماتي»، الوضعيات التقويمية والحلول، ثم يتيح لك تصديرها إلى JSON.
      </p>
      <div className="mt-6 flex justify-center gap-2">
        <button
          onClick={onLoadSample}
          disabled={loading}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          {loading ? "جارٍ التحميل..." : "جرّب على الملف النموذجي"}
        </button>
      </div>
    </div>
  );
}
