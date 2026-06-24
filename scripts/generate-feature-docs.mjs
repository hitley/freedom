// Regenerate the VitePress feature docs from the `.feature` files. Writes one page
// per feature, the features index, and the generated sidebar. Run via `npm run
// docs:generate` (and automatically before `docs:dev` / `docs:build`).
//
// Idempotent: same features in → same bytes out. `check-feature-docs.mjs` relies on
// that to detect drift.

import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  DOCS_FEATURES_DIR,
  SIDEBAR_FILE,
  buildDocs,
  renderIndexPage,
  renderSidebar,
} from "./feature-docs.mjs";

const docs = await buildDocs();

// Clear and rewrite the generated tree so deleted/renamed features don't linger.
rmSync(DOCS_FEATURES_DIR, { recursive: true, force: true });
mkdirSync(DOCS_FEATURES_DIR, { recursive: true });

for (const doc of docs) {
  mkdirSync(path.dirname(doc.outPath), { recursive: true });
  writeFileSync(doc.outPath, doc.markdown);
}

writeFileSync(path.join(DOCS_FEATURES_DIR, "index.md"), renderIndexPage(docs));

mkdirSync(path.dirname(SIDEBAR_FILE), { recursive: true });
writeFileSync(SIDEBAR_FILE, JSON.stringify(renderSidebar(docs), null, 2) + "\n");

console.log(`Generated ${docs.length} feature page(s) into docs/features/.`);
