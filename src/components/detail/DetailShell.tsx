/**
 * The maximised **detail view** chrome: a glyph + title + subtitle header with
 * Edit and Minimise actions, wrapping whatever the View wants to show (stats,
 * a {@link ProjectionChart}, what-if sliders, history…). Each View renders its
 * own body as `children`; this just gives every detail view the same frame and
 * the same way back to its overview.
 */
export default function DetailShell({
  glyph,
  title,
  subtitle,
  onEdit,
  onClose,
  children,
}: {
  glyph?: string;
  title: string;
  subtitle?: string;
  /** Omit to hide the Edit button (e.g. a detail with no editor of its own). */
  onEdit?: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-6 flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {glyph && <span className="text-3xl">{glyph}</span>}
          <div>
            <h2 className="font-display text-2xl font-bold leading-tight">{title}</h2>
            {subtitle && <div className="mt-0.5 text-sm text-muted">{subtitle}</div>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="rounded-full border border-border px-4 py-1.5 text-xs text-muted transition-colors hover:border-muted/50 hover:text-foreground"
            >
              Edit
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-surface-2 px-4 py-1.5 text-xs font-semibold text-foreground transition-opacity hover:opacity-90"
          >
            ↙ Minimise
          </button>
        </div>
      </div>
      {children}
    </section>
  );
}
