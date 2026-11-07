import { isElementNode } from "./collect.ts";
import type { ElementNode } from "#src/renderer/tree/dom.js";
import type { MenuProfile } from "#src/tray/menu/types.js";
import { getContext, setContext } from "svelte";

const SOURCE_KEY = Symbol("tray-menu-source");

interface HeldMarkup {
  readonly root: ElementNode<unknown>;
  readonly profile: () => MenuProfile | undefined;
}

/** The `TrayMenu` markup a `TrayIcon` holds: its element, and the profile written on it. */
export interface MenuMarkup {
  readonly root: ElementNode<unknown>;
  readonly profile: MenuProfile | undefined;
}

/** Where a `TrayMenu` tells its `TrayIcon` that it exists. */
export interface MenuSource {
  /** The markup now, or null while there is none. */
  current(): MenuMarkup | null;

  /** Records a `TrayMenu`; returns what forgets it. */
  attach(options: {
    readonly node: object;
    readonly profile: () => MenuProfile | undefined;
  }): () => void;
}

/**
 * Makes a source for one `TrayIcon`.
 *
 * @returns The source.
 */
export function createMenuSource() {
  let held: HeldMarkup | null = null;
  const source: MenuSource = {
    current() {
      return held === null ? null : {
        root: held.root,
        profile: held.profile()
      };
    },
    attach({ node, profile }) {
      const isElement = isElementNode(node);
      if (!isElement) {
        return () => {};
      }

      const own: HeldMarkup = {
        root: node,
        profile
      };
      held = own;
      return () => {
        const isOwn = held === own;
        if (isOwn) {
          held = null;
        }
      };
    }
  };
  return source;
}

/**
 * Makes `source` the one the `TrayMenu` components below this component find.
 *
 * @param source - The source of the `TrayIcon` that calls this.
 */
export function provideMenuSource(source: MenuSource) {
  setContext(SOURCE_KEY, source);
}

/**
 * The source of the nearest `TrayIcon` above this component.
 *
 * @returns The source, or undefined outside a `TrayIcon`.
 */
export function useMenuSource() {
  return getContext<MenuSource | undefined>(SOURCE_KEY);
}
