import { createMenuTheme, MenuColorScheme } from "./menu-theme.ts";
import type { MenuTheme } from "./menu-theme.ts";
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
import type {
  BalloonsExtra,
  ImageOf,
  MenuIconCalls,
  MenuIconsExtra,
  TrayExtra,
  TrayHandle
} from "#src/tray/tray-extras.js";

/** The menu of `createStandaloneTray`; `ItemId` is the union of the ids of `menu`. */
interface StandaloneMenuOptions<ItemId extends string, Extras extends readonly TrayExtra[]>
  extends Omit<TrayIconOptions, "icon" | "oncontextmenu"> {
  /** A path to an `.ico`; a `{ forLightTaskbar, forDarkTaskbar }` pair only with the `themedIcon` extra in `extras`. */
  readonly icon: ImageOf<Extras>;

  /**
   * The optional parts of the icon, each one import: `balloons` adds `notify`, `bounds` adds `bounds`,
   * `themedIcon` lets `icon` follow the taskbar theme, `menuIcons` draws the icons of the menu's lines.
   * None of their code is in the bundle unless passed.
   */
  readonly extras?: Extras;

  /**
   * The menu a right click opens, in the model of `winui-svelte/tray/menu`: commands, checks, radios,
   * submenus to any depth, separators and headers. A separator needs an `id` like every line. On this
   * renderer a submenu's own `onselect` and `autoExpand` do nothing (Windows opens a submenu row and
   * reports no pick) and an `icon` is drawn only with the `menuIcons` extra in `extras`. None means a right
   * click does nothing. A function makes
   * the lines each time the menu opens, which is how a tray written as markup keeps its variables current.
   */
  readonly menu?: ReadonlyArray<MenuItem<ItemId>> | (() => ReadonlyArray<MenuItem<ItemId>>) | undefined;

  /**
   * The menu's color scheme, with the meaning of the CSS `color-scheme` property: `"light dark"` (the
   * default) follows the system's app theme, so the menu is dark when Windows is; `"light"` and `"dark"`
   * force one. It is the scheme of this tray's menu only: the system has one menu theme for the whole
   * process, so it is set right before each of this tray's menus opens, and two trays with different
   * schemes each get their own (only one menu is open at a time). The last one set stays until the next
   * menu opens, so another popup menu of the same process (a window's) follows whichever tray spoke last.
   */
  readonly colorScheme?: MenuColorScheme;
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

function isMenuIcons(extra: TrayExtra): extra is MenuIconsExtra {
  return extra.kind === "menuIcons";
}

// The menu runs a message loop of its own on the only thread there is, and ends only when the user
// picks a line or a click lands elsewhere; a click elsewhere is seen only when the owner is in front.
const FOCUS_ATTEMPTS = 3;

/** What `createStandaloneTray` takes beyond the options: a test's stand-ins. */
export interface StandaloneTraySeams {
  /** The Win32 calls of the icon; the real ones by default. */
  readonly native?: TrayNative;

  /** The popup menu; Windows' own by default. */
  readonly nativeMenu?: NativeMenu;

  /** The call that sets the process's menu theme; uxtheme's by default. */
  readonly menuTheme?: MenuTheme;

  /** The timer that polls the pointer; Node's `setInterval` by default. */
  readonly schedule?: TrayScheduler;

  /** Runs a function on a later turn, once the menu is gone; Node's `setImmediate` by default. */
  readonly defer?: (run: () => void) => void;
}

function isFocusedWithin({ native, owner }: {
  readonly native: TrayNative;
  readonly owner: bigint;
}) {
  for (let attempt = 0; attempt < FOCUS_ATTEMPTS; attempt++) {
    const isFocused = native.focusWindow(owner);
    if (isFocused) {
      return true;
    }
  }

  return false;
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
  const { menu: source } = options;
  let menu = options.nativeMenu;
  let theme = options.menuTheme;
  let icons: MenuIconCalls | undefined;

  function resolved() {
    const { profile } = options;
    const chosen = typeof profile === "function" ? profile() : profile;
    return (options.resolve ?? resolveLite)({
      items: (typeof source === "function" ? source() : source) ?? [],
      ...chosen ? { profile: chosen } : {}
    });
  }

  function showMenu(point: {
    readonly x: number;
    readonly y: number;
  }) {
    icons ??= extras.find(isMenuIcons)?.createCalls();
    menu ??= createNativeMenu({ icons });
    theme ??= createMenuTheme();
    const owner = native.createOwnerWindow();
    let choice: NativeChoice | undefined;
    try {
      const isFocused = isFocusedWithin({
        native,
        owner
      });
      if (!isFocused) {
        return;
      }

      do {
        const colorScheme = options.colorScheme ?? MenuColorScheme.SYSTEM;
        theme.apply(colorScheme);
        choice = menu.choose({
          owner,
          point,
          isDark: icons?.isDark(colorScheme) ?? false,
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

  removeTrayIconsAtExit();
  const handle: TrayHandle<Extras> = createTrayCore({
    ...options,
    extras,
    native,
    schedule: options.schedule ?? scheduleWithNode,
    now: Date.now,
    oncontextmenu: source ? ({ x, y }) => showMenu({
      x,
      y
    }) : undefined
  });
  return handle;
}
