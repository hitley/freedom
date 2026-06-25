import { defineConfig } from "vitepress";
import { withMermaid } from "vitepress-plugin-mermaid";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

// Two generated sidebars, both built before docs:dev / docs:build:
//   • the behavioural tree, from the `.feature` files (scripts/generate-feature-docs.mjs)
//   • the architecture tree (C3 components), from the source (scripts/generate-arch-docs.mjs)
const load = (file: string) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8"));
const sidebarFeatures = load("./sidebar.generated.json");
const sidebarArch = load("./arch-sidebar.generated.json");

// Served at /docs by the Next app: VitePress builds into ../public/docs, and Next
// serves public/ at the site root, so the static docs live under /docs/. The base
// must match. See design-notes/002.
export default withMermaid(
  defineConfig({
    title: "Freedom — Docs",
    description: "How Freedom is built and how it behaves — generated from its source and its executable specifications.",
    base: "/docs/",
    outDir: fileURLToPath(new URL("../../public/docs", import.meta.url)),
    cleanUrls: true,
    ignoreDeadLinks: true,
    themeConfig: {
      nav: [
        { text: "Home", link: "/" },
        { text: "Architecture", link: "/architecture/" },
        { text: "Behaviours", link: "/features/" },
      ],
      sidebar: {
        "/architecture/": [...sidebarArch],
        "/features/": [
          { text: "Overview", items: [{ text: "All behaviours", link: "/features/" }] },
          ...sidebarFeatures,
        ],
        "/": [
          { text: "Overview", items: [{ text: "What is this?", link: "/" }] },
          ...sidebarArch,
          { text: "Behaviours", collapsed: false, items: [{ text: "All behaviours", link: "/features/" }, ...sidebarFeatures.flatMap((s: { items: unknown[] }) => s.items)] },
        ],
      },
      outline: "deep",
    },
  }),
);
