// Empty stand-in for the `server-only` package under Vitest. In a real RSC build
// `server-only` throws if imported into a client bundle; under Node that guard has
// nothing to protect, so we alias it to this no-op (see vitest.config.ts).
export {};
