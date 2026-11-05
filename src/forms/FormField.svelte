<script lang="ts">
  import { formOf } from "./form-controller.svelte.ts";
  import { panelProps } from "./form-field-props.ts";
  import type { FormFieldProps } from "./form-field-props.ts";
  import { liveRegion } from "#src/accessibility/live-region.js";
  import StackPanel from "#src/components/generated/StackPanel.svelte";
  import TextBlock from "#src/components/generated/TextBlock.svelte";

  // A label, the control and, below it, a hint or the error: the error is
  // read from the field named by `field` and announced to a screen reader.
  const ERROR_COLOR = "#c42b1c";
  const HINT_OPACITY = 0.7;
  const FIELD_SPACING = 4;
  const props: FormFieldProps = $props();
  const form = formOf();

  function errorText() {
    const hasOwnError = props.error !== undefined;
    if (hasOwnError) {
      return props.error;
    }

    const field = props.field === undefined ? undefined : form?.field(props.field);
    return field?.isUserInvalid === true ? field.message : "";
  }
</script>

<StackPanel spacing={FIELD_SPACING} {...panelProps(props)}>
  {#if props.label}
    {#if props.isRequired}
      <TextBlock>{props.label} *</TextBlock>
    {:else}
      <TextBlock>{props.label}</TextBlock>
    {/if}
  {/if}
  {@render props.children?.()}
  {#if errorText()}
    <TextBlock {@attach liveRegion()} foreground={ERROR_COLOR}>{errorText()}</TextBlock>
  {:else if props.description}
    <TextBlock opacity={HINT_OPACITY}>{props.description}</TextBlock>
  {/if}
</StackPanel>
