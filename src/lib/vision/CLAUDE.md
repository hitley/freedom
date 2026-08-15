# Vision — `src/lib/vision/`

The Vision Component: pure data for the vision & goal capture phase — the `FreedomVision`
type (headline, why, motivations, FIRE style, target spend/age), motivation + FIRE-style
metadata, and the `freedomVisionSchema` zod boundary. Persisted per-instance (see
`src/lib/server/CLAUDE.md`); surfaced via the dismissible vision modal (see
`src/components/CLAUDE.md`).

See `src/lib/CLAUDE.md` for shared conventions; `docs/architecture/components/vision.md`
for the generated structural view.
