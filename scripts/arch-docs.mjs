// Shared library for the **architecture** docs — the C4 / DDD structural view that sits
// beside the behavioural (`.feature`) docs. Where `feature-docs.mjs` turns executable
// specs into the *dynamic* view, this turns the **code itself** into the *structural*
// view: one **C3 Component** page per Component (a module of the Financial Domain),
// each assembled from
//   • the file-header doc-comment on every source file in the Component (its description),
//   • the exported model types parsed out of the Component's `types.ts` (the C4 model),
//   • the behaviours that validate the Component, via the same `@source` map the feature
//     docs already build.
//
// Nothing here is hand-authored prose: the richer the code's header comments and model
// doc-comments, the richer these pages get. That's deliberate — improving names and
// comments in `src/` is the way to improve the docs. See design-notes/002 + CLAUDE.md.

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { ROOT, buildSourceMap } from "./feature-docs.mjs";

export const ARCH_DIR = path.join(ROOT, "docs", "architecture");
export const ARCH_COMPONENTS_DIR = path.join(ARCH_DIR, "components");
export const ARCH_SIDEBAR_FILE = path.join(
  ROOT,
  "docs",
  ".vitepress",
  "arch-sidebar.generated.json",
);

/**
 * The **Components (C3)** of the Financial Domain whose code is rich enough to warrant a
 * generated page. (In code/React these are "Views" — `FinancialView` — and in docs they're
 * "Components"; the two are synonyms. A Component is assembled from its **Elements**.)
 * `paths` are scanned for source files; a directory expands to its files. `modelFile` is the
 * `types.ts` the C4 model is read from. Order here is the order on the page and in the sidebar.
 */
export const CONTEXTS = [
  {
    id: "vision",
    title: "Vision",
    glyph: "🧭",
    tagline: "Project the goal and why it matters — step one of every freedom Domain.",
    modelFile: "src/lib/vision/types.ts",
    paths: ["src/lib/vision", "src/lib/server/vision.ts", "src/components/onboarding", "src/components/VisionPanel.tsx"],
  },
  {
    id: "finance",
    title: "Finance engine",
    glyph: "📊",
    tagline: "Pure freedom math: magic number, coast number, the month-by-month projection.",
    modelFile: "src/lib/finance/types.ts",
    paths: ["src/lib/finance", "src/lib/server/financial-profile.ts", "src/components/FinancialDashboard.tsx", "src/components/ProjectionChart.tsx"],
  },
  {
    id: "buckets",
    title: "Buckets",
    glyph: "🪣",
    tagline: "A virtual layer of purpose over the real accounts money lives in.",
    modelFile: "src/lib/buckets/types.ts",
    paths: ["src/lib/buckets", "src/lib/server/buckets.ts", "src/components/buckets"],
  },
  {
    id: "investments",
    title: "Investments",
    glyph: "📈",
    tagline: "The freedom-generating assets the user holds, valued and projected forward.",
    modelFile: "src/lib/investments/types.ts",
    paths: ["src/lib/investments", "src/lib/server/investments.ts", "src/components/investments"],
  },
  {
    id: "spending",
    title: "Spending",
    glyph: "💸",
    tagline: "The user's observed outgoings and income — the data behind annualised spend.",
    modelFile: "src/lib/spending/types.ts",
    paths: ["src/lib/spending", "src/lib/server/spending.ts", "src/components/spending"],
  },
  {
    id: "inbox",
    title: "Inbox & ingestion",
    glyph: "📥",
    tagline: "The durable queue and pipeline at the head of the bookkeeper: capture → extract → propose → reconcile.",
    modelFile: "src/lib/inbox/types.ts",
    paths: ["src/lib/inbox", "src/lib/server/inbox.ts", "src/lib/server/extract.ts", "src/lib/server/reconcile.ts", "src/components/inbox"],
  },
];

/** Where a source file sits, for grouping a Component's Elements on the page. */
function layerOf(rel) {
  if (rel.startsWith("src/lib/server/")) return "Access layer (server)";
  if (rel.startsWith("src/components/")) return "UI";
  return "Core (pure)";
}

