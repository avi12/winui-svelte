import type { AttachedModules } from "./generated/attached/owners.ts";
import { attachedOwners } from "./generated/attached/owners.ts";
import { rememberOwner } from "./runtime.svelte.ts";

/** The attached properties' owners a component can load: `Canvas`, `Grid` and so on. */
export type AttachedOwnerName = keyof AttachedModules;

/**
 * Loads the modules the attached properties of these owners are written
 * through. The compiler awaits it at the top of a component whose markup
 * names such a property (`canvasLeft`, `gridRow`), so the modules are loaded
 * before the component makes its first control; the property is then written
 * with the control, before WinUI lays it out.
 *
 * @param names - The owners to load.
 * @returns A promise that settles once all of them have loaded.
 */
export async function preloadAttachedOwners(names: readonly AttachedOwnerName[]) {
  await Promise.all(
    names.map(async name => rememberOwner({
      name,
      module: await attachedOwners[name]()
    }))
  );
}
