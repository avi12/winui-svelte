import { defaultProgressRegistry } from "./progress-registry.ts";
import type { ProgressRegistry } from "./progress-registry.ts";
import type { ProgressSource } from "./progress-source.ts";

/**
 * The registry a component lists: `of` when given, else the operations of
 * `group`, else every running operation.
 *
 * @param options - The `of` and `group` props.
 * @returns The registry, and what to call when the component goes away.
 */
export function scopedRegistry({ of, group }: {
  of: ProgressRegistry | undefined;
  group: string | undefined;
}) {
  const registry = of ?? defaultProgressRegistry();
  const isScoped = group !== undefined;
  const scope = isScoped ? registry.where(group) : undefined;
  return {
    registry: scope ?? registry,
    dispose() {
      scope?.dispose();
    }
  };
}

/**
 * The source a component shows: `of` when given (one operation or a
 * registry), else the operations of `group`, else every running operation.
 *
 * @param options - The `of` and `group` props.
 * @returns The source, and what to call when the component goes away.
 */
export function scopedSource({ of, group }: {
  of: ProgressSource | undefined;
  group: string | undefined;
}) {
  const isGiven = of !== undefined;
  const scoped = scopedRegistry({
    of: undefined,
    group
  });
  if (isGiven) {
    return {
      source: of,
      dispose() {
        scoped.dispose();
      }
    };
  }

  return {
    source: scoped.registry,
    dispose: scoped.dispose
  };
}
