import { createNativeMenu } from "./native.ts";
import type { NativeChoice, NativeMenu } from "./native.ts";
import { removeTrayIconsAtExit } from "#src/tray/exit-hook.js";
import { resolveMenu } from "#src/tray/menu/resolve.js";
import type { MenuItem, MenuProfile } from "#src/tray/menu/types.js";
import { createTrayNative } from "#src/tray/native.js";
import type { TrayNative } from "#src/tray/native.js";
import { createTrayIconWith } from "#src/tray/tray-core.js";
import type { TrayIconOptions, TrayScheduler } from "#src/tray/tray-core.js";

/** What `createStandaloneTray` takes beyond the icon's own options; `ItemId` is the union of the ids of `menu`. */
export interface StandaloneTrayOptions<ItemId extends string = string> extends Omit<TrayIconOptions, "oncontextmenu"> {
  /**
   * The menu a right click opens, in the model of `winui-svelte/tray/menu`: commands, checks, radios,
   * submenus to any depth, separators and headers. A separator needs an `id` like every line. On this
   * renderer a submenu's own `onselect` and `autoExpand` do nothing (Windows opens a submenu row and
   * reports no pick) and an `icon` is not drawn. None means a right click does nothing.
   */
  readonly menu?: ReadonlyArray<MenuItem<ItemId>> | undefined;

  /**
   * What the user chose to show, or a function that gives it each time the menu opens (read from a
   * file with `loadProfile`); every id must be one of `menu`'s. Everything at the `simple` level when left out.
   */
  readonly profile?: MenuProfile<NoInfer<ItemId>> | (() => MenuProfile<NoInfer<ItemId>>) | undefined;
}

/** What `createStandaloneTray` takes beyond the options: a test's stand-ins. */
export interface StandaloneTraySeams {
  /** The Win32 calls of the icon; the real ones by default. */
  readonly native?: TrayNative;

  /** The popup menu; Windows' own by default. */
  readonly nativeMenu?: NativeMenu;

  /** The timer that polls the pointer; Node's `setInterval` by default. */
  readonly schedule?: TrayScheduler;

  /** Runs a function on a later turn, once the menu is gone; Node's `setImmediate` by default. */
  readonly defer?: (run: () => void) => void;
}

function scheduleWithNode({ milliseconds, onTick }: Parameters<TrayScheduler>[0]) {
  const timer = setInterval(onTick, milliseconds);
  return () => clearInterval(timer);
}

/**
 * A notification-area icon and its menu in a process with no window, no app
 * and no WinUI: the process can be plain Node, kept alive by the icon, and
 * starts or signals the full app from a click (see `activateOrLaunch` in
 * `winui-svelte/app`). The menu is Windows' own popup menu, made on a right
 * click and gone when it closes, so an idle tray holds nothing for it. Call
 * it from the thread that keeps running; the icon is removed on `remove`
 * and at process exit.
 */
export function createStandaloneTray<const ItemId extends string>(
  options: StandaloneTrayOptions<ItemId> & StandaloneTraySeams
) {
  const native = options.native ?? createTrayNative();
  const defer = options.defer ?? setImmediate;
  const items = options.menu ?? [];
  let menu = options.nativeMenu;

  function resolved() {
    const { profile } = options;
    const chosen = typeof profile === "function" ? profile() : profile;
    return resolveMenu({
      items,
      ...chosen ? { profile: chosen } : {}
    });
  }

  function showMenu(point: {
    readonly x: number;
    readonly y: number;
  }) {
    menu ??= createNativeMenu();
    const owner = native.createOwnerWindow();
    let choice: NativeChoice | undefined;
    try {
      native.focusWindow(owner);
      do {
        choice = menu.choose({
          owner,
          point,
          items: resolved()
        });

        if (choice?.staysOpen) {
          choice.select();
        }
      } while (choice?.staysOpen);
    } finally {
      native.destroyWindow(owner);
    }

    if (choice?.closeThenRun) {
      defer(choice.select);
      return;
    }

    choice?.select();
  }

  const hasMenu = items.length > 0;
  removeTrayIconsAtExit();
  return createTrayIconWith({
    ...options,
    native,
    schedule: options.schedule ?? scheduleWithNode,
    now: Date.now,
    oncontextmenu: hasMenu ? ({ x, y }) => showMenu({
      x,
      y
    }) : undefined
  });
}