/** Title-case a slug for headings ("my-thing" → "My Thing"). */
function titleCase(slug) {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Recursively list source files under a path (file or dir), excluding tests/specs. */
function listSourceFiles(absPath) {
  let stat;
  try {
    stat = statSync(absPath);
  } catch {
    return [];
  }
  if (stat.isFile()) return isSource(absPath) ? [absPath] : [];
  const out = [];
  for (const entry of readdirSync(absPath, { withFileTypes: true })) {
    const full = path.join(absPath, entry.name);
    if (entry.isDirectory()) out.push(...listSourceFiles(full));
    else if (isSource(full)) out.push(full);
  }
  return out.sort();
}

function isSource(file) {
  return (
    (file.endsWith(".ts") || file.endsWith(".tsx")) &&
    !file.endsWith(".test.ts") &&
    !file.endsWith(".steps.ts") &&
    !file.endsWith(".d.ts")
  );
}

/** Strip a JSDoc/block-comment body to plain lines (drop the leading ` * `). */
function cleanComment(body) {
  return body
    .split("\n")
    .map((l) => l.replace(/^\s*\*?\s?/, "").replace(/\s+$/, ""))
    .join("\n")
    .trim();
}

/** The first paragraph of a comment body (up to the first blank line). */
function firstParagraph(text) {
  if (!text) return "";
  const para = text.split(/\n\s*\n/)[0].trim();
  return para.replace(/\s*\n\s*/g, " ");
}

/**
 * A file's header comment: a `/** ... *\/` block at the very top of the file, before any
 * import or code. Returns "" when the file leads with imports (no true header) — which is
 * the signal to the author that a header would enrich this page.
 */
function fileHeader(src) {
  const m = src.match(/^﻿?\s*\/\*\*([\s\S]*?)\*\//);
  if (!m) return "";
  // Only treat it as a *file* header if nothing but whitespace precedes it.
  if (src.slice(0, m.index).trim() !== "") return "";
  return cleanComment(m[1]);
}

/**
 * Exported model types from a `types.ts`: every `export interface|type NAME`, with the
 * doc-comment immediately preceding it (if any). This is the C4 model for the context.
 */
function parseModel(src) {
  const re = /export\s+(interface|type)\s+([A-Za-z0-9_]+)/g;
  const out = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    out.push({ name: m[2], kind: m[1], doc: precedingDoc(src.slice(0, m.index)) });
  }
  return out;
}

/**
 * The doc-comment immediately preceding an export — i.e. the last `/** ... *\/` block in
 * `before`, but only if nothing but whitespace separates it from the export. Anchoring to
 * the *end* avoids accidentally reaching back to an earlier comment (or the file header).
 */
function precedingDoc(before) {
  const trimmed = before.replace(/\s+$/, "");
  if (!trimmed.endsWith("*/")) return "";
  const start = trimmed.lastIndexOf("/**");
  if (start === -1) return "";
  return firstParagraph(cleanComment(trimmed.slice(start + 3, trimmed.length - 2)));
}

function readFileSafe(abs) {
  try {
    return readFileSync(abs, "utf8");
  } catch {
    return null;
  }
}

/** Build the descriptor for one context: its components (by layer), model, behaviours. */
async function buildContext(ctx, sourceMap) {
  const seen = new Set();
  const files = [];
  for (const p of ctx.paths) {
    for (const abs of listSourceFiles(path.join(ROOT, p))) {
      const rel = path.relative(ROOT, abs);
      if (seen.has(rel)) continue;
      seen.add(rel);
      const src = readFileSafe(abs) ?? "";
      files.push({
        rel,
        name: path.basename(rel),
        layer: layerOf(rel),
        description: firstParagraph(fileHeader(src)),
      });
    }
  }

  // Behaviours that name any of this Component's files in a `@source` tag.
  const behaviours = [];
  const behaviourSeen = new Set();
  for (const f of files) {
    for (const b of sourceMap.get(f.rel) ?? []) {
      if (behaviourSeen.has(b.link)) continue;
      behaviourSeen.add(b.link);
      behaviours.push(b);
    }
  }

  const modelSrc = readFileSafe(path.join(ROOT, ctx.modelFile));
  const model = modelSrc ? parseModel(modelSrc) : [];

  return { ...ctx, files, model, behaviours };
}

/** Render one Component's C3 page (its Elements, model, and behaviours). */
function renderContextPage(ctx) {
  const out = [`# ${ctx.glyph} ${ctx.title}`, "", `_${ctx.tagline}_`, ""];

  out.push(
    "::: tip Generated from source",
    "This page is generated from the code: file descriptions come from each file's header comment, the model from `types.ts`, and the behaviours from the `@source` tags on the feature specs. Improve the code's comments to enrich it.",
    ":::",
    "",
  );

  // Elements, grouped by layer.
  const layers = ["Core (pure)", "Access layer (server)", "UI"];
  out.push("## Elements", "");
  for (const layer of layers) {
    const inLayer = ctx.files.filter((f) => f.layer === layer);
    if (inLayer.length === 0) continue;
    out.push(`### ${layer}`, "", "| File | Responsibility |", "| --- | --- |");
    for (const f of inLayer) {
      const desc = f.description ? f.description.replace(/\|/g, "\\|") : "_—_";
      out.push(`| \`${f.name}\` | ${desc} |`);
    }
    out.push("");
  }

  // C4 model.
  if (ctx.model.length > 0) {
    out.push("## Model", "", `The data types this Component owns (from \`${path.basename(ctx.modelFile)}\`).`, "", "| Type | Kind | Description |", "| --- | --- | --- |");
    for (const t of ctx.model) {
      const desc = t.doc ? t.doc.replace(/\|/g, "\\|") : "_—_";
      out.push(`| \`${t.name}\` | ${t.kind} | ${desc} |`);
    }
    out.push("");
  }

  // Behaviours (cross-link into the dynamic view).
  out.push("## Behaviours", "");
  if (ctx.behaviours.length > 0) {
    out.push("Executable specifications that validate this Component:", "");
    for (const b of ctx.behaviours) out.push(`- [${b.name}](${b.link})`);
  } else {
    out.push("_No behavioural specs target this Component yet._");
  }
  out.push("");

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

/** Build every context page descriptor. */
export async function buildArchDocs() {
  const sourceMap = await buildSourceMap();
  const docs = [];
  for (const ctx of CONTEXTS) {
    const built = await buildContext(ctx, sourceMap);
    docs.push({
      id: ctx.id,
      title: ctx.title,
      glyph: ctx.glyph,
      outPath: path.join(ARCH_COMPONENTS_DIR, `${ctx.id}.md`),
      link: `/architecture/components/${ctx.id}`,
      markdown: renderContextPage(built),
    });
  }
  return docs;
}

/** The Components index page (C3 overview), one entry per Component. */
export function renderComponentsIndex(docs) {
  const out = [
    "# Components (C3)",
    "",
    "The **Components** of the Financial Domain — each surfaced as a View in the app (Vision, Trajectory, Investments, Buckets, Spending, Inbox). A Component is a set of **Elements**: its core (pure) model, its server access layer, and its UI — with the model it owns and the behaviours that validate it. Generated from the source; see each page.",
    "",
    "| Component | What it owns |",
    "| --- | --- |",
  ];
  for (const ctx of CONTEXTS) {
    out.push(`| [${ctx.glyph} ${ctx.title}](/architecture/components/${ctx.id}) | ${ctx.tagline.replace(/\|/g, "\\|")} |`);
  }
  out.push("");
  return out.join("\n").trimEnd() + "\n";
}

/** The generated sidebar section for the Architecture tree. */
export function renderArchSidebar(docs) {
  return [
    {
      text: "Architecture",
      collapsed: false,
      items: [
        { text: "C1 · Context", link: "/architecture/" },
        { text: "C2 · Containers (Domains)", link: "/architecture/containers" },
        { text: "C3 · Components", link: "/architecture/components/" },
        ...docs.map((d) => ({ text: `${d.glyph} ${d.title}`, link: d.link })),
        { text: "C4 · Data model", link: "/architecture/data-model" },
      ],
    },
  ];
}

export { titleCase };
