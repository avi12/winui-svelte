<script lang="ts">
  import { itemSpec, menuNode } from "./menu-node.ts";
  import type { TrayMenuItemProps } from "./menu-props.ts";

  // A command, a check or a radio line of a tray menu. It draws nothing itself:
  // the tray reads it when the menu opens.
  const props: TrayMenuItemProps = $props();
</script>

<inert-menu-item {@attach menuNode(() => itemSpec(props))}></inert-menu-item>
