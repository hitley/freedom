// Regenerate the VitePress **architecture** docs (the C3 component pages + their index +
// the generated sidebar) from the source code. Run via `npm run docs:generate` alongside
// the feature docs. Idempotent: same source in → same bytes out, so `check-arch-docs.mjs`
// can detect drift.

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  ARCH_COMPONENTS_DIR,
  ARCH_SIDEBAR_FILE,
  buildArchDocs,
  renderArchSidebar,
  renderComponentsIndex,
} from "./arch-docs.mjs";

const docs = await buildArchDocs();

// Clear and rewrite the generated component tree so removed contexts don't linger.
rmSync(ARCH_COMPONENTS_DIR, { recursive: true, force: true });
mkdirSync(ARCH_COMPONENTS_DIR, { recursive: true });

for (const doc of docs) {
  writeFileSync(doc.outPath, doc.markdown);
}

writeFileSync(path.join(ARCH_COMPONENTS_DIR, "index.md"), renderComponentsIndex(docs));

mkdirSync(path.dirname(ARCH_SIDEBAR_FILE), { recursive: true });
writeFileSync(ARCH_SIDEBAR_FILE, JSON.stringify(renderArchSidebar(docs), null, 2) + "\n");

console.log(`Generated ${docs.length} component page(s) into docs/architecture/components/.`);
