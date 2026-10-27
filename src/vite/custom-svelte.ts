import { compile } from "svelte/compiler";
import type { CompileOptions } from "svelte/compiler";

// winui-svelte draws through Svelte's custom-renderer option, which stock
// Svelte does not have yet (sveltejs/svelte#18042). A peer range cannot name a
// pkg.pr.new build, so the Vite plugin asks the installed Svelte itself and
// says what to install when it is the wrong one.

export const customSvelteSource = "https://pkg.pr.new/svelte@18042";
const probeRenderer = "winui-svelte/probe-renderer";

// The part of Svelte's compile() the check uses, so a test can stand in for it.
export type CompileComponent = (source: string, options: CompileOptions) => {
  js: { code: string };
};

// Whether `compileComponent` honours experimental.customRenderer: a component
// compiled with it imports the renderer module it names.
export function isCustomRendererSvelte(compileComponent: CompileComponent = compile): boolean {
  try {
    const output = compileComponent("<div></div>", {
      generate: "client",
      experimental: {
        customRenderer: probeRenderer
      }
    });
    return output.js.code.includes(probeRenderer);
  } catch {
    return false;
  }
}

function customSvelteMessage(): string {
  return [
    "winui-svelte needs the Svelte build with the custom-renderer option (sveltejs/svelte#18042),",
    "and the Svelte installed here does not have it.",
    `Install it with: pnpm add -D svelte@${customSvelteSource}`,
    "If another package pulls in its own Svelte, pin this one with pnpm's overrides:",
    `  "pnpm": { "overrides": { "svelte": "${customSvelteSource}" } }`
  ].join("\n");
}

export function assertCustomRendererSvelte(compileComponent: CompileComponent = compile): void {
  if (!isCustomRendererSvelte(compileComponent)) {
    throw new Error(customSvelteMessage());
  }
}
