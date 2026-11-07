import type { StandaloneTrayOptions } from "./standalone-tray.ts";
import type { TrayExtra } from "#src/tray/tray-extras.js";

/**
 * What `entrypoints/tray.ts` default-exports: the options of
 * `createStandaloneTray` with the three the build reads without running the
 * file (`icon`, `tooltip`, `guid`) and the gesture that opens the app.
 */
export type TrayEntrypoint<
  ItemId extends string = string,
  Extras extends readonly TrayExtra[] = readonly []
> = StandaloneTrayOptions<ItemId, Extras> & {
  /** The keeps-the-slot GUID; required, and it also names the tray process so it runs once. */
  readonly guid: string;

  /** Called on a left click when `onclick` is not given: where "open the app" goes. */
  readonly onactivate?: (() => void) | undefined;
};

/**
 * Declares the tray of an app: the default export of `entrypoints/tray.ts`.
 * It returns its argument, so the types do the work: ids stay a literal union
 * (a `profile` that names an id the menu lacks is an error) and `profile`
 * is accepted only with `resolve: resolveMenu`. The build reads `icon`,
 * `tooltip` and `guid` from the literals without running the file, and starts
 * the tray from a bundle of its own; the app never imports it.
 *
 * @param options - The tray.
 * @returns The same options.
 */
export function defineTray<
  const ItemId extends string,
  const Extras extends readonly TrayExtra[] = readonly []
>(options: TrayEntrypoint<ItemId, Extras>) {
  return options;
}
