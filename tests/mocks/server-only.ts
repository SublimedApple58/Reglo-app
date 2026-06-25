// Stub for the `server-only` package under Jest.
//
// `server-only` is an internal Next.js dependency that is not resolvable from
// the pnpm root in the test environment. At runtime it is a no-op on the server
// (and throws if imported from a client bundle). Under Jest (node env) we only
// need it to resolve to nothing so server modules can be imported in tests.
export {};
