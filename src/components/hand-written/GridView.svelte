<script generics="Item" lang="ts">
  import { attachItems } from "./items/items-host.svelte.ts";
  import type { ItemsComponentProps } from "./items/items-props.ts";
  import { GridView } from "#src/components/generated/bindings.js";
  import { connectGridView } from "#src/components/generated/controls/GridView.svelte.js";
  import { attachmentsOf, control, registerControls } from "#src/components/runtime.js";
  import { untrack } from "svelte";

  // Written by hand (scripts/codegen/tables.ts: handWrittenComponents): the
  // generated GridView has no items, only children.
  let {
    selectedIndex = $bindable(),
    selectedItem = $bindable(),
    selectedValue = $bindable(),
    handle = $bindable(),
    class: className,
    style,
    ...rest
  }: ItemsComponentProps<Item> = $props();
  const bound = {
    get selectedIndex() {
      return selectedIndex;
    },
    set selectedIndex(value) {
      selectedIndex = value;
    },
    get selectedItem() {
      return selectedItem;
    },
    set selectedItem(value) {
      selectedItem = value;
    },
    get selectedValue() {
      return selectedValue;
    },
    set selectedValue(value) {
      selectedValue = value;
    }
  };
  registerControls({ "grid-view": GridView });

  function connect(native: GridView) {
    const disconnectProperties = connectGridView(native, rest, bound);
    const items = attachItems({
      view: native,
      props: rest
    });
    handle = items.handle;
    return () => {
      items.dispose();
      disconnectProperties();
    };
  }
</script>

<grid-view
  {...attachmentsOf(rest)}
  {style}
  class={className}
  {@attach control((native: GridView) => untrack(() => connect(native)))}
></grid-view>
