<script lang="ts">
  import type { MenuPlacement, TrayMenuContext } from "./tray-menu.ts";
  import Window from "#src/components/hand-written/Window.svelte";
  import type { WindowHandle } from "#src/window/window-handle.js";
  import type { Snippet } from "svelte";

  // The one-pixel window a tray menu's flyout opens from: a flyout needs an
  // element in a live window, and a tray-only app has none. It has no border,
  // no title bar and no taskbar button, stays on top, and goes when the menu
  // closes or the user clicks away.
  const props: {
    placement: MenuPlacement;
    menu: Snippet<[TrayMenuContext]>;
    activation: "focus" | "background";
    focus: (hwnd: bigint) => void;
    onclose: () => void;
  } = $props();
  let handle: WindowHandle | undefined = $state();

  $effect(() => {
    const opened = handle;
    const isOpen = opened !== undefined;
    if (!isOpen) {
      return;
    }

    opened.presenter.setBorderAndTitleBar(false, false);
    // A desktop with no taskbar (the hidden one the window tests run on)
    // answers E_NOTIMPL: there is no button to hide
    try {
      opened.appWindow.isShownInSwitchers = false;
    } catch {
    // nothing to hide
    }

    const isFocusing = props.activation === "focus";
    if (isFocusing) {
      props.focus(opened.appWindow.id.value);
    }
  });
</script>

<Window
  activate={props.activation === "focus"}
  isAlwaysOnTop
  isCentered={false}
  isMaximizable={false}
  isMinimizable={false}
  isResizable={false}
  onactivechanged={isActive => {
    if (!isActive) {
      props.onclose();
    }
  }}
  onclosed={props.onclose}
  placement={props.placement}
  bind:handle
>
  {@render props.menu({ close: props.onclose })}
</Window>
