<script lang="ts">
  import type { TrayMenuProgressProps } from "./menu-props.ts";
  import TrayMenuItem from "./TrayMenuItem.svelte";
  import { progressText } from "#src/progress/progress-text.js";
  import { scopedSource } from "#src/progress/scoped-source.js";

  // A line of the tray menu that reads "setup.exe - 45%" or "3 operations - 12%"
  // and is left out while nothing runs. Picking it runs onselect, if any.
  const props: TrayMenuProgressProps = $props();
  const item = $derived.by(() => {
    const { of, group, ...others } = props;
    return others;
  });
  const scoped = $derived(
    scopedSource({
      of: props.of,
      group: props.group
    })
  );

  $effect(() => () => scoped.dispose());
</script>

<TrayMenuItem
  {...item}
  isVisible={() => scoped.source.snapshot.count > 0 || scoped.source.snapshot.showError}
  label={() => progressText(scoped.source.snapshot)}
/>
