import { compile } from "svelte/compiler";
import type { CompileOptions } from "svelte/compiler";

/**
 * The Svelte build that has the custom-renderer option (sveltejs/svelte#18042),
 * which winui-svelte draws through and stock Svelte does not have yet. A peer
 * range cannot name a pkg.pr.new build, so the Vite plugin asks the installed
 * Svelte itself and says what to install when it is the wrong one.
 */
export const CUSTOM_SVELTE_SOURCE = "https://pkg.pr.new/svelte@18042";

const PROBE_RENDERER = "winui-svelte/probe-renderer";

/** The part of Svelte's `compile()` the check uses, so a test can stand in for it. */
export type CompileComponent = (source: string, options: CompileOptions) => {
  js: { code: string };
};

/**
 * Whether `compileComponent` honours `experimental.customRenderer`: a
 * component compiled with it imports the renderer module it names.
 */
export function isCustomRendererSvelte(compileComponent: CompileComponent = compile) {
  try {
    const output = compileComponent("<div></div>", {
      generate: "client",
      experimental: {
        customRenderer: PROBE_RENDERER
      }
    });
    return output.js.code.includes(PROBE_RENDERER);
  } catch {
    return false;
  }
}

function customSvelteMessage() {
  return [
    "winui-svelte needs the Svelte build with the custom-renderer option (sveltejs/svelte#18042),",
    "and the Svelte installed here does not have it.",
    `Install it with: pnpm add -D svelte@${CUSTOM_SVELTE_SOURCE}`,
    "If another package pulls in its own Svelte, pin this one with pnpm's overrides:",
    `  "pnpm": { "overrides": { "svelte": "${CUSTOM_SVELTE_SOURCE}" } }`
  ].join("\n");
}

/** Throws, naming what to install, unless `compileComponent` honours the custom-renderer option. */
export function assertCustomRendererSvelte(compileComponent: CompileComponent = compile) {
  if (!isCustomRendererSvelte(compileComponent)) {
    throw new Error(customSvelteMessage());
  }
}
