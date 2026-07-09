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
 *
 * Supports: Algerian Gen-2 math textbooks — Year 1, Year 2, Year 4
 * (and is designed to extend to Year 3 and other subjects).
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

export interface TOCEntry {
  page: number;
  number: number | null; // chapter number (1, 2, 3…)
  title: string; // chapter title
  normalizedTitle: string; // for fuzzy matching
  category: string; // "أنشطة عددية", "أنشطة هندسية", etc.
}

// ─────────────────────────────────────────────────────────────────────────────
// ARABIC TEXT NORMALIZATION (Phase 4)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalize Arabic text for robust fuzzy matching.
 * Strips diacritics, normalizes alef/taa/yaa variants, collapses whitespace.
 */
export function normalizeArabic(text: string): string {
  return (
    text
      // Strip Arabic diacritics (tashkeel): fathah, kasrah, dammah, sukun,
      // shadda, tanwin (fathatan, kasratan, dammatan), maddah, superscript alef
      .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
      // Normalize alef variants: أ إ آ ٱ → ا
      .replace(/[أإآٱ]/g, "ا")
      // Normalize taa marbuta → haa (for matching)
      .replace(/ة/g, "ه")
      // Normalize alef maqsura → yaa
      .replace(/ى/g, "ي")
      // Collapse whitespace
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Fuzzy match two Arabic strings. Returns true if they are
 * "close enough" after normalization. Uses substring containment
 * for flexibility with OCR-mangled titles.
 */
function fuzzyArabicMatch(a: string, b: string): boolean {
  const na = normalizeArabic(a);
  const nb = normalizeArabic(b);
  if (na === nb) return true;
  if (na.length === 0 || nb.length === 0) return false;

  // One contains the other (handles truncated OCR titles)
  if (na.includes(nb) || nb.includes(na)) return true;

  // Check Levenshtein-like similarity for short strings
  // For longer strings, check word overlap ratio
  const wordsA = na.split(" ").filter(Boolean);
  const wordsB = nb.split(" ").filter(Boolean);
  if (wordsA.length >= 2 && wordsB.length >= 2) {
    const overlap = wordsA.filter((w) => wordsB.includes(w)).length;
    const minLen = Math.min(wordsA.length, wordsB.length);
    // ≥60% word overlap → match
    if (overlap / minLen >= 0.6) return true;
  }

  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGURATION — Algerian Curriculum (Multi-Year, Gen 2)
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG = {
  // Section markers that repeat per chapter (template headings).
  // Merged across Year 1, Year 2, and Year 4 variants + common OCR errors.
  sectionMarkers: [
    // ── Year 1 markers ──
    "اكتشف",
    "أكتشف",
    "اكتسب طرائق",
    "أقوم تعلّماتي",
    "أقوم تعلماتي",
    "أتوّلم الإدماج",
    "استحضر مكتسباتي",
    "أحوصل تعلّماتي",
    "أحوصل تعلماتي",
    "أتمرن",
    "أتعمّق",
    "أتعمق",
    "أستعمل تكنولوجيات الإعلام",
    "أستعمل تكنولوجيات",
    "وضعية تقويم",
    "وضعية تتويج",
    "وضعية تشوييم",

    // ── Year 2 markers ──
    "أنشطة",
    "أوظف تعلماتي",
    "أوظف تعلّماتي",
    "أوفلك تعلماتي", // OCR variant
    "أوكد تعلماتي", // OCR variant
    "أدمج تعلّماتي",
    "أدمج تعلماتي",
    "أوظف تكنولوجيات الإعلام والاتصال",

    // ── Year 4 markers ──
    "أستعد",
    "معارف",
    "طرائق",
    "طرانق", // OCR variant
    "أؤكد تعلّماتي",
    "أؤكد تعلماتي",

    // ── Shared / additional ──
    "وضعية للتقويم",
    "وضعية إدماجية",
    "أجزائه تعلماتي", // OCR variant of أقوّم تعلماتي
    "مقدم تطلعات", // OCR variant
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
    "المؤلّفون",
    "كتاب مدرسي معتمد",
    "تقديم الكتاب",
    "استعمال الكتاب",
    "المصادر",
    "الصور:",
    "معجم المصطلحات",
  ],

  // TOC heading identifiers
  tocMarkers: ["الفهرس", "المفهوم"],

  // Content block keywords (weak classification)
  contentBlockPatterns: [
    /^مثال\s*\d*\s*:?/,
    /^ملاحظة\s*\d*\s*:?/,
    /^طريقة\s*\d*\s*:?/,
    /^نص\s*:/,
    /^حل\s*:/,
    /^حل مختصر\s*:/,
    /^تمرين\s*\d*/,
    /^نشاط\s*\d*/,
    /^توجيهات\s*:?/,
    /^خاصية\s*\d*\s*:?/,
    /^دوري الآن/,
    /^دورن الآن/,
    /^أمثلة\s*:?/,
    /^تعريف\s*:?/,
    /^قاعدة\s*:?/,
    /^وضعية\b/,
    /^التعميق$/,
    /^تحد[يّ]\s*/,
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
  assessmentGuidance: [
    "قراءة وفهم الوضعية",
    "تحليل الوضعية",
    "تنفيذ استراتيجية الحل",
    "توجهات تحليل الوضعية",
    "توجيهات تحليل الوضعية",
  ],
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// TOC EXTRACTION ENGINE (Phase 1)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extract the Table of Contents from the markdown document.
 * Supports two formats:
 * 1. Table format (Year 2/4): `| pageNum | N - title | category? |`
 * 2. Text-list format (Year 1): `pageNum N title` lines under `# الفهرس`
 */
function extractTOC(lines: string[], headings: RawHeading[]): TOCEntry[] {
  const entries: TOCEntry[] = [];

  // Find the TOC heading
  const tocHeading = headings.find((h) => {
    const norm = normalizeArabic(h.title);
    return CONFIG.tocMarkers.some((m) => normalizeArabic(m) === norm || norm.includes(normalizeArabic(m)));
  });

  if (!tocHeading) return entries;

  const tocStartLine = tocHeading.line; // 1-indexed
  // Find the next heading after TOC
  const nextHeading = headings.find((h) => h.line > tocStartLine);
  const tocEndLine = nextHeading ? nextHeading.line - 1 : lines.length;

  // Extract lines in the TOC region
  const tocLines = lines.slice(tocStartLine, tocEndLine); // already 0-indexed after slice

  // Accept both 2-col `| page | title |` and 3-col `| page | title | category |` tables.
  const tableRowRegex = /^\|\s*(\d+)\s*\|\s*(.+?)\s*\|(?:\s*(.*?)\s*\|)?\s*$/;
  // "N - title", "N. title", "N) title", or plain "N title" (space separator)
  const chapterEntryRegex = /^(\d+)\s*[-–.)\s]\s*(.+)/;
  // Category markers appear as H2 above/between the table blocks
  const categoryHeadingRegex = /^##\s+(.+?)\s*$/;

  let lastCategory = "";

  for (const line of tocLines) {
    // Category H2 (e.g. `## أنشطة عددية`)
    const catMatch = line.match(categoryHeadingRegex);
    if (catMatch) {
      lastCategory = catMatch[1].trim();
      continue;
    }

    const tableMatch = line.match(tableRowRegex);
    if (tableMatch) {
      const page = parseInt(tableMatch[1], 10);
      const rawTitle = tableMatch[2].trim();
      const category = (tableMatch[3] ?? "").trim() || lastCategory;
      if (category) lastCategory = category;

      // Skip separator rows and non-chapter rows
      if (isNaN(page)) continue;
      if (/^-+$/.test(rawTitle)) continue;
      if (rawTitle.startsWith("•")) continue;
      if (CONFIG.frontMatterMarkers.some((m) => rawTitle.includes(m))) continue;
      if (rawTitle.includes("مصادر") || rawTitle.includes("تصحيحات")) continue;

      const entryMatch = rawTitle.match(chapterEntryRegex);
      if (entryMatch) {
        entries.push({
          page,
          number: parseInt(entryMatch[1], 10),
          title: entryMatch[2].trim(),
          normalizedTitle: normalizeArabic(entryMatch[2].trim()),
          category,
        });
      } else {
        // Untyped title (no leading number) — still a chapter row
        entries.push({
          page,
          number: null,
          title: rawTitle,
          normalizedTitle: normalizeArabic(rawTitle),
          category,
        });
      }
      continue;
    }

    // Text-list format: "pageNum chapterNum title"
    const textMatch = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)/);
    if (textMatch) {
      const page = parseInt(textMatch[1], 10);
      const num = parseInt(textMatch[2], 10);
      const title = textMatch[3].trim();
      if (title.startsWith("•")) continue;
      entries.push({
        page,
        number: num,
        title,
        normalizedTitle: normalizeArabic(title),
        category: lastCategory,
      });
    }
  }

  return entries;
}

// ─────────────────────────────────────────────────────────────────────────────
// TIER INFERENCE ENGINE
// ─────────────────────────────────────────────────────────────────────────────

function classifyHeading(
  raw: RawHeading,
  context: ParserContext,
  toc: TOCEntry[],
  headings: RawHeading[],
): ClassifiedHeading {
  const title = raw.title.trim();
  const rawLevel = raw.rawLevel;
  const normalizedTitle = normalizeArabic(title);

  // ── STRONG CLASSIFICATIONS (override raw level) ─────────────────────────

  // Tier 0: Front matter
  if (isFrontMatter(title)) {
    return { ...raw, tier: 0, type: "front_matter", confidence: "strong" };
  }

  // Tier 0: Table of contents
  if (isTOC(title)) {
    return { ...raw, tier: 0, type: "toc", confidence: "strong" };
  }

  // Tier 1: Chapter — TOC-anchored or heuristic
  if (isChapter(title, normalizedTitle, context, toc, raw, headings)) {
    return { ...raw, tier: 1, type: "chapter", confidence: "strong" };
  }

  // Tier 2: Learning goals ("سأتعلم في هذا الباب")
  if (normalizedTitle.includes(normalizeArabic("سأتعلم في هذا الباب"))) {
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
  return CONFIG.frontMatterMarkers.some(
    (m) => title.includes(m) || normalizeArabic(title).includes(normalizeArabic(m)),
  );
}

function isTOC(title: string): boolean {
  const norm = normalizeArabic(title);
  return CONFIG.tocMarkers.some((m) => {
    const normM = normalizeArabic(m);
    return norm === normM || norm.includes(normM);
  });
}

function isChapter(
  title: string,
  normalizedTitle: string,
  ctx: ParserContext,
  toc: TOCEntry[],
  raw: RawHeading,
  headings: RawHeading[],
): boolean {
  // ── Strategy 1: TOC-anchored matching (strongest signal) ─────────────────
  if (toc.length > 0) {
    // Strip leading chapter number if the heading starts with one
    // (e.g. "1 الأعداد الطبيعية..." → number=1, body="الأعداد الطبيعية...")
    const numberedHeading = title.match(/^(\d+)\s*[-–.)\s]\s*(.+)/);
    const headingNum = numberedHeading ? parseInt(numberedHeading[1], 10) : null;
    const headingBody = numberedHeading ? numberedHeading[2].trim() : title;
    const normBody = normalizeArabic(headingBody);

    // Case A: numbered heading — MUST match TOC by number AND title body
    if (headingNum !== null) {
      const tocByNum = toc.find((e) => e.number === headingNum);
      if (tocByNum && fuzzyArabicMatch(tocByNum.title, headingBody)) return true;
      // Numbered but doesn't match TOC → treat as lesson/subsection, not chapter
      return false;
    }

    // Case B: un-numbered heading — require tight equality of normalized titles
    // (prevents "الكتابات الكسرية" from matching "3 من الكتابات الكسرية إلى ...")
    const tight = toc.some(
      (e) => e.normalizedTitle === normBody || normalizeArabic(e.title) === normalizeArabic(title),
    );
    if (tight) return true;

    // Bare number H1 pattern (e.g. `# 3`) followed by matching H2 title
    if (/^\d+$/.test(title)) {
      const num = parseInt(title, 10);
      const tocEntry = toc.find((e) => e.number === num);
      if (tocEntry) {
        const nextH = headings.find((h) => h.line > raw.line);
        if (nextH && fuzzyArabicMatch(tocEntry.title, nextH.title)) return true;
      }
    }

    return false;
  }

  // ── Strategy 2: Known chapter exact match (fallback when no TOC) ─────────
  // Hard-coded known chapters for Year 1 (the only one without a parseable TOC)
  const knownChapters = [
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
  ];

  if (knownChapters.some((kc) => fuzzyArabicMatch(kc, title))) {
    return true;
  }

  // ── Strategy 3: Academic keyword heuristic (weakest, only when no TOC) ───
  const hasDigits = /\d/.test(title);
  const isMarker = isSectionMarker(title);
  const isFront = isFrontMatter(title);
  const isBroad = title.length > 15 && title.includes(" ");

  // Must not be numbered, marked, or front matter
  if (hasDigits || isMarker || isFront) return false;

  // Must look like a curriculum topic
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
    "المعادلات",
    "المتراجحات",
    "الدوال",
    "الأشعة",
    "الانسحاب",
    "الدوران",
    "المضلعات",
  ];
  const hasAcademicKeyword = academicKeywords.some((kw) => normalizedTitle.includes(normalizeArabic(kw)));

  // Additional guard: title must have ≥3 words (single/two-word titles are subsections)
  const wordCount = title.split(/\s+/).filter(Boolean).length;
  if (wordCount < 3) return false;

  return isBroad && hasAcademicKeyword;
}

function isNumberedLesson(title: string): boolean {
  // Reject bare numbers: "1", "23" — these are page numbers or chapter numbers (Year 2 style)
  if (/^\d+$/.test(title)) return false;

  // Reject math expressions: "2 5 - 7 + 5 =", "30-8+2=?"
  // A numbered lesson should have Arabic text after the number, not operators
  if (/^\d+\s*[\d+\-×÷=<>]/.test(title)) return false;
  if (/[=+×÷]/.test(title) && !/[\u0600-\u06FF]/.test(title.replace(/^\d+[).\s]*/, ""))) {
    return false;
  }

  // Standard: "1 أكون اعدادا", "2 الكسور العشرية"
  if (CONFIG.numberedLessonPattern.test(title)) {
    // Extra check: after the number+separator, there should be Arabic content
    const afterNumber = title.replace(/^\d+[).\s]*/, "").trim();
    if (afterNumber.length > 0 && /[\u0600-\u06FF]/.test(afterNumber)) {
      return true;
    }
    return false;
  }

  // Circled digits: "① استعمل جميع الأرقام"
  if (CONFIG.circledDigitPattern.test(title)) return true;

  // Arabic-Indic digits: "١ التعرية على جدول تناسبية"
  if (/^[٠-٩]+\s/.test(title)) return true;

  // Dash-numbered: "3-1 الحساب الحرفي" — these are sub-lessons, not chapters
  if (/^\d+-\d+\s/.test(title)) return true;

  return false;
}

