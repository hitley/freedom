/**
 * A persistent bar naming which local data profile is live, so you can never
 * mistake one dataset for another while presenting or screenshotting:
 *  - **dev** (`npm run dev`, port 3000) → sky "DEV DATA" (local scratch, safe);
 *  - **demo** (`npm run dev:demo`) → amber "DEMO DATA" (fabricated sample);
 *  - **real** (`npm run dev:real`) → red "REAL DATA" (your actual private data).
 * Production (no `FREEDOM_PROFILE`) renders nothing. Every local profile is now
 * labelled, so the *unmarked* default port is never a live data surface — and the
 * boot guard in `src/instrumentation.ts` refuses to serve `real` on port 3000.
 *
 * A plain server component: it reads `FREEDOM_PROFILE` at render on the server, so
 * the flag never ships to or can be flipped by the client.
 */
export default function ProfileBanner() {
  const profile = process.env.FREEDOM_PROFILE;

  if (profile === "dev") {
    return (
      <Bar className="bg-sky-600 text-white" glyph="🧪">
        Dev data — local scratch, safe to experiment
      </Bar>
    );
  }

  if (profile === "demo") {
    return (
      <Bar className="bg-amber-400 text-amber-950" glyph="🎭">
        Demo data — fabricated sample, not real finances
      </Bar>
    );
  }

  if (profile === "real") {
    return (
      <Bar className="bg-red-600 text-white" glyph="🔒">
        Real data — your actual finances, keep off shared screens
      </Bar>
    );
  }

  return null;
}

function Bar({
  className,
  glyph,
  children,
}: {
  className: string;
  glyph: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="status"
      className={`flex items-center justify-center gap-2 px-4 py-1.5 text-center text-xs font-semibold uppercase tracking-wide ${className}`}
    >
      <span aria-hidden>{glyph}</span>
      {children}
    </div>
  );
}
