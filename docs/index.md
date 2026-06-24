---
layout: home
hero:
  name: Freedom
  text: How the app behaves
  tagline: Living documentation, generated from executable specifications. Everything here is enforced by the test suite — it can't drift from what the app actually does.
  actions:
    - theme: brand
      text: Browse behaviours
      link: /features/
---

## Why this exists

These pages describe what Freedom does — in plain Given/When/Then examples rather than
prose that rots. Each page is generated from a `.feature` file that the test suite runs
on every change. If a behaviour is documented here, there is a passing test for it.

See the engineering rationale in `design-notes/002-bdd-testing-and-living-docs.md`.
