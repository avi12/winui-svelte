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
    onClose: () => void;
  } = $props();
  let handle: WindowHandle | undefined = $state();

  $effect(() => {
    const opened = handle;
    const isOpen = opened !== undefined;
    if (!isOpen) {
      return;
    }

    opened.presenter.setBorderAndTitleBar(false, false);
    opened.appWindow.isShownInSwitchers = false;

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
  onActiveChanged={isActive => {
    if (!isActive) {
      props.onClose();
    }
  }}
  onClosed={props.onClose}
  placement={props.placement}
  bind:handle
>
  {@render props.menu({ close: props.onClose })}
</Window>
