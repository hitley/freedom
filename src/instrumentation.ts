/**
 * Boot-time safety guard (Next's `register` runs once, before the server accepts
 * requests). It refuses to serve the **real** data profile on port **3000** — the
 * default port everyone opens by habit, and how real financial data has ended up on
 * a "looks like the dev instance" screen before. `npm run dev:real` pins a dedicated
 * port (3102); this is the belt-and-braces that also catches a manual `-p 3000`.
 */
export function register() {
  // Only the Node.js server runtime (skip edge/other runtimes).
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.FREEDOM_PROFILE !== "real") return;

  if (resolvePort() === 3000) {
    throw new Error(
      "\n🛑 Refusing to serve the REAL data profile (FREEDOM_PROFILE=real) on port 3000.\n" +
        "   Port 3000 is the default/shared port — real financial data must run on its own.\n" +
        "   Use `npm run dev:real` (pinned to 3102), or pass an explicit non-3000 port.\n",
    );
  }
}

/** The port this server will bind: an explicit `-p/--port` flag, else `$PORT`, else Next's 3000. */
function resolvePort(): number {
  const argv = process.argv;
  for (let i = 0; i < argv.length; i++) {
    if ((argv[i] === "-p" || argv[i] === "--port") && argv[i + 1]) {
      const n = Number(argv[i + 1]);
      if (Number.isFinite(n)) return n;
    }
    const m = argv[i].match(/^--port=(\d+)$/);
    if (m) return Number(m[1]);
  }
  const envPort = Number(process.env.PORT);
  if (Number.isFinite(envPort) && envPort > 0) return envPort;
  return 3000;
}
