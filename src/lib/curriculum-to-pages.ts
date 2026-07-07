import type { CurriculumNode, HeadingType } from "./curriculum-parser";
import type { Page } from "./workspace-store";

const ICONS: Record<HeadingType, string> = {
  front_matter: "📄",
  toc: "📑",
  chapter: "📘",
  learning_goals: "🎯",
  numbered_lesson: "📖",
  section_marker: "🔖",
  subsection: "📋",
  content_block: "📝",
  other: "•",
};

const uid = () => globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 12);

function nodeToPage(n: CurriculumNode): Page {
  return {
    id: uid(),
    icon: ICONS[n.type] ?? "•",
    title: n.title || "(بدون عنوان)",
    type: n.type, // "chapter" | "numbered_lesson" | "section_marker" | ...
    data: {
      level: n.level,
      content: n.content,
      paragraphs: n.paragraphs,
      images: n.images,
    },
    children: n.children.map(nodeToPage),
  };
}

// Skip the synthetic root — return its children as the top-level pages to insert.
export function curriculumToPages(root: CurriculumNode): Page[] {
  return root.children.map(nodeToPage);
}
