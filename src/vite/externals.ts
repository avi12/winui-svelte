// The native module is loaded by Node, from the node_modules the build writes
// beside the bundle (runtime-kit.ts); its subpaths are imports too.
export const NATIVE_MODULE = /^@microsoft\/dynwinrt(?:\/|$)/u;

// The package's bindings (#winui/*, shipped in dist/bindings) declare
// `"sideEffects": false`, but a bundler takes
// an external module for one with side effects and keeps an empty import of
// every binding a barrel re-exports. Said here, an app bundles only the
// bindings of the controls it uses.
const bindingModule = /^#winui\/|dist[/]bindings/u;

/**
 * Rollup's `treeshake.moduleSideEffects` hook: a binding module is pure, and
 * everything else is kept as the bundler would.
 */
export function hasSideEffects(id: string, isExternal: boolean) {
  return !isExternal || !bindingModule.test(id);
}
