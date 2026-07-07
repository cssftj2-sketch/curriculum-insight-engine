// Curriculum markdown parser
// Detects hierarchical structure from ATX headings (# .. ######) and
// classifies each node using Arabic pedagogical keywords found in the
// Algerian "Génération 2" math textbooks (e.g. اكتشف / أتمرّن / وضعية تقويم).

export type NodeType =
  | "root"
  | "front-matter"
  | "toc"
  | "chapter"
  | "learning-goals"
  | "discover"
  | "learn"
  | "methods"
  | "assess"
  | "integration"
  | "prior-knowledge"
  | "summary"
  | "exercises"
  | "deepen"
  | "ict"
  | "situation"
  | "guidance"
  | "solution"
  | "numbered-lesson"
  | "section";

export interface CurriculumNode {
  id: string;
  title: string;
  level: number; // 0 for root, 1..6 for headings
  type: NodeType;
  startLine: number;
  endLine: number;
  content: string;          // raw markdown body (excluding own heading)
  paragraphs: string[];     // non-empty content lines
  images: string[];         // image src references found in body
  children: CurriculumNode[];
}

interface Rule {
  type: NodeType;
  test: (title: string) => boolean;
}

// Order matters — first match wins.
const RULES: Rule[] = [
  { type: "toc",             test: (t) => /الفهرس/.test(t) },
  { type: "front-matter",    test: (t) => /(تقديم الكتاب|استعمال الكتاب|موقع عيون البصائر)/.test(t) },
  { type: "learning-goals",  test: (t) => /سأتعلم في هذا الباب/.test(t) },
  { type: "discover",        test: (t) => /اكتشف/.test(t) },
  { type: "methods",         test: (t) => /اكتسب طرائق/.test(t) },
  { type: "assess",          test: (t) => /أقوم\s*تعل[ّـ]?ماتي/.test(t) },
  { type: "integration",     test: (t) => /أتعلم الإدماج/.test(t) },
  { type: "prior-knowledge", test: (t) => /أستحضر مكتسباتي/.test(t) },
  { type: "summary",         test: (t) => /أحوصل تعل[ّـ]?ماتي/.test(t) },
  { type: "exercises",       test: (t) => /أتمر[ّـ]?ن/.test(t) },
  { type: "deepen",          test: (t) => /أتعم[ّـ]?ق/.test(t) },
  { type: "ict",             test: (t) => /(تكنولوجيات الإعلام|المجدول|الآلة الحاسبة)/.test(t) },
  { type: "situation",       test: (t) => /وضعية (تقويم|انطلاق|تعلم)/.test(t) },
  { type: "guidance",        test: (t) => /توجيهات/.test(t) },
  { type: "solution",        test: (t) => /حل مختصر/.test(t) },
  { type: "learn",           test: (t) => /^أتعلم/.test(t) },
  // Chapter-level: top-level heading with a substantive body title
  { type: "chapter",         test: (t) => /^(الأعداد|الحساب|تنظيم|أنشطة|الأشكال|القياس|التناسبية|المستقيمات|الزوايا|المضلعات|التماثل|الكسور|النسب)/.test(t) },
  // Numbered activities like "1 كتابة الأعداد الطبيعية"
  { type: "numbered-lesson", test: (t) => /^\d+[\).\-\s]/.test(t) },
];

function classify(title: string, level: number): NodeType {
  const t = title.trim();
  for (const r of RULES) if (r.test(t)) return r.type;
  if (level === 1) return "chapter";
  return "section";
}

// Extract heading. Handles "#", "##"... up to "######".
// Also strips redundant leading "#" inside title (some sources use "#### 4 …").
const HEADING_RE = /^(#{1,6})\s+(.*\S)\s*$/;

const IMG_RE = /!\[[^\]]*\]\(([^)]+)\)/g;

function slugify(input: string, seq: number): string {
  const base = input
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return `${seq}-${base || "node"}`;
}

