/**
 * Curriculum Insight Engine — Hybrid Tier-Based Parser
 *
 * Problem: PDF-to-markdown conversion flattens all headings to H1, destroying
 * the semantic hierarchy. Chapters, lessons, subsections, and section markers
 * all appear as `#` level.
 *
 * Solution: Infer "effective tier" from content patterns instead of trusting
 * raw ATX heading levels. Build a semantic classification layer that runs
 * before tree construction.
 */

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface RawHeading {
  line: number;
  rawLevel: number; // 1–6 from markdown
  title: string;
}

export type Tier = 0 | 1 | 2 | 3 | 4 | 5;

export type HeadingType =
  | "front_matter"
  | "toc"
  | "chapter"
  | "learning_goals"
  | "numbered_lesson"
  | "section_marker"
  | "subsection"
  | "content_block"
  | "other";

export interface ClassifiedHeading extends RawHeading {
  tier: Tier;
  type: HeadingType;
  confidence: "strong" | "weak"; // strong = resets context; weak = anchors to ancestor
}

export interface CurriculumNode {
  id: string;
  level: number; // effective depth in tree
  type: HeadingType;
  title: string;
  content: string; // body text until next heading
  children: CurriculumNode[];
  images: string[]; // ![...](...) references
  paragraphs: string[]; // non-heading text blocks
}

export interface ParseResult {
  root: CurriculumNode;
  stats: {
    totalHeadings: number;
    chapters: number;
    lessons: number;
    sectionMarkers: number;
    contentBlocks: number;
    images: number;
    confidence: { strong: number; weak: number };
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION — Algerian Curriculum (Year 1 Middle School, Gen 2)
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG = {
  // Section markers that repeat per chapter (template headings)
  sectionMarkers: [
    "اكتشف",
    "اكتسب طرائق",
    "أقوم تعلّماتي",
    "أتوّلم الإدماج",
    "استحضر مكتسباتي",
    "أحوصل تعلّماتي",
    "أتمرن",
    "أتعمّق",
    "أستعمل تكنولوجيات الإعلام",
    "أستعمل تكنولوجيات",
    "وضعية تقويم",
    "وضعية تتويج",
    "وضعية تشوييم",
  ],

  // Known chapter titles (from official TOC) — used for validation
  knownChapters: [
    "الأعداد الطبيعية والأعداد العشرية",
    "الحساب على الأعداد الطبيعية والأعداد العشرية: الجمع والطرح",
    "الحساب على الأعداد الطبيعية والأعداد العشرية: الضرب والقسمة",
    "الكتابات الكسرية",
    "الأعداد النسبية",
    "الحساب الحرفي",
    "التناسبية",
    "تنظيم معطيات",
    "التوازي والتعامد",
    "الأشكال المستوية",
    "السطوح المستوية",
    "الزوايا",
    "التناظر المحوري",
    "متوازي المستطيلات والمكعب",
  ],

  // Front matter keywords
  frontMatterMarkers: [
    "الطبعة",
    "ردمك",
    "موفم للنشر",
    "ENAG",
    "elbassair",
    "الجمهورية الجزائرية",
    "وزارة التربية الوطنية",
    "الإشراف التربوي",
    "رئيس المشروع",
    "المؤلفون",
    "كتاب مدرسي معتمد",
  ],

  // Content block keywords (weak classification)
  contentBlockPatterns: [
    /^مثال\s*\d*\s*:/,
    /^ملاحظة\s*\d*\s*:/,
    /^طريقة\s*\d*\s*:/,
    /^نص\s*:/,
    /^حل\s*:/,
    /^حل مختصر\s*:/,
    /^تمرين\s*\d*/,
    /^نشاط\s*\d*/,
    /^توجيهات\s*:/,
    /^خاصية\s*\d*\s*:/,
    /^دوري الآن/,
    /^دورن الآن/,
    /^أمثلة\s*:/,
  ],

  // Sub-section patterns
  subsectionPatterns: [
    /^\d+\.\d+/, // "1.2", "3.14"
    /^\(\d+\)/, // "(1)", "(2)"
    /^\d+\)/, // "2)", "3)" — parenthesized numbers without opening paren
  ],

  // Numbered lesson: starts with digit(s) followed by separator
  numberedLessonPattern: /^\d+[).\s]/,

