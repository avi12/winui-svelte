import type { FormFieldProps } from "./form-field-props.ts";
import type { Component } from "svelte";

export type { FormFieldProps };

declare const FormField: Component<FormFieldProps, Record<string, never>, "">;
export default FormField;
