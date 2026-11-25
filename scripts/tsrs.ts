import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

/** The compiler every script runs: `tsrs`, started with Node, as `tsc` would be. */
export const TSRS = path.join(path.dirname(require.resolve("tsrs/package.json")), "bin", "tsrs");
