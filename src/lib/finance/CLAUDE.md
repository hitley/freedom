# Finance engine — `src/lib/finance/`

The Finance engine Component (surfaced as the **Trajectory** View): pure,
dependency-light, framework-agnostic math (magic number, coast number, month-by-month
projection). No I/O — unit-testable. Validation via zod at the trust boundary
(`financialInputsSchema`).

See `src/lib/CLAUDE.md` for shared conventions; `docs/architecture/components/finance.md`
for the generated structural view.
