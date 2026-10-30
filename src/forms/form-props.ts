// The Form component's props. Kept out of Form.d.svelte.ts so the component
// can import them: the Svelte language server reads `./Form.d.svelte.ts`
// imported from Form.svelte as Form.svelte itself.
import type { FormHandle, FormSubmission, InvalidField } from "./form-controller.svelte.ts";
import type { FormObject } from "./form-values.ts";
import type { StackPanelComponentProps } from "#src/components/generated/StackPanel.d.svelte.js";
import type { Snippet } from "svelte";
import type { z } from "zod";

/** The props of `Form`: its panel's, and the form's own. `Schema` is the zod schema that types the submitted data. */
export interface FormComponentProps<Schema extends z.ZodType = z.ZodType<FormObject>>
  extends Omit<StackPanelComponentProps, "children"> {
  children?: Snippet;
  /** Validates the collected values; its output is the submitted `data`, and its issues become field errors by path. */
  schema?: Schema | undefined;
  /** Skips validation on submit, as HTML's `novalidate` does; the fields still know their validity. */
  noValidate?: boolean | undefined;
  /** Called with the values when the form is valid and submitted. */
  onSubmit?: ((submission: FormSubmission<z.output<Schema>>) => void | Promise<void>) | undefined;
  /** Runs after `onSubmit`; while its promise is pending the controls are disabled and `handle.isPending` is true. */
  action?: ((submission: FormSubmission<z.output<Schema>>) => void | Promise<void>) | undefined;
  /** Called when a submit was stopped by invalid fields, with them. */
  onInvalid?: ((fields: readonly InvalidField[]) => void) | undefined;
  /** Called after the fields were put back. */
  onReset?: (() => void) | undefined;
  /** Called when Escape is pressed in a field. */
  onCancel?: (() => void) | undefined;
  /** Called with what `onSubmit` or `action` threw; without it the error is rethrown where nothing catches it. */
  onError?: ((error: unknown) => void) | undefined;
  /** The form, for code that submits, resets and reads it (`bind:handle`). */
  handle?: FormHandle | undefined;
}
