import type { ResourceCatalogue } from "./resources.ts";
import { translateStyleSheet } from "#src/css/translate/translate.js";
import { readFileSync } from "node:fs";
import path from "node:path";

const SHARED_IMPORT = /^[ \t]*import\s+(["'])(\.{1,2}\/[^"'\n]+\.css)\1/gmu;

/** A stylesheet a component imports (`import "./theme.css"`), read from disk. */
export interface SharedStylesheet {
  file: string;
  css: string;
}

/**
 * The `.css` files a component imports for their side effect: their rules
 * apply to the whole window, as the sheets of the components do.
 */
export function sharedStylesheetsOf({ source, filename }: {
  source: string;
  filename: string;
}) {
  const folder = path.dirname(filename);
  return [...source.matchAll(SHARED_IMPORT)].flatMap(([, , specifier]) => {
    const file = path.resolve(folder, specifier ?? "");
    try {
      return [{
        file,
        css: readFileSync(file, "utf8")
      }];
    } catch {
      return [];
    }
  });
}

/**
 * The catalogue a component's `var()` reads: WinUI's resources plus the
 * custom properties its imported stylesheets declare.
 */
export function withSharedResources({ resources, shared }: {
  resources: ResourceCatalogue;
  shared: readonly SharedStylesheet[];
}) {
  const kinds = new Map(shared.flatMap(({ file, css }) => [...translateStyleSheet({
    file,
    css,
    resources
  }).declaredKinds]));
  return kinds.size === 0 ? resources : resources.extend(kinds);
}