export interface ParseResult {
  root: CurriculumNode;
  stats: {
    totalNodes: number;
    byType: Record<string, number>;
    chapters: number;
    images: number;
  };
}

export function parseCurriculum(md: string): ParseResult {
  const lines = md.split(/\r?\n/);

  const root: CurriculumNode = {
    id: "root",
    title: "المستند",
    level: 0,
    type: "root",
    startLine: 0,
    endLine: lines.length - 1,
    content: "",
    paragraphs: [],
    images: [],
    children: [],
  };

  // Walk lines, opening/closing nodes based on heading level.
  const stack: CurriculumNode[] = [root];
  let seq = 0;

  const flushBody = (node: CurriculumNode, from: number, to: number) => {
    if (to < from) return;
    const slice = lines.slice(from, to + 1);
    node.content = (node.content ? node.content + "\n" : "") + slice.join("\n");
  };

  // Track the line index where the current (top-of-stack) node's body starts.
  let bodyStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const m = HEADING_RE.exec(lines[i]);
    if (!m) continue;

    // Close body of current top node up to line before this heading.
    const top = stack[stack.length - 1];
    flushBody(top, bodyStart, i - 1);
    top.endLine = i - 1;

    const level = m[1].length;
    const title = m[2].replace(/^#+\s*/, "").trim();

    // Pop until parent has a smaller level than this heading.
    while (stack.length > 1 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];

    seq += 1;
    const node: CurriculumNode = {
      id: slugify(title, seq),
      title,
      level,
      type: classify(title, level),
      startLine: i,
      endLine: i,
      content: "",
      paragraphs: [],
      images: [],
      children: [],
    };
    parent.children.push(node);
    stack.push(node);
    bodyStart = i + 1;
  }
  // Flush the final open node.
  const last = stack[stack.length - 1];
  flushBody(last, bodyStart, lines.length - 1);
  last.endLine = lines.length - 1;

  // Post-process: extract paragraphs + images, compute stats.
  const stats = { totalNodes: 0, byType: {} as Record<string, number>, chapters: 0, images: 0 };

  const walk = (n: CurriculumNode) => {
    stats.totalNodes += 1;
    stats.byType[n.type] = (stats.byType[n.type] ?? 0) + 1;
    if (n.type === "chapter") stats.chapters += 1;

    const imgs: string[] = [];
    let match;
    IMG_RE.lastIndex = 0;
    while ((match = IMG_RE.exec(n.content)) !== null) imgs.push(match[1]);
    n.images = imgs;
    stats.images += imgs.length;

    n.paragraphs = n.content
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    n.children.forEach(walk);
  };
  walk(root);

  return { root, stats };
}

// Utility to serialize the tree to plain JSON (drops parent refs — none here).
export function toJSON(root: CurriculumNode, opts?: { includeContent?: boolean }): unknown {
  const includeContent = opts?.includeContent ?? true;
  const shape = (n: CurriculumNode): unknown => ({
    id: n.id,
    title: n.title,
    level: n.level,
    type: n.type,
    startLine: n.startLine,
    endLine: n.endLine,
    ...(includeContent
      ? { paragraphs: n.paragraphs, images: n.images, content: n.content }
      : { images: n.images }),
    children: n.children.map(shape),
  });
  return shape(root);
}

export const TYPE_LABELS_AR: Record<NodeType, string> = {
  root: "الجذر",
  "front-matter": "مقدمة",
  toc: "الفهرس",
  chapter: "باب",
  "learning-goals": "أهداف التعلم",
  discover: "اكتشف",
  learn: "أتعلم",
  methods: "اكتسب طرائق",
  assess: "أقوم تعلّماتي",
  integration: "الإدماج",
  "prior-knowledge": "أستحضر مكتسباتي",
  summary: "أحوصل تعلّماتي",
  exercises: "أتمرّن",
  deepen: "أتعمّق",
  ict: "الإعلام والاتصال",
  situation: "وضعية",
  guidance: "توجيهات",
  solution: "الحل",
  "numbered-lesson": "درس مرقّم",
  section: "قسم",
};
