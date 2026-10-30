import { FormValues } from "./form-values.ts";
import type { FormObject } from "./form-values.ts";
import { VALID_STATE, validityOf } from "./validity.ts";
import type { Constraints, FieldValue, ValidityFlag, ValidityState } from "./validity.ts";
import { getContext, setContext } from "svelte";
import { SvelteMap } from "svelte/reactivity";
import type { z } from "zod";

// The form's state: the fields that registered, what they hold, whether each
// is valid, and the submit flow. Plain objects stand for the controls (a
// FieldBinding), so the rules run in a test without WinUI; native-fields.ts
// makes the bindings from real controls.

type Listener = () => void;
type Unsubscribe = () => void;

/** What a form does with a control: read it, listen to it, restore it, show an error on it. */
export interface FieldBinding {
  readonly name: string;
  readonly constraints: Constraints;
  readonly messages: Partial<Record<ValidityFlag, string>>;
  /** A check box or switch is collected as this when checked, and left out when not (HTML's `value`). */
  readonly checkedValue: FieldValue | undefined;
  readonly isTextEntry: boolean;
  read(): FieldValue;
  subscribe(listener: Listener): Unsubscribe;
  /** Takes the control's value now and returns what puts it back. */
  capture(): Listener;
  focus(): boolean;
  isEnabled(): boolean;
  setEnabled(isEnabled: boolean): void;
  /** Shows the error on the control; an empty message clears it. */
  present(message: string): void;
}

/** What a button does when clicked: HTML's `type` of a button. */
export const ButtonKind = {
  SUBMIT: "submit",
  RESET: "reset",
  BUTTON: "button"
} as const;

/** A button type: one of the `ButtonKind` values. */
export type ButtonKind = (typeof ButtonKind)[keyof typeof ButtonKind];

/** What a form does with a button that belongs to it. */
export interface ButtonBinding {
  readonly kind: ButtonKind;
  isEnabled(): boolean;
  setEnabled(isEnabled: boolean): void;
}

/** The button that submitted the form, as the `event` of a submit says. */
export interface FormSubmitEvent {
  readonly submitter: ButtonBinding | null;
}

/** What a submit hands the app. */
export interface FormSubmission<Data> {
  /** The values: the schema's output when the form has a schema, else the entries as an object. */
  readonly data: Data;
  /** The entries, in field order, repeated names kept. */
  readonly formData: FormValues;
  readonly event: FormSubmitEvent;
  /** Aborted when the form is reset while the action runs. */
  readonly signal: AbortSignal;
}

/** A field that failed, as `oninvalid` lists them. */
export interface InvalidField {
  readonly name: string;
  readonly message: string;
  readonly validity: ValidityState;
}

/** What the component hands the controller, read afresh each time. */
export interface FormOptions {
  readonly schema: z.ZodType | undefined;
  readonly isNoValidate: boolean;
  onSubmit(submission: FormSubmission<unknown>): void | Promise<void>;
  action(submission: FormSubmission<unknown>): void | Promise<void>;
  onInvalid(fields: readonly InvalidField[]): void;
  onReset(): void;
  onCancel(): void;
  onError(error: unknown): void;
}

/** One field of the form: what it holds, whether it is valid, and the controls to ask about it. */
export class FieldState {
  readonly name: string;
  readonly binding: FieldBinding;
  readonly restore: Listener;
  /** The value now (reactive). */
  value = $state<FieldValue>(null);
  /** The HTML `ValidityState` of the value (reactive). */
  validity = $state.raw<ValidityState>(VALID_STATE);
  /** The message of the first failure, "" when valid (reactive). */
  message = $state("");
  /** Whether the user has left the field, or the form was reported (reactive). */
  isTouched = $state(false);
  /** Whether the value has changed since the form was made or reset (reactive). */
  isDirty = $state(false);
  customMessage = $state("");
  shown = "";
  private readonly form: FormController;

  constructor({ binding, form, restore }: {
    binding: FieldBinding;
    form: FormController;
    restore: Listener;
  }) {
    this.restore = restore;
    this.name = binding.name;
    this.binding = binding;
    this.form = form;
  }

  /** Whether the field is required (reactive-free: it is fixed when the field joins). */
  get isRequired() {
    return this.binding.constraints.required === true;
  }

  get isValid() {
    return this.validity.valid;
  }

  /**
   * HTML's `:user-invalid`: invalid, and the user has left the field or tried
   * to submit; the state an error is shown for (reactive).
   */
  get isUserInvalid() {
    const isAnswered = this.isTouched || this.form.isSubmitted;
    return isAnswered && !this.validity.valid;
  }

  /** Makes the field invalid with a message of the app's own, until set again with ""; as `setCustomValidity` does. */
  setCustomValidity(message: string) {
    this.customMessage = message;
    this.form.refresh();
  }

