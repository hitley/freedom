// Claude Code PostToolUse hook: keep the living docs and behavioural specs honest as
// code changes. Wired in .claude/settings.json to run after Edit/Write/MultiEdit.
//
// It reads the hook payload on stdin, and *only* acts when the edited file is a
// `.feature` file or a `src/` application path:
//  - if a `.feature` changed → regenerate the behaviour docs (so docs/features stays current);
//  - if a `src/` file changed and the generated architecture docs have drifted →
//    regenerate docs/architecture/components;
//  - run the affected behavioural specs (fast — only the relevant ones);
//  - surface, but never block, so it's a nudge rather than a gate.
//
// All output goes to stderr as a single JSON object per the hook contract, fed back
// to Claude as context. Exits 0 regardless (advisory only).

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function emit(message) {
  // PostToolUse advisory feedback: additionalContext shows up for the model.
  process.stdout.write(
    JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: message } }),
  );
  process.exit(0);
}

function silent() {
  process.exit(0);
}

// --- read stdin payload ---
let raw = "";
try {
  raw = await new Promise((resolve) => {
    let buf = "";
    process.stdin.on("data", (d) => (buf += d));
    process.stdin.on("end", () => resolve(buf));
    process.stdin.on("error", () => resolve(""));
  });
} catch {
  silent();
}

let filePath = "";
try {
  const payload = JSON.parse(raw || "{}");
  filePath = payload?.tool_input?.file_path ?? "";
} catch {
  silent();
}
if (!filePath) silent();

const rel = path.relative(ROOT, path.resolve(ROOT, filePath));
const isFeature = rel.endsWith(".feature");
const isAppPath = rel.startsWith("src/lib/") || rel.startsWith("src/");
if (!isFeature && !isAppPath) silent();

function run(cmd, args) {
  try {
    return { ok: true, out: execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8" }) };
  } catch (e) {
    return { ok: false, out: (e.stdout ?? "") + (e.stderr ?? "") };
  }
}

const notes = [];

// A changed feature file means the generated docs may be stale — regenerate them.
if (isFeature) {
  const gen = run("node", ["scripts/generate-feature-docs.mjs"]);
  notes.push(
    gen.ok
      ? "Regenerated docs/features from the changed .feature file — review and commit the generated Markdown."
      : "Tried to regenerate feature docs but it failed:\n" + gen.out.trim(),
  );
}

// A changed src file may change the generated *architecture* docs (a file's header
// comment, its `types.ts` model, or context membership). Only regenerate — and nudge —
// when they've actually drifted, so unrelated src edits stay quiet.
if (isAppPath) {
  const check = run("node", ["scripts/check-arch-docs.mjs"]);
  if (!check.ok) {
    const gen = run("node", ["scripts/generate-arch-docs.mjs"]);
    notes.push(
      gen.ok
        ? "Regenerated docs/architecture/components from the changed source — review and commit the generated Markdown."
        : "Tried to regenerate architecture docs but it failed:\n" + gen.out.trim(),
    );
  }
}

// Map the changed path to the behavioural specs that describe it, and run just those.
const affected = run("node", ["scripts/affected-specs.mjs", "--run", rel]);
const out = affected.out.trim();

if (/No behavioural specs are affected/.test(out)) {
  // Only worth surfacing the "uncovered domain logic" nudge, if present.
  const warn = out.includes("no behavioural spec referencing it")
    ? out.slice(out.indexOf("⚠"))
    : "";
  if (warn) notes.push(warn);
} else {
  notes.push(affected.ok ? "Affected behavioural specs pass:\n" + out : "Affected behavioural specs FAILED:\n" + out);
}

if (notes.length === 0) silent();
emit(notes.join("\n\n"));