function isSectionMarker(title: string): boolean {
  const norm = normalizeArabic(title);
  return CONFIG.sectionMarkers.some((sm) => {
    const normSm = normalizeArabic(sm);
    // Exact match or starts-with (section markers are often the full title)
    return norm === normSm || norm.startsWith(normSm);
  });
}

function isAssessmentGuidance(title: string): boolean {
  const norm = normalizeArabic(title);
  return CONFIG.assessmentGuidance.some((ag) => norm.includes(normalizeArabic(ag)));
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

  for (let i = 0; i < classified.length; i++) {
    const ch = classified[i];
    const body = bodyText.get(ch.line) || { content: "", images: [], paragraphs: [] };

    // ── Year 2 merge: `# N` chapter → absorb next heading's title ──────────
    if (ch.type === "chapter" && /^\d+$/.test(ch.title) && i + 1 < classified.length) {
      const next = classified[i + 1];
      // Merge: use the next heading's title, skip it in the loop
      const mergedTitle = `${ch.title} - ${next.title}`;
      const mergedBody = bodyText.get(next.line) || body;
      const mergedNode = createNode(
        { ...ch, title: mergedTitle },
        mergedBody.content,
        [...body.images, ...mergedBody.images],
        [...body.paragraphs, ...mergedBody.paragraphs],
      );

      ctx.chapterCount++;
      ctx.stack = [root];
      ctx.lastStrongLevel = 1;
      ctx.lastStrongType = "chapter";
      ctx.inFrontMatter = false;
      root.children.push(mergedNode);
      ctx.stack.push(mergedNode);

      // Skip the next heading (it's been merged)
      i++;
      continue;
    }

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
  lines: string[];
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

      // Phase 7: Detect learning goals in blockquotes
      const trimmed = line.trim();
      if (
        trimmed.startsWith(">") &&
        (trimmed.includes("سأتعلم في هذا الباب") || trimmed.includes("ساتعلم في هذا الباب"))
      ) {
        // Inject a synthetic heading for blockquote learning goals
        flushBody(i + 1);
        headings.push({
          line: i + 1,
          rawLevel: 2, // Treat as H2
          title: "سأتعلم في هذا الباب",
        });
        continue;
      }

      // Collect non-empty paragraphs
      if (trimmed && !trimmed.startsWith("![") && !trimmed.startsWith("|")) {
        currentParagraphs.push(trimmed);
      }
    }
  }

  // Flush last section
  flushBody(-1);

  return { headings, bodyText, lines };
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

export function parseCurriculum(md: string): ParseResult {
  // Step 1: Preprocess — extract headings and body text
  const { headings, bodyText, lines } = preprocessMarkdown(md);

  // Step 2: Extract TOC for chapter anchoring
  const toc = extractTOC(lines, headings);

  // Step 3: Classify — infer semantic tier for each heading
  const ctx: ParserContext = {
    stack: [],
    lastStrongLevel: 0,
    lastStrongType: "other",
    chapterCount: 0,
    inFrontMatter: true,
  };

  const classified = headings.map((h) => classifyHeading(h, ctx, toc, headings));

  // Step 4: Build tree
  const root = buildTree(classified, bodyText);

  // Step 5: Compute stats
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
