<script lang="ts">
  // For host.test.ts: a flyout in a button's Flyout property, one among a
  // panel's children (which a panel leaves out), and the panel itself, each
  // telling the test where it is placed.
  import type { FakeFlyout, FakePanel } from "./fake-controls.ts";
  import { placedControl } from "#src/renderer/host/control.js";
  import type { PlacedControl } from "#src/renderer/host/control.js";

  interface Props {
    found: (name: string, placed: PlacedControl<object>) => void;
  }

  const props: Props = $props();
</script>

<fake-panel {@attach placedControl<FakePanel>(placed => props.found("panel", placed))}>
  <fake-button>
    <property name="flyout">
      <fake-flyout {@attach placedControl<FakeFlyout>(placed => props.found("inButton", placed))}></fake-flyout>
    </property>
  </fake-button>
  <fake-flyout {@attach placedControl<FakeFlyout>(placed => props.found("inPanel", placed))}></fake-flyout>
</fake-panel>