  /** Whether the field is valid; shows nothing. */
  checkValidity() {
    return this.validity.valid;
  }

  /** Whether the field is valid; when it is not, shows the error and moves focus to it. */
  reportValidity() {
    this.isTouched = true;
    this.form.refresh();

    if (!this.validity.valid) {
      this.binding.focus();
    }

    return this.validity.valid;
  }

  focus() {
    return this.binding.focus();
  }
}

/** What an app holds of a form: `bind:handle` on `Form`. */
export interface FormHandle {
  /** True while an async `action` runs (reactive). */
  readonly isPending: boolean;
  /** True once a submit was tried since the form was made or reset (reactive). */
  readonly isSubmitted: boolean;
  /** True when every field is valid (reactive). */
  readonly isValid: boolean;
  /** The fields that joined, in order (reactive). */
  readonly fields: readonly FieldState[];
  /** The field of a name, undefined when none joined (reactive). */
  field(name: string): FieldState | undefined;
  /** The entries the fields hold now. */
  values(): FormValues;
  /** Validates, and submits when valid; resolves to whether it did. Like HTML's `requestSubmit`. */
  requestSubmit(options?: {
    submitter?: ButtonBinding | null;
  }): Promise<boolean>;
  /** Submits without validating and without the invalid event. Like HTML's `submit`. */
  submit(): Promise<void>;
  /** Puts every field back as it was when the form was made. */
  reset(): void;
  /** Whether every field is valid; shows nothing. */
  checkValidity(): boolean;
  /** Whether every field is valid; shows the errors and moves focus to the first invalid field. */
  reportValidity(): boolean;
}

function entryOf({ binding, value }: {
  binding: FieldBinding;
  value: FieldValue;
}) {
  const isAlways = binding.checkedValue === undefined;
  if (isAlways) {
    return value;
  }

  return value === true ? binding.checkedValue : undefined;
}

/** The state of one form, shared with the fields and buttons inside it. */
export class FormController implements FormHandle {
  isPending = $state(false);
  isSubmitted = $state(false);
  fields = $state.raw<readonly FieldState[]>([]);
  private buttons: readonly ButtonBinding[] = [];
  private readonly options: FormOptions;
  private abort = new AbortController();
  private schemaMessages = new SvelteMap<string, string>();

  constructor(options: FormOptions) {
    this.options = options;
  }

  get isValid() {
    return this.fields.every(field => field.isValid);
  }

  field(name: string) {
    return this.fields.find(field => field.name === name);
  }

  /** Joins a control to the form; returns the field and what takes it out. */
  register(binding: FieldBinding) {
    const state = new FieldState({
      binding,
      form: this,
      restore: binding.capture()
    });
    const stopListening = binding.subscribe(() => {
      state.isDirty = true;
      this.refresh();
    });
    state.value = binding.read();
    this.fields = [...this.fields, state];
    this.refresh();
    return {
      state,
      unregister: () => {
        stopListening();
        binding.present("");
        this.fields = this.fields.filter(field => field !== state);
        this.refresh();
      }
    };
  }

  /** Adds a button; returns what takes it out. */
  addButton(button: ButtonBinding) {
    this.buttons = [...this.buttons, button];
    return () => {
      this.buttons = this.buttons.filter(candidate => candidate !== button);
    };
  }

  /** Reads every field, checks it, and shows the error where one is due. */
  refresh() {
    const object = this.values().toObject();
    this.checkSchema(object);
    for (const field of this.fields) {
      this.revalidate(field);
    }
  }

  private checkSchema(object: FormObject) {
    this.schemaMessages = new SvelteMap();
    const { schema } = this.options;
    const hasSchema = schema !== undefined;
    if (!hasSchema) {
      return;
    }

    const parsed = schema.safeParse(object);
    if (parsed.success) {
      return;
    }

    for (const issue of parsed.error.issues) {
      const [first] = issue.path;
      const name = typeof first === "string" ? first : undefined;
      const isFormLevel = name === undefined;
      if (isFormLevel) {
        continue;
      }

      if (!this.schemaMessages.has(name)) {
        this.schemaMessages.set(name, issue.message);
      }
    }
  }

  private revalidate(field: FieldState) {
    const { binding } = field;
    const value = binding.read();
    const ownResult = validityOf({
      value,
      constraints: binding.constraints,
      customMessage: field.customMessage,
      messages: binding.messages
    });
    const schemaMessage = this.schemaMessages.get(field.name) ?? "";
    const isSchemaOnly = ownResult.validity.valid && schemaMessage !== "";
    const result = isSchemaOnly ? validityOf({
      value,
      constraints: binding.constraints,
      customMessage: schemaMessage
    }) : ownResult;
    field.value = value;
    field.validity = result.validity;
    field.message = result.message;
    const shown = field.isUserInvalid ? field.message : "";
    const isChanged = shown !== field.shown;
    if (isChanged) {
      field.shown = shown;
      binding.present(shown);
    }
  }

