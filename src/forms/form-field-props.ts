// The FormField component's props, apart from FormField.d.svelte.ts for the
// reason Form's are.
import type { StackPanelComponentProps } from "#src/components/generated/StackPanel.d.svelte.js";
import type { Snippet } from "svelte";

/** The props of `FormField`: its panel's, and the label, hint and error around the control. */
export interface FormFieldProps extends Omit<StackPanelComponentProps, "children"> {
  /** The control, with its `@attach` field. */
  children?: Snippet;
  /** The label above the control. */
  label?: string | undefined;
  /** A hint under the control, shown while there is no error. */
  description?: string | undefined;
  /** The name of the field whose error this shows, once the user has left it or tried to submit. */
  field?: string | undefined;
  /** An error of the app's own, shown instead of the field's. */
  error?: string | undefined;
  /** Whether the label is marked as required with an asterisk. */
  isRequired?: boolean | undefined;
}

/**
 * The props a FormField leaves to its panel: all but its own.
 *
 * @param props - The FormField props.
 * @returns The panel props.
 */
export function panelProps(props: FormFieldProps) {
  const { children, label, description, field, error, isRequired, ...panel } = props;
  return panel;
}
