/**
 * A persistent bar naming which local data profile is live, so you can never
 * mistake one dataset for another while presenting or screenshotting:
 *  - **demo** (`npm run dev:demo`) → amber "DEMO DATA" (fabricated sample);
 *  - **real** (`npm run dev:real`) → red "REAL DATA" (your actual private data).
 * Any other case (the default `npm run dev`, or production) renders nothing.
 *
 * A plain server component: it reads `FREEDOM_PROFILE` at render on the server, so
 * the flag never ships to or can be flipped by the client.
 */
export default function ProfileBanner() {
  const profile = process.env.FREEDOM_PROFILE;

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
