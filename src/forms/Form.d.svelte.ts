import type { FormComponentProps } from "./form-props.ts";
import type { FormObject } from "./form-values.ts";
import type { ComponentConstructorOptions, ComponentInternals, SvelteComponent } from "svelte";
import type { z } from "zod";

export type { FormComponentProps };

/** The `Form` component, generic over the zod schema that types its submitted data. */
export interface FormComponent {
  new <Schema extends z.ZodType = z.ZodType<FormObject>>(
    options: ComponentConstructorOptions<FormComponentProps<Schema>>
  ): SvelteComponent<FormComponentProps<Schema>>;
  <Schema extends z.ZodType = z.ZodType<FormObject>>(
    internals: ComponentInternals,
    props: FormComponentProps<Schema>
  ): Record<string, never>;
}

declare const Form: FormComponent;
export default Form;
