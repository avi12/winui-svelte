<script lang="ts">
  import { createTrayNative } from "./native.ts";
  import { createTrayIcon } from "./tray-icon.ts";
  import { createTrayMenu } from "./tray-menu.ts";
  import type { MenuPlacement } from "./tray-menu.ts";
  import type { TrayIconComponentProps } from "./TrayIcon.d.svelte.ts";
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
    shouldActivateMenu = true,
    onclick,
    ondoubleclick,
    oncontextmenu,
    onmiddleclick
  }: TrayIconComponentProps = $props();
  const native = createTrayNative();
  let placement = $state.raw<MenuPlacement | null>(null);
  const trayMenu = createTrayMenu({
    native,
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
        const hasMenu = menu !== undefined;
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

{#if menu !== undefined && placement !== null}
  {#key placement}
    <TrayMenuWindow
      activation={shouldActivateMenu ? "focus" : "background"}
      focus={hwnd => native.focusWindow(hwnd)}
      {menu}
      onClose={() => trayMenu.close()}
      {placement}
    />
  {/key}
{/if}
