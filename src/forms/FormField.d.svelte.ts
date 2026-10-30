import type { FormFieldProps } from "./form-field-props.ts";
import type { Component } from "svelte";

export type { FormFieldProps };

declare const FormField: Component<FormFieldProps, Record<string, never>, "">;
// eslint-disable-next-line no-restricted-exports -- Svelte declares a component as the default export
export default FormField;
