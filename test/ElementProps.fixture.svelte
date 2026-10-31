<script lang="ts">
  // Never mounted: `pnpm check` (svelte-check, under exactOptionalPropertyTypes)
  // reads it. What a component takes that WinUI's metadata does not say: a
  // class as a string, an array or an object, and an attached property given
  // a reference that has no control yet.
  import type { UIElement } from "#src/components/generated/bindings.js";
  import { Button, TextBlock } from "#src/components/index.js";
  import { elementRef } from "#src/renderer/host/element-ref.svelte.js";

  const label = elementRef<UIElement>();
  const MAYBE_NAME: string | undefined = undefined;
  const IS_ACTIVE = false;
</script>

<TextBlock class="label" {@attach label.attach}>Name</TextBlock>
<Button class="plain" automationLabeledBy={label.current}>One</Button>
<Button class={["card", IS_ACTIVE && "active"]} automationName={MAYBE_NAME ?? "two"}>Two</Button>
<Button
  class={{
    card: true,
    active: IS_ACTIVE
  }}>Three</Button>
<Button class={[MAYBE_NAME, { active: IS_ACTIVE }]}>Four</Button>
