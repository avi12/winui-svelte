<script generics="ItemId extends string" lang="ts">
  import { collectMenu } from "./menu-svelte/collect.ts";
  import { createMenuSource, provideMenuSource } from "./menu-svelte/menu-source.ts";
  import { resolveMenu } from "./menu/resolve.ts";
  import { createWorkAreaReader } from "./native.ts";
  import type { TrayIconComponentProps } from "./tray-icon-props.ts";
  import { createTrayIcon, createWindowedTrayNative } from "./tray-icon.ts";
  import { createTrayMenu } from "./tray-menu.ts";
  import type { MenuPlacement, TrayMenuContext } from "./tray-menu.ts";
  import TrayMenuFlyout from "./TrayMenuFlyout.svelte";
  import TrayMenuWindow from "./TrayMenuWindow.svelte";
  import { untrack } from "svelte";

  // A tray icon with no markup of its own: it exists while the component does.
  // Its menu's window exists only while the menu is open.
  let {
    handle = $bindable(),
    menuAt = $bindable(null),
    icon,
    tooltip,
    isVisible,
    guid,
    menu,
    profile,
    children,
    shouldActivateMenu = true,
    onclick,
    ondoubleclick,
    oncontextmenu,
    onmiddleclick
  }: TrayIconComponentProps<ItemId> = $props();
  const native = createWindowedTrayNative();
  const markup = createMenuSource();
  provideMenuSource(markup);
  let placement = $state.raw<MenuPlacement | null>(null);
  const trayMenu = createTrayMenu({
    native: createWorkAreaReader(),
    onChange(changed) {
      placement = changed;
      const isClosed = changed === null;
      if (isClosed) {
        menuAt = null;
      }
    }
  });

  $effect(() => {
    const created = untrack(() => createTrayIcon({
      native,
      icon,
      tooltip,
      isVisible,
      guid,
      onclick: event => onclick?.(event),
      ondoubleclick: event => ondoubleclick?.(event),
      oncontextmenu(event) {
        oncontextmenu?.(event);
        const hasMenu = menu !== undefined || markup.current() !== null;
        if (hasMenu) {
          menuAt = {
            x: event.x,
            y: event.y
          };
        }
      },
      onmiddleclick: event => onmiddleclick?.(event)
    }));
    handle = created;
    return () => {
      created.remove();
      handle = undefined;
    };
  });

  // The lines to draw, resolved now: the declared array with the profile of
  // the prop, or the markup's lines with the profile written on its TrayMenu.
  function resolveNow() {
    const declared = markup.current();
    if (Array.isArray(menu)) {
      return profile === undefined ? resolveMenu({ items: menu }) : resolveMenu({
        items: menu,
        profile
      });
    }

    const items = declared === null ? [] : collectMenu(declared.root);
    return declared?.profile === undefined ? resolveMenu({ items }) : resolveMenu({
      items,
      profile: declared.profile
    });
  }

  // What the menu's window shows, read when it opens: the snippet the app
  // wrote, the model drawn as a flyout, or nothing for an icon with no menu.
  function drawnMenu() {
    const isSnippet = typeof menu === "function";
    if (isSnippet) {
      return menu;
    }

    const hasModel = menu !== undefined || markup.current() !== null;
    return hasModel ? modelMenu : undefined;
  }

  $effect(() => {
    handle?.update({
      icon,
      tooltip,
      isVisible
    });
  });

  $effect(() => {
    const point = menuAt;
    untrack(() => {
      const isClosed = point === null || point === undefined;
      if (isClosed) {
        trayMenu.close();
        return;
      }

      trayMenu.show(point);
    });
  });
</script>

{#snippet modelMenu({ close }: TrayMenuContext)}
  <TrayMenuFlyout onclose={close} resolve={resolveNow} />
{/snippet}

{@render children?.()}

{#if placement !== null}
  {@const drawn = drawnMenu()}
  {#if drawn !== undefined}
    {#key placement}
      <TrayMenuWindow
        activation={shouldActivateMenu ? "focus" : "background"}
        focus={hwnd => native.focusWindow(hwnd)}
        menu={drawn}
        onclose={() => trayMenu.close()}
        {placement}
      />
    {/key}
  {/if}
{/if}
