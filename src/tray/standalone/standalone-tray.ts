import { createNativeMenu } from "./native.ts";
import type { NativeChoice, NativeMenu } from "./native.ts";
import { removeTrayIconsAtExit } from "#src/tray/exit-hook.js";
import { resolveLite } from "#src/tray/menu/resolve-lite.js";
import type { MenuResolver } from "#src/tray/menu/resolve-lite.js";
import type { MenuItem, MenuProfile } from "#src/tray/menu/types.js";
import { createTrayNative } from "#src/tray/native.js";
import type { TrayNative } from "#src/tray/native.js";
import { createTrayCore } from "#src/tray/tray-core.js";
import type { TrayIconOptions, TrayScheduler } from "#src/tray/tray-core.js";
import type { BalloonsExtra, ImageOf, TrayExtra, TrayHandle } from "#src/tray/tray-extras.js";

/** The menu of `createStandaloneTray`; `ItemId` is the union of the ids of `menu`. */
interface StandaloneMenuOptions<ItemId extends string, Extras extends readonly TrayExtra[]>
  extends Omit<TrayIconOptions, "icon" | "oncontextmenu"> {
  /** A path to an `.ico`; a `{ forLightTaskbar, forDarkTaskbar }` pair only with the `themedIcon` extra in `extras`. */
  readonly icon: ImageOf<Extras>;

  /**
   * The optional parts of the icon, each one import: `balloons` adds `notify`, `bounds` adds `bounds`,
   * `themedIcon` lets `icon` follow the taskbar theme. None of their code is in the bundle unless passed.
   */
  readonly extras?: Extras;

  /**
   * The menu a right click opens, in the model of `winui-svelte/tray/menu`: commands, checks, radios,
   * submenus to any depth, separators and headers. A separator needs an `id` like every line. On this
   * renderer a submenu's own `onselect` and `autoExpand` do nothing (Windows opens a submenu row and
   * reports no pick) and an `icon` is not drawn. None means a right click does nothing.
   */
  readonly menu?: ReadonlyArray<MenuItem<ItemId>> | undefined;

}

/** Levels, a user profile and ordering: what `resolve: resolveMenu` adds to the default. */
interface StandaloneProfileOptions<ItemId extends string = string> {
  /** The resolver that applies levels and a profile: `resolveMenu` of `winui-svelte/tray/standalone`. */
  readonly resolve: MenuResolver<ItemId>;

  /**
   * What the user chose to show, or a function that gives it each time the menu opens (read from a
   * file with `loadProfile`); every id must be one of `menu`'s. Everything at the `simple` level when left out.
   */
  readonly profile?: MenuProfile<NoInfer<ItemId>> | (() => MenuProfile<NoInfer<ItemId>>) | undefined;
}

/** The default: every item is shown, in declared order, and a `profile` is a type error. */
interface StandaloneLiteOptions {
  readonly resolve?: undefined;
  readonly profile?: undefined;
}

/**
 * What `createStandaloneTray` takes beyond the icon's own options. With no `resolve` the menu is drawn
 * by the lite resolver, which ignores levels and profiles and so leaves them out of the bundle; pass
 * `resolve: resolveMenu` (and then `profile`) to use them.
 */
export type StandaloneTrayOptions<
  ItemId extends string = string,
  Extras extends readonly TrayExtra[] = readonly []
> = StandaloneMenuOptions<ItemId, Extras> & (StandaloneLiteOptions | StandaloneProfileOptions<ItemId>);

function isBalloons(extra: TrayExtra): extra is BalloonsExtra {
  return extra.kind === "balloons";
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
export function createStandaloneTray<
  const ItemId extends string,
  const Extras extends readonly TrayExtra[] = readonly []
>(options: StandaloneTrayOptions<ItemId, Extras> & StandaloneTraySeams) {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- no extras is the empty tuple, Extras' default
  const extras = (options.extras ?? []) as unknown as Extras;
  const native = options.native ?? createTrayNative({ writeBalloon: extras.find(isBalloons)?.writeBalloon });
  const defer = options.defer ?? setImmediate;
  const items = options.menu ?? [];
  let menu = options.nativeMenu;

  function resolved() {
    const { profile } = options;
    const chosen = typeof profile === "function" ? profile() : profile;
    return (options.resolve ?? resolveLite)({
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
  const handle: TrayHandle<Extras> = createTrayCore({
    ...options,
    extras,
    native,
    schedule: options.schedule ?? scheduleWithNode,
    now: Date.now,
    oncontextmenu: hasMenu ? ({ x, y }) => showMenu({
      x,
      y
    }) : undefined
  });
  return handle;
}
