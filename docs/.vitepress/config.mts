import { defineConfig } from "vitepress";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

// The behaviour sidebar is generated from the `.feature` files by
// `scripts/generate-feature-docs.mjs` (run automatically before docs:dev / docs:build).
const sidebarFeatures = JSON.parse(
  readFileSync(fileURLToPath(new URL("./sidebar.generated.json", import.meta.url)), "utf8"),
);

// Served at /docs by the Next app: VitePress builds into ../public/docs, and Next
// serves public/ at the site root, so the static docs live under /docs/. The base
// must match. See design-notes/002.
export default defineConfig({
  title: "Freedom — Docs",
  description: "How Freedom behaves, generated from its executable specifications.",
  base: "/docs/",
  outDir: fileURLToPath(new URL("../../public/docs", import.meta.url)),
  cleanUrls: true,
  ignoreDeadLinks: true,
  themeConfig: {
    nav: [
      { text: "Home", link: "/" },
      { text: "Behaviours", link: "/features/" },
    ],
    sidebar: [
      { text: "Overview", items: [{ text: "What is this?", link: "/" }, { text: "All behaviours", link: "/features/" }] },
      ...sidebarFeatures,
    ],
    outline: "deep",
  },
});
