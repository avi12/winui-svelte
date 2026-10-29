<script lang="ts">
  import { createTrayIcon } from "./tray-icon.ts";
  import type { TrayIconComponentProps } from "./TrayIcon.d.svelte.ts";
  import { untrack } from "svelte";

  // A tray icon with no markup of its own: it exists while the component does.
  let {
    handle = $bindable(),
    icon,
    tooltip,
    isVisible,
    guid,
    onclick,
    ondoubleclick,
    oncontextmenu,
    onmiddleclick
  }: TrayIconComponentProps = $props();

  $effect(() => {
    const created = untrack(() => createTrayIcon({
      icon,
      tooltip,
      isVisible,
      guid,
      onclick: event => onclick?.(event),
      ondoubleclick: event => ondoubleclick?.(event),
      oncontextmenu: event => oncontextmenu?.(event),
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
</script>
