<script lang="ts">
  import { headerSpec, menuNode } from "./menu-node.ts";
  import type { TrayMenuHeaderProps } from "./menu-props.ts";

  // A caption for the items under it.
  const props: TrayMenuHeaderProps = $props();
</script>

<inert-menu-header {@attach menuNode(() => headerSpec(props))}></inert-menu-header>
