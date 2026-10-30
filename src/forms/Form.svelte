<script lang="ts">
  import { FormController, provideForm } from "./form-controller.svelte.ts";
  import type { FormComponentProps } from "./form-props.ts";
  import StackPanel from "#src/components/generated/StackPanel.svelte";

  // A layout panel that is a form: the fields and buttons put inside it join
  // it, and it submits, resets and validates them.
  let {
    children,
    handle = $bindable(),
    schema,
    noValidate: isNoValidate,
    onSubmit,
    action,
    onInvalid,
    onReset,
    onCancel,
    onError,
    ...rest
  }: FormComponentProps = $props();

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
    onSubmit: submission => onSubmit?.(submission),
    action: submission => action?.(submission),
    onInvalid: fields => onInvalid?.(fields),
    onReset: () => onReset?.(),
    onCancel: () => onCancel?.(),
    onError: error => (onError ?? rethrowLater)(error)
  });
  provideForm(controller);
  handle = controller;
</script>

<StackPanel {...rest}>
  {@render children?.()}
</StackPanel>
