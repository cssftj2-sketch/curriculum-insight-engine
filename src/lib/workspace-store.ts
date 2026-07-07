// Workspace store: Notion-like tree of pages persisted to localStorage.
// Each page has an id, icon, title, type, arbitrary JSON `data`, and children.

import { useSyncExternalStore } from "react";

export interface Page {
  id: string;
  icon: string;
  title: string;
  type: string; // e.g. "section", "grade", "unit", "chapter", "skill", "question", "hypothesis", "generic"
  data: Record<string, unknown>;
  children: Page[];
}

export interface Workspace {
  version: 1;
  pages: Page[]; // top-level sections
}

const KEY = "curriculum-workspace-v1";

// ---------- seed ----------

const uid = () => globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 12);

const p = (
  icon: string,
  title: string,
  type: string,
  data: Record<string, unknown> = {},
  children: Page[] = [],
): Page => ({ id: uid(), icon, title, type, data, children });

function seed(): Workspace {
  return {
    version: 1,
    pages: [
      p("📚", "Curriculum", "section", { description: "المنهاج الرسمي وتنظيمه" }, [
        p("🎓", "Grade", "grade", { name: "السنة الأولى متوسط", code: "1AM" }),
        p("📅", "Trimester", "trimester", { list: ["الفصل 1", "الفصل 2", "الفصل 3"] }),
        p("📦", "Units", "unit-list", {}, [
          p("📘", "الأعداد الطبيعية والعشرية", "unit", { order: 1 }),
          p("📘", "الحساب: الجمع والطرح", "unit", { order: 2 }),
        ]),
        p("📖", "Chapters", "chapter-list", {}, []),
      ]),
      p("🧠", "Knowledge Graph", "section", { description: "شبكة المفاهيم والتبعيات" }, [
        p("🔵", "Nodes", "kg-nodes", {
          nodes: [
            { id: "n1", label: "العدد الطبيعي" },
            { id: "n2", label: "الكسر العشري" },
            { id: "n3", label: "المقارنة" },
          ],
        }),
        p("🔗", "Dependencies", "kg-edges", {
          edges: [
            { from: "n1", to: "n2", type: "prerequisite" },
            { from: "n2", to: "n3", type: "prerequisite" },
          ],
        }),
      ]),
      p("🎯", "Skill Graph", "section", { description: "المهارات والنواتج" }, [
        p("⭐", "Skill", "skill", {
          id: "skill.compare_decimals",
          name: "مقارنة عددين عشريين",
          bloom: "تطبيق",
        }),
        p("⛓️", "Prerequisites", "prereq-list", {
          items: ["skill.read_decimal", "skill.place_value"],
        }),
        p("🏁", "Learning Outcomes", "lo-list", {
          outcomes: [
            "يقارن عددين عشريين لهما نفس الجزء الصحيح",
            "يرتّب أعدادًا عشرية تصاعديًا/تنازليًا",
          ],
        }),
      ]),
      p("❓", "Question Bank", "section", { description: "بنك الأسئلة" }, [
        p("🥇", "Gold Questions", "question-list", {
          questions: [
            {
              id: "q.gold.1",
              stem: "قارن بين 3,45 و 3,5",
              answer: "3,45 < 3,5",
              skill: "skill.compare_decimals",
            },
          ],
        }),
        p("🤖", "Generated Questions", "question-list", { questions: [] }),
        p("🎭", "Distractors", "distractor-list", { items: [] }),
      ]),
      p("🔍", "Diagnostic", "section", { description: "التشخيص التكويني" }, [
        p("💭", "Hypotheses", "hypothesis-list", {
          items: [
            { id: "h1", text: "يهمل الأصفار غير الضرورية عند المقارنة" },
            { id: "h2", text: "يقارن الأجزاء العشرية كأنها أعداد طبيعية" },
          ],
        }),
        p("🎯", "Probe Questions", "question-list", { questions: [] }),
        p("🌳", "Decision Tree", "decision-tree", { nodes: [], edges: [] }),
      ]),
      p("📈", "Analytics", "section", { description: "مؤشرات الجودة" }, [
        p("✅", "Question Quality", "metrics", { avg: 0, flagged: 0 }),
        p("📊", "Discrimination", "metrics", { avg: 0 }),
        p("🧗", "Difficulty", "metrics", { distribution: {} }),
        p("🗺️", "Coverage", "metrics", { skillsCovered: 0, total: 0 }),
      ]),
      p("👨‍🎓", "Student", "section", { description: "الملف التعلّمي للتلميذ" }, [
        p("🗓️", "Sessions", "session-list", { sessions: [] }),
        p("📝", "Report", "report", { generatedAt: null }),
        p("🧭", "Learning Path", "path", { steps: [] }),
      ]),
    ],
  };
}

