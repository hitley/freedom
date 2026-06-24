// Shared library for the feature-doc tooling. One job: turn the `.feature` files —
// the very same source the behavioural specs execute (parsed here with the *same*
// parser, `@amiceli/vitest-cucumber`'s `loadFeature`) — into VitePress Markdown.
//
// Because docs and tests read the identical files through the identical parser, the
// published docs can't describe behaviour the tests don't enforce. `generate.mjs`
// writes the output; `check.mjs` regenerates in memory and diffs against what's on
// disk to prove the docs are current. See design-notes/002.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadFeature } from "@amiceli/vitest-cucumber";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const FEATURES_DIR = path.join(ROOT, "features");
export const DOCS_FEATURES_DIR = path.join(ROOT, "docs", "features");
export const SIDEBAR_FILE = path.join(ROOT, "docs", ".vitepress", "sidebar.generated.json");

/** Recursively list every `.feature` file under `features/`, sorted for stable output. */
export function listFeatureFiles(dir = FEATURES_DIR) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFeatureFiles(full));
    else if (entry.name.endsWith(".feature")) out.push(full);
  }
  return out.sort();
}

/** The capability (top-level folder under features/) a feature belongs to, e.g. "ingestion". */
export function capabilityOf(featurePath) {
  const rel = path.relative(FEATURES_DIR, featurePath);
  const [first] = rel.split(path.sep);
  return rel.includes(path.sep) ? first : "general";
}

/** Title-case a capability slug for headings ("ingestion" → "Ingestion", "my-thing" → "My Thing"). */
function titleCase(slug) {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** The `@source:<path>` tags declare which application paths a feature validates. */
export function sourcesOf(feature) {
  return [...(feature.tags ?? [])]
    .filter((t) => t.startsWith("source:"))
    .map((t) => t.slice("source:".length));
}

function escapePipes(text) {
  return String(text).replace(/\|/g, "\\|");
}

/** Render a parsed step (keyword + text, plus any docstring / datatable) as Markdown. */
function renderStep(step, keywordOverride) {
  const keyword = keywordOverride ?? step.type;
  const lines = [`- **${keyword}** ${step.details}`];

  if (step.docStrings) {
    lines.push("", "  ```", ...String(step.docStrings).split("\n").map((l) => "  " + l), "  ```");
  }
  const table = step.dataTables ?? [];
  if (table.length > 0) {
    const headers = Object.keys(table[0]);
    lines.push(
      "",
      "  | " + headers.join(" | ") + " |",
      "  | " + headers.map(() => "---").join(" | ") + " |",
      ...table.map((row) => "  | " + headers.map((h) => escapePipes(row[h] ?? "")).join(" | ") + " |"),
    );
  }
  return lines.join("\n");
}

/** Steps come back flat; Given/When/Then keep their keyword, And/But render as "And". */
function renderSteps(steps) {
  return steps
    .map((step) => renderStep(step, step.type === "And" || step.type === "But" ? "And" : step.type))
    .join("\n");
}

/** Build the Markdown page for one parsed feature. */
export function renderFeaturePage(feature) {
  const out = [];
  out.push(`# ${feature.name}`, "");

  if (feature.description?.trim()) {
    out.push(feature.description.trim(), "");
  }

  out.push(
    "::: tip Executable specification",
    "Every scenario below is run as a test. If it appears here, it passes — the docs are generated from the same `.feature` files the test suite executes.",
    ":::",
    "",
  );

  const sources = sourcesOf(feature);
  if (sources.length > 0) {
    out.push(
      "**Validated against:** " + sources.map((s) => "`" + s + "`").join(", "),
      "",
    );
  }

  if (feature.background && feature.background.steps.length > 0) {
    out.push("## Background", "", "_Applies to every scenario below._", "", renderSteps(feature.background.steps), "");
  }

  for (const scenario of feature.scenarii) {
    out.push(`## ${scenario.description}`, "", renderSteps(scenario.steps), "");
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}

/** Parse every feature file and return doc descriptors (capability, route, markdown). */
export async function buildDocs() {
  const files = listFeatureFiles();
  const docs = [];
  for (const file of files) {
    const feature = await loadFeature(file);
    const capability = capabilityOf(file);
    const slug = path.basename(file, ".feature");
    docs.push({
      file,
      capability,
      slug,
      name: feature.name,
      sources: sourcesOf(feature),
      outPath: path.join(DOCS_FEATURES_DIR, capability, `${slug}.md`),
      link: `/features/${capability}/${slug}`,
      markdown: renderFeaturePage(feature),
    });
  }
  return docs;
}

/** The features index page (Markdown), grouping every feature by capability. */
export function renderIndexPage(docs) {
  const byCap = new Map();
  for (const d of docs) {
    if (!byCap.has(d.capability)) byCap.set(d.capability, []);
    byCap.get(d.capability).push(d);
  }
  const out = ["# Behaviours", "", "What the app does, described as executable examples. Each page is generated from a `.feature` file that the test suite runs.", ""];
  for (const [cap, items] of [...byCap.entries()].sort()) {
    out.push(`## ${titleCase(cap)}`, "");
    for (const d of items.sort((a, b) => a.name.localeCompare(b.name))) {
      out.push(`- [${d.name}](${d.link})`);
    }
    out.push("");
  }
  return out.join("\n").trimEnd() + "\n";
}

/** The VitePress sidebar (generated), one section per capability. */
export function renderSidebar(docs) {
  const byCap = new Map();
  for (const d of docs) {
    if (!byCap.has(d.capability)) byCap.set(d.capability, []);
    byCap.get(d.capability).push(d);
  }
  return [...byCap.entries()].sort().map(([cap, items]) => ({
    text: titleCase(cap),
    collapsed: false,
    items: items
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((d) => ({ text: d.name, link: d.link })),
  }));
}

/** Read the source→feature map: which feature files declare a given application path. */
export async function buildSourceMap() {
  const docs = await buildDocs();
  const map = new Map(); // source path -> [{ name, link, file }]
  for (const d of docs) {
    for (const source of d.sources) {
      if (!map.has(source)) map.set(source, []);
      map.get(source).push({ name: d.name, link: d.link, file: path.relative(ROOT, d.file) });
    }
  }
  return map;
}

export { readFileSync };
