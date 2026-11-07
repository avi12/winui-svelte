<script lang="ts">
  import { menuNode, separatorSpec } from "./menu-node.ts";
  import type { TrayMenuSeparatorProps } from "./menu-props.ts";

  // A line between groups of items.
  const props: TrayMenuSeparatorProps = $props();
</script>

<inert-menu-separator {@attach menuNode(() => separatorSpec(props))}></inert-menu-separator>
