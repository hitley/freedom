import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (the local-dev database driver) ships WASM and must not be bundled
  // into the server build — keep it external so it's required at runtime. It's
  // dynamically imported and only loaded when DATABASE_DRIVER=pglite, so this is
  // inert in production (which uses the Neon driver).
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