  // Circled digits (Unicode 2460–2473)
  circledDigitPattern: /[①-⑳]/,

  // Assessment situation guidance sub-headings
  assessmentGuidance: ["قراءة وفهم الوضعية", "تحليل الوضعية", "تنفيذ استراتيجية الحل"],
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// TIER INFERENCE ENGINE
// ─────────────────────────────────────────────────────────────────────────────

function classifyHeading(raw: RawHeading, context: ParserContext): ClassifiedHeading {
  const title = raw.title.trim();
  const rawLevel = raw.rawLevel;

  // ── STRONG CLASSIFICATIONS (override raw level) ─────────────────────────

  // Tier 0: Front matter
  if (isFrontMatter(title)) {
    return { ...raw, tier: 0, type: "front_matter", confidence: "strong" };
  }

  // Tier 0: Table of contents
  if (isTOC(title)) {
    return { ...raw, tier: 0, type: "toc", confidence: "strong" };
  }

  // Tier 1: Chapter
  if (isChapter(title, context)) {
    return { ...raw, tier: 1, type: "chapter", confidence: "strong" };
  }

  // Tier 2: Learning goals ("سأتعلم في هذا الباب")
  if (title.includes("سأتعلم في هذا الباب") || title.includes("ساتعلم في هذا الباب")) {
    return { ...raw, tier: 2, type: "learning_goals", confidence: "strong" };
  }

  // Tier 2: Numbered lesson
  if (isNumberedLesson(title)) {
    return { ...raw, tier: 2, type: "numbered_lesson", confidence: "strong" };
  }

  // Tier 2: Section marker (template headings)
  if (isSectionMarker(title)) {
    return { ...raw, tier: 2, type: "section_marker", confidence: "strong" };
  }

  // ── WEAK CLASSIFICATIONS (anchor to nearest strong ancestor) ───────────────

  // Tier 3: Assessment situation guidance
  if (isAssessmentGuidance(title)) {
    return { ...raw, tier: 3, type: "subsection", confidence: "weak" };
  }

  // Tier 3: Sub-section patterns
  if (isSubsection(title)) {
    return { ...raw, tier: 3, type: "subsection", confidence: "weak" };
  }

  // Tier 4: Content blocks
  if (isContentBlock(title)) {
    return { ...raw, tier: 4, type: "content_block", confidence: "weak" };
  }

  // ── FALLBACK: trust raw level with sanity checks ──────────────────────────

  if (rawLevel > 1) {
    // If raw markdown actually has nesting, trust it but cap at tier 3
    const inferredTier = Math.min(rawLevel + 1, 3) as Tier;
    return {
      ...raw,
      tier: inferredTier,
      type: inferredTier <= 2 ? "subsection" : "content_block",
      confidence: "weak",
    };
  }

  // Everything else at H1 that didn't match strong patterns → weak tier 3
  return {
    ...raw,
    tier: 3,
    type: "other",
    confidence: "weak",
  };
}

// ── Detection helpers ────────────────────────────────────────────────────────

function isFrontMatter(title: string): boolean {
  return CONFIG.frontMatterMarkers.some((m) => title.includes(m));
}

function isTOC(title: string): boolean {
  return title === "الفهرس" || title.includes("الفهرس");
}

function isChapter(title: string, ctx: ParserContext): boolean {
  // Exact match against known chapters
  if (CONFIG.knownChapters.some((kc) => title.includes(kc) || kc.includes(title))) {
    return true;
  }

  // Heuristic: broad Arabic topic, no digits, not a section marker,
  // reasonable length, and appears after we've seen some content
  const hasDigits = /\d/.test(title);
  const isMarker = isSectionMarker(title);
  const isFront = isFrontMatter(title);
  const isBroad = title.length > 10 && title.includes(" ");

  // Must not be numbered, marked, or front matter
  if (hasDigits || isMarker || isFront) return false;

  // Must look like a curriculum topic (contains academic keywords)
  const academicKeywords = [
    "الأعداد",
    "الحساب",
    "الكتابات",
    "الكسور",
    "النسبية",
    "الحرفي",
    "التناسبية",
    "المعطيات",
    "التوازي",
    "التعامد",
    "الأشكال",
    "السطوح",
    "الزوايا",
    "التناظر",
    "المستطيلات",
    "المكعب",
    "الهندسة",
    "القياس",
    "الإحصاء",
  ];
  const hasAcademicKeyword = academicKeywords.some((kw) => title.includes(kw));

  return isBroad && hasAcademicKeyword;
}

function isNumberedLesson(title: string): boolean {
  // Standard: "1 أكون اعدادا", "2 الكسور العشرية"
  if (CONFIG.numberedLessonPattern.test(title)) return true;

  // Circled digits: "① استعمل جميع الأرقام"
  if (CONFIG.circledDigitPattern.test(title)) return true;

  // Arabic-Indic digits: "١ التعرية على جدول تناسبية"
  if (/^[٠-٩]+/.test(title)) return true;

  return false;
}

function isSectionMarker(title: string): boolean {
  return CONFIG.sectionMarkers.some((sm) => title.includes(sm));
}

function isAssessmentGuidance(title: string): boolean {
  return CONFIG.assessmentGuidance.some((ag) => title.includes(ag));
}

function isSubsection(title: string): boolean {
  return CONFIG.subsectionPatterns.some((p) => p.test(title));
}

function isContentBlock(title: string): boolean {
  return CONFIG.contentBlockPatterns.some((p) => p.test(title));
}

// ─────────────────────────────────────────────────────────────────────────────
// TREE BUILDER
// ─────────────────────────────────────────────────────────────────────────────

interface ParserContext {
  stack: CurriculumNode[];
  lastStrongLevel: number;
  lastStrongType: HeadingType;
  chapterCount: number;
  inFrontMatter: boolean;
}

function createNode(
  classified: ClassifiedHeading,
  content: string,
  images: string[],
  paragraphs: string[],
): CurriculumNode {
  return {
    id: `node-${classified.line}`,
    level: classified.tier,
    type: classified.type,
    title: classified.title,
    content,
    children: [],
    images,
    paragraphs,
  };
}

function buildTree(
  classified: ClassifiedHeading[],
  bodyText: Map<number, { content: string; images: string[]; paragraphs: string[] }>,
): CurriculumNode {
  const root: CurriculumNode = {
    id: "root",
    level: 0,
    type: "other",
    title: "root",
    content: "",
    children: [],
    images: [],
    paragraphs: [],
  };

  const ctx: ParserContext = {
    stack: [root],
    lastStrongLevel: 0,
    lastStrongType: "other",
    chapterCount: 0,
    inFrontMatter: true,
  };

  for (const ch of classified) {
    const body = bodyText.get(ch.line) || { content: "", images: [], paragraphs: [] };
    const node = createNode(ch, body.content, body.images, body.paragraphs);

    // ── Handle chapter boundary: reset stack ─────────────────────────────────
    if (ch.confidence === "strong" && ch.type === "chapter") {
      ctx.chapterCount++;
      ctx.stack = [root]; // Pop everything back to root
      ctx.lastStrongLevel = 1;
      ctx.lastStrongType = "chapter";
      ctx.inFrontMatter = false;
      root.children.push(node);
      ctx.stack.push(node);
      continue;
    }

    // ── Handle front matter ──────────────────────────────────────────────────
    if (ch.tier === 0) {
      if (ctx.inFrontMatter) {
        root.children.push(node);
      }
      // Front matter doesn't affect stack
      continue;
    }

    // ── Handle strong non-chapter headings ───────────────────────────────────
    if (ch.confidence === "strong") {
      // Pop to appropriate ancestor
      const targetLevel = ch.tier - 1;
      while (ctx.stack.length > targetLevel + 1) {
        ctx.stack.pop();
      }

      const parent = ctx.stack[ctx.stack.length - 1];
      parent.children.push(node);
      ctx.stack.push(node);

      ctx.lastStrongLevel = ch.tier;
      ctx.lastStrongType = ch.type;
      continue;
    }

    // ── Handle weak headings (anchor to nearest strong ancestor) ────────────
    // Weak headings get tier = lastStrongLevel + 1
    const effectiveTier = Math.max(ch.tier, ctx.lastStrongLevel + 1);
    node.level = effectiveTier;

    // Pop to parent of effective tier
    const targetLevel = effectiveTier - 1;
    while (ctx.stack.length > targetLevel + 1) {
      ctx.stack.pop();
    }

    const parent = ctx.stack[ctx.stack.length - 1];
    parent.children.push(node);
    ctx.stack.push(node);
  }

  return root;
}

// ─────────────────────────────────────────────────────────────────────────────
// MARKDOWN PREPROCESSOR
// ─────────────────────────────────────────────────────────────────────────────

interface PreprocessedDocument {
  headings: RawHeading[];
  bodyText: Map<number, { content: string; images: string[]; paragraphs: string[] }>;
}

function preprocessMarkdown(md: string): PreprocessedDocument {
  const lines = md.split("\n");
  const headings: RawHeading[] = [];
  const bodyText = new Map<number, { content: string; images: string[]; paragraphs: string[] }>();

  let currentHeadingLine: number | null = null;
  let currentContent: string[] = [];
  let currentImages: string[] = [];
  let currentParagraphs: string[] = [];

  const headingRegex = /^(#{1,6})\s+(.*)$/;
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;

  function flushBody(lineNum: number) {
    if (currentHeadingLine !== null) {
      const content = currentContent.join("\n").trim();
      bodyText.set(currentHeadingLine, {
        content,
        images: [...currentImages],
        paragraphs: [...currentParagraphs],
      });
    }
    currentHeadingLine = lineNum;
    currentContent = [];
    currentImages = [];
    currentParagraphs = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(headingRegex);

    if (match) {
      flushBody(i + 1);
      headings.push({
        line: i + 1,
        rawLevel: match[1].length,
        title: match[2].trim(),
      });
    } else {
      currentContent.push(line);

      // Extract images
      let imgMatch;
      while ((imgMatch = imageRegex.exec(line)) !== null) {
        currentImages.push(imgMatch[2]);
      }

      // Collect non-empty paragraphs
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("![") && !trimmed.startsWith("|")) {
        currentParagraphs.push(trimmed);
      }
    }
  }

  // Flush last section
  flushBody(-1);

  return { headings, bodyText };
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

export function parseCurriculum(md: string): ParseResult {
  // Step 1: Preprocess — extract headings and body text
  const { headings, bodyText } = preprocessMarkdown(md);

  // Step 2: Classify — infer semantic tier for each heading
  const ctx: ParserContext = {
    stack: [],
    lastStrongLevel: 0,
    lastStrongType: "other",
    chapterCount: 0,
    inFrontMatter: true,
  };

  const classified = headings.map((h) => classifyHeading(h, ctx));

  // Step 3: Build tree
  const root = buildTree(classified, bodyText);

  // Step 4: Compute stats
  const stats = computeStats(root, classified);

  return { root, stats };
}

function computeStats(root: CurriculumNode, classified: ClassifiedHeading[]): ParseResult["stats"] {
  let chapters = 0;
  let lessons = 0;
  let sectionMarkers = 0;
  let contentBlocks = 0;
  let images = 0;

  function walk(node: CurriculumNode) {
    if (node.type === "chapter") chapters++;
    if (node.type === "numbered_lesson") lessons++;
    if (node.type === "section_marker") sectionMarkers++;
    if (node.type === "content_block") contentBlocks++;
    images += node.images.length;
    node.children.forEach(walk);
  }

  walk(root);

  const strongCount = classified.filter((c) => c.confidence === "strong").length;
  const weakCount = classified.filter((c) => c.confidence === "weak").length;

  return {
    totalHeadings: classified.length,
    chapters,
    lessons,
    sectionMarkers,
    contentBlocks,
    images,
    confidence: { strong: strongCount, weak: weakCount },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY: Flatten tree for debugging
// ─────────────────────────────────────────────────────────────────────────────

export function debugPrintTree(node: CurriculumNode, indent = 0): string {
  const prefix = "  ".repeat(indent);
  const icon = getNodeIcon(node.type);
  let out = `${prefix}${icon} [L${node.level}] ${node.title}\n`;
  for (const child of node.children) {
    out += debugPrintTree(child, indent + 1);
  }
  return out;
}

function getNodeIcon(type: HeadingType): string {
  const icons: Record<HeadingType, string> = {
    front_matter: "📄",
    toc: "📑",
    chapter: "📚",
    learning_goals: "🎯",
    numbered_lesson: "📖",
    section_marker: "🔖",
    subsection: "📋",
    content_block: "📝",
    other: "•",
  };
  return icons[type] || "•";
}

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT EXPORT
// ─────────────────────────────────────────────────────────────────────────────

export default parseCurriculum;
