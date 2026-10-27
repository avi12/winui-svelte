<script lang="ts">
  import type { FakeToggle } from "./fake-controls.ts";
  // Components for host.test.ts: a toggle that takes its state through the
  // control attachment, a raw `on-content`, a conditional toggle and a hosted
  // control.
  import { control } from "#src/renderer/host/control.js";

  interface Props {
    isOn: boolean;
    label: string;
    isShown: boolean;
    log: (line: string) => void;
    hosted: object;
  }

  const props: Props = $props();
</script>

<fake-panel class="card">
  <fake-toggle
    {@attach control<FakeToggle>(toggle => {
      props.log("attached");
      $effect(() => {
        toggle.isOn = props.isOn;
      });
      return () => props.log("cleanup");
    })}
    on-content={() => props.label}
    ontoggled={() => props.log("toggled")}
  ></fake-toggle>
  <fake-toggle on-content={() => "Static"}></fake-toggle>
  {#if props.isShown}
    <fake-panel>
      <fake-toggle ontoggled={() => props.log("toggled")}></fake-toggle>
      <host element={props.hosted}></host>
    </fake-panel>
  {/if}
</fake-panel>
