// Verify the committed architecture docs are current — the structural-docs "can't drift"
// guard, mirroring check-feature-docs.mjs. Regenerates every page in memory and compares
// to disk; exits non-zero (listing the stale files) on any difference. Fix with
// `npm run docs:generate`.

import { readFileSync } from "node:fs";
import path from "node:path";
import {
  ARCH_COMPONENTS_DIR,
  ARCH_SIDEBAR_FILE,
  buildArchDocs,
  renderArchSidebar,
  renderComponentsIndex,
} from "./arch-docs.mjs";
import { ROOT } from "./feature-docs.mjs";

function read(file) {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

const docs = await buildArchDocs();
const stale = [];

for (const doc of docs) {
  if (read(doc.outPath) !== doc.markdown) stale.push(path.relative(ROOT, doc.outPath));
}
if (read(path.join(ARCH_COMPONENTS_DIR, "index.md")) !== renderComponentsIndex(docs)) {
  stale.push("docs/architecture/components/index.md");
}
if (read(ARCH_SIDEBAR_FILE) !== JSON.stringify(renderArchSidebar(docs), null, 2) + "\n") {
  stale.push(path.relative(ROOT, ARCH_SIDEBAR_FILE));
}

if (stale.length > 0) {
  console.error("✖ Architecture docs are out of date:\n" + stale.map((f) => "  - " + f).join("\n"));
  console.error("\nRun `npm run docs:generate` and commit the result.");
  process.exit(1);
}

console.log(`✓ Architecture docs are up to date (${docs.length} component page(s)).`);