  values() {
    const values = new FormValues();
    for (const field of this.fields) {
      const { binding } = field;
      const isIncluded = binding.isEnabled();
      const value = binding.read();
      const entry = isIncluded ? entryOf({
        binding,
        value
      }) : undefined;
      const isCollected = entry !== undefined;
      if (isCollected) {
        values.append({
          name: field.name,
          value: entry
        });
      }
    }
    return values;
  }

  checkValidity() {
    this.refresh();
    return this.isValid;
  }

  reportValidity() {
    this.refresh();
    for (const field of this.fields) {
      field.isTouched = true;
    }
    this.isSubmitted = true;
    this.refresh();
    const firstInvalid = this.fields.find(field => !field.isValid);
    firstInvalid?.focus();
    return this.isValid;
  }

  private invalidFields() {
    return this.fields.filter(field => !field.isValid).map(field => ({
      name: field.name,
      message: field.message,
      validity: field.validity
    }));
  }

  async requestSubmit({ submitter = null }: {
    submitter?: ButtonBinding | null;
  } = {}) {
    if (this.isPending) {
      return false;
    }

    this.isSubmitted = true;
    const { isNoValidate } = this.options;
    const isStopped = !isNoValidate && !this.reportValidity();
    if (isStopped) {
      this.options.onInvalid(this.invalidFields());
      return false;
    }

    await this.deliver(submitter);
    return true;
  }

  async submit() {
    await this.deliver(null);
  }

  private async deliver(submitter: ButtonBinding | null) {
    this.refresh();
    const formData = this.values();
    const object = formData.toObject();
    const { schema } = this.options;
    const parsed = schema?.safeParse(object);
    const data = parsed?.success === true ? parsed.data : object;
    this.abort = new AbortController();
    const submission: FormSubmission<unknown> = {
      data,
      formData,
      event: {
        submitter
      },
      signal: this.abort.signal
    };
    await this.options.onSubmit(submission);
    await this.runAction(submission);
  }

  private async runAction(submission: FormSubmission<unknown>) {
    const result = this.options.action(submission);
    const isAsync = result instanceof Promise;
    if (!isAsync) {
      return;
    }

    const disabled = this.disableAll();
    this.isPending = true;
    try {
      await result;
    } finally {
      this.isPending = false;
      for (const restore of disabled) {
        restore();
      }
    }
  }

  // Controls and buttons that were enabled are disabled while the action runs,
  // and enabled again by the functions this returns.
  private disableAll() {
    const targets = [...this.fields.map(field => field.binding), ...this.buttons];
    const restores: Listener[] = [];
    for (const target of targets) {
      if (target.isEnabled()) {
        target.setEnabled(false);
        restores.push(() => target.setEnabled(true));
      }
    }
    return restores;
  }

  /** Runs `requestSubmit` for a click or a key: a failure goes to `onError`, or surfaces as any handler's would. */
  trigger(submitter: ButtonBinding | null) {
    this.requestSubmit({ submitter }).catch((error: unknown) => {
      this.reportError(error);
    });
  }

  private reportError(error: unknown) {
    const { onError } = this.options;
    onError(error);
  }

  /** Enter in a single-line field: clicks the first enabled submit button, or submits a form of one text field. */
  submitImplicitly() {
    const submitButton = this.buttons.find(button => button.kind === ButtonKind.SUBMIT);
    const hasSubmitButton = submitButton !== undefined;
    if (hasSubmitButton) {
      if (submitButton.isEnabled()) {
        this.trigger(submitButton);
      }

      return;
    }

    const entries = this.fields.filter(field => field.binding.isTextEntry);
    const isOnlyEntry = entries.length === 1;
    if (isOnlyEntry) {
      this.trigger(null);
    }
  }

  /** Escape in a field: tells the app the user cancelled. */
  cancel() {
    this.options.onCancel();
  }

  reset() {
    this.abort.abort();
    for (const field of this.fields) {
      field.restore();
      field.customMessage = "";
      field.isTouched = false;
      field.isDirty = false;
    }
    this.isSubmitted = false;
    this.refresh();
    this.options.onReset();
  }
}

const FORM_CONTEXT_KEY = Symbol("winui-svelte.form");

/**
 * Makes a form the one the components below it join.
 *
 * @param controller - The form's controller.
 */
export function provideForm(controller: FormController) {
  setContext(FORM_CONTEXT_KEY, controller);
}

/**
 * The form a field or button sits in, or undefined when it is in none. Call it
 * while a component is made, or inside an attachment.
 *
 * @returns The controller of the nearest `Form` above.
 */
export function formOf() {
  return getContext<FormController | undefined>(FORM_CONTEXT_KEY);
}
