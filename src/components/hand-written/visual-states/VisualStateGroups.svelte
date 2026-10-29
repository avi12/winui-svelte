<script lang="ts">
  import { StateGroupList } from "./state-group-list.ts";
  import { bindStateGroups } from "./state-group-owner.ts";
  import { placedControl, registerControls } from "#src/components/runtime.js";
  import type { Snippet } from "svelte";

  // The visual state groups of the element this sits in: put it among the
  // children of a panel (a Grid is the root of a XAML control template) and
  // fill it with VisualStateGroup components. It is no element, so the panel
  // lays out its siblings only.
  const { children }: { children?: Snippet } = $props();
  registerControls({ "state-group-list": StateGroupList });
</script>

<state-group-list {@attach placedControl(bindStateGroups)}>
  {@render children?.()}
</state-group-list>
