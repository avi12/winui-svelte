<script lang="ts">
  import type { FakeTextBlock, FakeToggle } from "./fake-controls.ts";
  import Forwarded from "./Forwarded.fixture.svelte";
  // A label and the toggle it names, for element-ref.test.ts: the label is a
  // component, so its ref reaches it through a forwarded attachment, and the
  // toggle points at it the way automationLabeledBy does.
  import { control } from "#src/renderer/host/control.js";
  import { elementRef } from "#src/renderer/host/element-ref.svelte.js";

  interface Props {
    isLabelShown: boolean;
  }

  const props: Props = $props();
  const label = elementRef<FakeTextBlock>();
</script>

<fake-panel>
  {#if props.isLabelShown}
    <Forwarded {@attach label.attach}>Start with Windows</Forwarded>
  {/if}
  <fake-toggle
    {@attach control<FakeToggle>(toggle => {
      $effect(() => {
        toggle.labeledBy = label.current ?? null;
      });
    })}
  ></fake-toggle>
</fake-panel>
