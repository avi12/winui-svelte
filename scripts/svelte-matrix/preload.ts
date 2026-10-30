import { resolveSvelte } from "#src/vite/svelte-resolve.js";
import { registerHooks } from "node:module";

// Loaded with --import, before any test: the tests import the Svelte compiler
// through the package's own modules before they register their hooks, and
// the compatibility matrix needs that import to reach the copy under test too.
registerHooks({
  resolve: resolveSvelte
});
