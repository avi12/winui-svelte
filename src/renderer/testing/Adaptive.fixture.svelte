<script lang="ts">
  // For element-readers.test.ts: one element with its size and theme read
  // through the runes, each reported to the test as it changes.
  import { elementSize } from "#src/renderer/host/element-size.svelte.js";
  import { elementTheme } from "#src/renderer/host/element-theme.svelte.js";

  interface Props {
    isShown: boolean;
    report: (line: string) => void;
  }

  const props: Props = $props();
  const size = elementSize();
  const theme = elementTheme();

  $effect(() => {
    props.report(`size ${size.width}x${size.height}`);
  });
  $effect(() => {
    props.report(`theme ${theme.current}`);
  });
</script>

<fake-panel>
  {#if props.isShown}
    <fake-element {@attach size.attach} {@attach theme.attach}></fake-element>
  {/if}
</fake-panel>
