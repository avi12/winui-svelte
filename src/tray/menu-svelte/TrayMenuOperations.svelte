<script lang="ts">
  import type { TrayMenuOperationsProps } from "./menu-props.ts";
  import { operationMenuId } from "./operation-ids.ts";
  import TrayMenuItem from "./TrayMenuItem.svelte";
  import TrayMenuSubmenu from "./TrayMenuSubmenu.svelte";
  import { progressText } from "#src/progress/progress-text.js";
  import { scopedRegistry } from "#src/progress/scoped-source.js";

  // A submenu with a line per running operation; picking a line cancels it.
  const props: TrayMenuOperationsProps = $props();
  const submenu = $derived.by(() => {
    const { of, group, ...others } = props;
    return others;
  });
  const scoped = $derived(
    scopedRegistry({
      of: props.of,
      group: props.group
    })
  );

  $effect(() => () => scoped.dispose());
</script>

<TrayMenuSubmenu {...submenu}>
  {#each scoped.registry.operations as operation (operation)}
    <TrayMenuItem
      id={operationMenuId(operation)}
      label={() => progressText(operation.snapshot)}
      onselect={() => operation.cancel()}
    />
  {/each}
</TrayMenuSubmenu>
