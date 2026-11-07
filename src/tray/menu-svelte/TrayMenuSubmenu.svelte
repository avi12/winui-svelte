<script lang="ts">
  import { menuNode, submenuSpec } from "./menu-node.ts";
  import type { TrayMenuSubmenuProps } from "./menu-props.ts";

  // A line that opens the lines written inside it.
  const props: TrayMenuSubmenuProps = $props();
</script>

<inert-menu-submenu {@attach menuNode(() => submenuSpec(props))}>
  {@render props.children()}
</inert-menu-submenu>
