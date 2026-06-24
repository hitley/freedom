// "Knowledge of intent": map changed application paths to the behavioural specs that
// describe them, using the `@source:` tags on each feature. Prints which behaviours a
// change touches, flags changed source with *no* behavioural coverage, and with --run
// executes exactly the affected specs.
//
//   node scripts/affected-specs.mjs                # inspect working-tree changes
//   node scripts/affected-specs.mjs --base origin/main
//   node scripts/affected-specs.mjs --run          # run the affected specs
//   node scripts/affected-specs.mjs src/lib/spending/index.ts   # explicit paths
//
// Used by the pre-commit hook to re-run only the relevant specs on a source change.

import { execFileSync } from "node:child_process";
import path from "node:path";
import { ROOT, buildSourceMap, listFeatureFiles } from "./feature-docs.mjs";

const args = process.argv.slice(2);
const run = args.includes("--run");
const baseIdx = args.indexOf("--base");
const base = baseIdx >= 0 ? args[baseIdx + 1] : null;
// Positional paths = non-flag args, excluding the value consumed by --base (if any).
const baseValueIdx = baseIdx >= 0 ? baseIdx + 1 : -1;
const explicit = args.filter((a, i) => !a.startsWith("--") && i !== baseValueIdx);

function git(cmdArgs) {
  try {
    return execFileSync("git", cmdArgs, { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

/** The set of repo-relative paths that changed. */
function changedFiles() {
  if (explicit.length > 0) return explicit;
  if (base) return git(["diff", "--name-only", base]).split("\n").filter(Boolean);
  // Working tree: staged + unstaged + untracked.
  return git(["status", "--porcelain"])
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3).trim())
    .filter(Boolean);
}

const sourceMap = await buildSourceMap(); // source path -> [{ name, link, file }]
const featureFiles = listFeatureFiles().map((f) => path.relative(ROOT, f));
const changed = changedFiles();

const affectedFeatures = new Map(); // feature file -> display name
const uncovered = [];

for (const file of changed) {
  // A change to a feature or its steps obviously affects that feature.
  if (file.endsWith(".feature")) {
    affectedFeatures.set(file, path.basename(file));
    continue;
  }
  if (file.endsWith(".steps.ts")) {
    const f = featureFiles.find((ff) => ff.replace(/\.feature$/, "") === file.replace(/\.steps\.ts$/, ""));
    if (f) affectedFeatures.set(f, path.basename(f));
    continue;
  }
  // An application path: any feature that declares it as a @source.
  const features = sourceMap.get(file);
  if (features) {
    for (const ft of features) affectedFeatures.set(ft.file, ft.name);
  } else if (/^src\/lib\//.test(file)) {
    // Domain logic with no behavioural spec referencing it — worth surfacing.
    uncovered.push(file);
  }
}

if (changed.length === 0) {
  console.log("No changes detected.");
  process.exit(0);
}

if (affectedFeatures.size === 0) {
  console.log("No behavioural specs are affected by these changes.");
} else {
  console.log("Behavioural specs affected by your changes:");
  for (const [file, name] of affectedFeatures) console.log(`  • ${name}  (${file})`);
}

if (uncovered.length > 0) {
  console.log("\n⚠ Changed domain logic with no behavioural spec referencing it:");
  for (const f of uncovered) console.log(`  • ${f}`);
  console.log("  Consider adding/extending a feature, or a @source tag if one already covers it.");
}

if (run && affectedFeatures.size > 0) {
  // Each feature's steps file is its executable form (same path, .steps.ts).
  const stepFiles = [...affectedFeatures.keys()].map((f) => f.replace(/\.feature$/, ".steps.ts"));
  console.log(`\nRunning affected specs:\n  ${stepFiles.join("\n  ")}\n`);
  try {
    execFileSync("npx", ["vitest", "run", ...stepFiles], { cwd: ROOT, stdio: "inherit" });
  } catch {
    process.exit(1);
  }
}
