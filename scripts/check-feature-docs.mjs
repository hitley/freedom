// Verify the committed feature docs are current — the "docs can't drift" guard.
// Regenerates every page in memory and compares it to what's on disk; exits non-zero
// (with the offending files) if anything differs. Run in CI and from the pre-commit
// hook. Fix a failure with `npm run docs:generate`.

import { readFileSync } from "node:fs";
import path from "node:path";
import {
  DOCS_FEATURES_DIR,
  SIDEBAR_FILE,
  ROOT,
  buildDocs,
  renderIndexPage,
  renderSidebar,
} from "./feature-docs.mjs";

function read(file) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

const docs = await buildDocs();
const stale = [];

for (const doc of docs) {
  if (read(doc.outPath) !== doc.markdown) stale.push(path.relative(ROOT, doc.outPath));
}
if (read(path.join(DOCS_FEATURES_DIR, "index.md")) !== renderIndexPage(docs)) {
  stale.push("docs/features/index.md");
}
if (read(SIDEBAR_FILE) !== JSON.stringify(renderSidebar(docs), null, 2) + "\n") {
  stale.push(path.relative(ROOT, SIDEBAR_FILE));
}

if (stale.length > 0) {
  console.error("✖ Feature docs are out of date:\n" + stale.map((f) => "  - " + f).join("\n"));
  console.error("\nRun `npm run docs:generate` and commit the result.");
  process.exit(1);
}

console.log(`✓ Feature docs are up to date (${docs.length} feature page(s)).`);
