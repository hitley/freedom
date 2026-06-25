---
layout: home
hero:
  name: Freedom
  text: How the app is built & how it behaves
  tagline: Living documentation, generated from the source and its executable specifications — two views, structure and behaviour, that can't drift from the real app.
  actions:
    - theme: brand
      text: Browse architecture
      link: /architecture/
    - theme: alt
      text: Browse behaviours
      link: /features/
---

## Two views, both generated

Freedom's docs come in two complementary axes, and **neither is hand-maintained prose
that rots**:

- **[Architecture](/architecture/)** — the *structural* view, organised by the
  [C4 model](https://c4model.com) and the app's DDD bounded contexts. The C3 component
  pages and the C4 model are generated from the source code (file header comments, the
  `types.ts` models, and the schema). Improve the code's names and comments and these
  pages get richer.
- **[Behaviours](/features/)** — the *dynamic* view: what the app does, in plain
  Given/When/Then examples generated from the `.feature` files the test suite runs. If a
  behaviour is documented here, there is a passing test for it.

The two are cross-linked: each context lists the behaviours that validate it.

See the engineering rationale in `design-notes/002-bdd-testing-and-living-docs.md`.