// ---------- store ----------

let state: Workspace = load();
const listeners = new Set<() => void>();

function load(): Workspace {
  if (typeof localStorage === "undefined") return seed();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw) as Workspace;
    if (!parsed?.pages) return seed();
    return parsed;
  } catch {
    return seed();
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // ignore quota / SSR
  }
}

function emit() {
  persist();
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useWorkspace(): Workspace {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}

// ---------- helpers ----------

export function findPage(root: Page[], id: string): Page | null {
  for (const n of root) {
    if (n.id === id) return n;
    const f = findPage(n.children, id);
    if (f) return f;
  }
  return null;
}

function findParent(root: Page[], id: string, parent: Page[] | null = null): Page[] | null {
  for (const n of root) {
    if (n.id === id) return parent ?? root;
    const f = findParent(n.children, id, n.children);
    if (f) return f;
  }
  return null;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

// ---------- actions ----------

export const actions = {
  reset() {
    state = seed();
    emit();
  },
  replaceAll(ws: Workspace) {
    state = ws;
    emit();
  },
  addChild(parentId: string | null, page?: Partial<Page>) {
    const next = clone(state);
    const newPage: Page = {
      id: uid(),
      icon: page?.icon ?? "📄",
      title: page?.title ?? "بدون عنوان",
      type: page?.type ?? "generic",
      data: page?.data ?? {},
      children: page?.children ?? [],
    };
    if (parentId === null) {
      next.pages.push(newPage);
    } else {
      const parent = findPage(next.pages, parentId);
      if (parent) parent.children.push(newPage);
    }
    state = next;
    emit();
    return newPage.id;
  },
  deletePage(id: string) {
    const next = clone(state);
    const parent = findParent(next.pages, id);
    if (!parent) return;
    const idx = parent.findIndex((p) => p.id === id);
    if (idx >= 0) parent.splice(idx, 1);
    state = next;
    emit();
  },
  updatePage(id: string, patch: Partial<Page>) {
    const next = clone(state);
    const page = findPage(next.pages, id);
    if (!page) return;
    Object.assign(page, patch);
    state = next;
    emit();
  },
  setData(id: string, data: Record<string, unknown>) {
    const next = clone(state);
    const page = findPage(next.pages, id);
    if (!page) return;
    page.data = data;
    state = next;
    emit();
  },
  movePage(id: string, direction: "up" | "down") {
    const next = clone(state);
    const parent = findParent(next.pages, id);
    if (!parent) return;
    const idx = parent.findIndex((p) => p.id === id);
    const swap = direction === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= parent.length) return;
    [parent[idx], parent[swap]] = [parent[swap], parent[idx]];
    state = next;
    emit();
  },
  importCurriculumUnderPage(parentId: string, imported: Page[]) {
    const next = clone(state);
    const parent = findPage(next.pages, parentId);
    if (!parent) return;
    parent.children.push(...imported);
    state = next;
    emit();
  },
};

export function pagePath(root: Page[], id: string): Page[] {
  const trail: Page[] = [];
  const walk = (nodes: Page[]): boolean => {
    for (const n of nodes) {
      trail.push(n);
      if (n.id === id) return true;
      if (walk(n.children)) return true;
      trail.pop();
    }
    return false;
  };
  walk(root);
  return trail;
}
