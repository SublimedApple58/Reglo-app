// Stub for `@react-pdf/renderer` under Jest.
//
// The real package is published as pure ESM and pulls in further ESM-only deps
// (`@react-pdf/primitives`, ...), which ts-jest does not transpile from
// node_modules. Test suites only import server modules (e.g. lib/autoscuole
// /payments.ts) for their business logic — they never actually render a PDF —
// so a no-op stub is sufficient. `StyleSheet.create` is the only API evaluated
// at module load; it just echoes back the style map.

type StyleMap = Record<string, unknown>;

export const StyleSheet = {
  create: <T extends StyleMap>(styles: T): T => styles,
};

const passthrough = () => null;

export const Document = passthrough;
export const Page = passthrough;
export const Text = passthrough;
export const View = passthrough;
export const Image = passthrough;
export const Font = { register: () => undefined };

export const renderToBuffer = async (): Promise<Buffer> => Buffer.from("");
