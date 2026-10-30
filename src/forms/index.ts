// The form submission: a `Form` the controls inside join by name, HTML's
// constraint validation, zod schemas, and the FormData they collect into.

export { default as Form } from "./Form.svelte";
export type { FormComponent, FormComponentProps } from "./Form.d.svelte.ts";
export { default as FormField } from "./FormField.svelte";
export type { FormFieldProps } from "./FormField.d.svelte.ts";
export { ButtonKind } from "./form-controller.svelte.ts";
export type {
  FieldBinding,
  FieldState,
  FormHandle,
  FormSubmission,
  FormSubmitEvent,
  InvalidField
} from "./form-controller.svelte.ts";
export { FormValues } from "./form-values.ts";
export type { FormObject } from "./form-values.ts";
export {
  checkField,
  colorField,
  dateField,
  formButton,
  numberField,
  passwordField,
  ratingField,
  selectField,
  sliderField,
  switchField,
  textField,
  timeField
} from "./native-fields.ts";
export type { FieldOptions } from "./native-fields.ts";
export { DEFAULT_MESSAGES, InputType, ValidityFlag, validityOf } from "./validity.ts";
export type { Constraints, FieldValue, ValidityResult, ValidityState } from "./validity.ts";
