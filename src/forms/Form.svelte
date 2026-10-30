<script lang="ts">
  import { FormController, provideForm } from "./form-controller.svelte.ts";
  import type { FormComponentProps } from "./form-props.ts";
  import StackPanel from "#src/components/generated/StackPanel.svelte";
  import type { z } from "zod";

  // A layout panel that is a form: the fields and buttons put inside it join
  // it, and it submits, resets and validates them.
  let {
    children,
    handle = $bindable(),
    schema,
    noValidate: isNoValidate,
    onsubmit,
    action,
    oninvalid,
    onreset,
    oncancel,
    onerror,
    ...rest
  }: FormComponentProps<z.ZodType<unknown>> = $props();

  function rethrowLater(error: unknown) {
    queueMicrotask(() => {
      throw error;
    });
  }

  const controller = new FormController({
    get schema() {
      return schema;
    },
    get isNoValidate() {
      return isNoValidate === true;
    },
    onSubmit: submission => onsubmit?.(submission),
    action: submission => action?.(submission),
    onInvalid: fields => oninvalid?.(fields),
    onReset: () => onreset?.(),
    onCancel: () => oncancel?.(),
    onError: error => (onerror ?? rethrowLater)(error)
  });
  provideForm(controller);
  handle = controller;
</script>

<StackPanel {...rest}>
  {@render children?.()}
</StackPanel>
