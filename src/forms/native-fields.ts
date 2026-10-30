import {
  CHECK_ADAPTER,
  COLOR_ADAPTER,
  DATE_ADAPTER,
  NUMBER_ADAPTER,
  PASSWORD_ADAPTER,
  RATING_ADAPTER,
  selectionAdapter,
  SLIDER_ADAPTER,
  SWITCH_ADAPTER,
  TEXT_ADAPTER,
  TIME_ADAPTER
} from "./field-adapters.ts";
import type { FieldAdapter, ItemValue } from "./field-adapters.ts";
import { ButtonKind, FormController, formOf } from "./form-controller.svelte.ts";
import type { ButtonBinding, FieldBinding, FormHandle } from "./form-controller.svelte.ts";
import type { Constraints, FieldValue, ValidityFlag } from "./validity.ts";
import { brushOf } from "#src/components/convert.js";
import { AutomationProperties, VirtualKey } from "#src/components/generated/bindings.js";
import type { DependencyObject } from "#src/components/generated/bindings.js";
import { control } from "#src/components/runtime.js";
import { focusElement } from "#src/renderer/host/focus-element.js";
import type { Focusable } from "#src/renderer/host/focus-element.js";
import { untrack } from "svelte";

// The attachments that join a WinUI control to a Form:
// `<TextBox bind:text {@attach textField({ name: "email", required: true })} />`.
// The control stays the one place its value lives (bind: still works); the
// form reads it through the control's own property and event.

const ERROR_BORDER_COLOR = "#c42b1c";

type Listener = () => void;
type Unsubscribe = () => void;

/** The members every field control has: WinUI's `Control`. */
interface FieldControl extends DependencyObject, Focusable {
  isEnabled: boolean;
  borderBrush: object | null;
  onKeyDown(callback: (...args: unknown[]) => void): Unsubscribe;
  onLostFocus(callback: Listener): Unsubscribe;
}

/** What a field takes besides the HTML validation attributes. */
export interface FieldOptions extends Constraints {
  /** The name the value is collected under, as an input's `name`. */
  readonly name: string;
  /** The form the field belongs to, when it is not inside that form's `Form` (HTML's `form` attribute). */
  readonly form?: FormHandle | undefined;
  /** Replaces the default message of a failure. */
  readonly messages?: Partial<Record<ValidityFlag, string>> | undefined;
  /** The accessible name of the control (UI Automation's Name). */
  readonly label?: string | undefined;
  /**
   * For a check box or switch: collected as this when checked, and left out when not (HTML's `value`).
   * Without it, the field is always collected, as true or false.
   */
  readonly checkedValue?: FieldValue | undefined;
  /** Whether an error shows on the control itself (a red border and the accessible help text); on by default. */
  readonly isErrorShown?: boolean | undefined;
}

function isKeyArgs(args: unknown): args is {
  key: number;
} {
  return typeof args === "object" && args !== null && "key" in args && typeof args.key === "number";
}

function formFor(options: { form?: FormHandle | undefined }) {
  const form = options.form ?? formOf();
  const isForm = form instanceof FormController;
  if (!isForm) {
    throw new Error("a form field or button was put outside a <Form>; pass `form` to join one elsewhere");
  }

  return form;
}

interface BorderState {
  previous: object | null;
  isSet: boolean;
}

function present({ native, message, border }: {
  native: FieldControl;
  message: string;
  border: BorderState;
}) {
  AutomationProperties.setHelpText(native, message);
  const isError = message !== "";
  const isToShow = isError && !border.isSet;
  if (isToShow) {
    border.previous = native.borderBrush;
    border.isSet = true;
    native.borderBrush = brushOf(ERROR_BORDER_COLOR);
    return;
  }

  const isToClear = !isError && border.isSet;
  if (isToClear) {
    native.borderBrush = border.previous;
    border.isSet = false;
  }
}

function bindingOf<Adapted extends object>({ native, adapter, options }: {
  native: Adapted & FieldControl;
  adapter: FieldAdapter<Adapted>;
  options: FieldOptions;
}) {
  const border: BorderState = {
    previous: null,
    isSet: false
  };
  const { isErrorShown = true } = options;
  const binding: FieldBinding = {
    name: options.name,
    constraints: {
      ...options,
      type: options.type ?? adapter.type
    },
    messages: options.messages ?? {},
    checkedValue: options.checkedValue,
    isTextEntry: adapter.isTextEntry,
    read: () => adapter.read(native),
    subscribe: listener => adapter.subscribe({
      control: native,
      listener
    }),
    capture: () => adapter.capture(native),
    focus: () => focusElement({ control: native }),
    isEnabled: () => native.isEnabled,
    setEnabled(isEnabled) {
      native.isEnabled = isEnabled;
    },
    present(message) {
      if (isErrorShown) {
        present({
          native,
          message,
          border
        });
      }
    }
  };
  return binding;
}

function listenToKeys({ native, form, isTextEntry }: {
  native: FieldControl;
  form: FormController;
  isTextEntry: boolean;
}) {
  return native.onKeyDown((_sender, args) => {
    if (!isKeyArgs(args)) {
      return;
    }

    const isEnter = args.key === VirtualKey.Enter;
    const isMultiline = "acceptsReturn" in native && native.acceptsReturn === true;
    const isImplicitSubmit = isEnter && isTextEntry && !isMultiline;
    if (isImplicitSubmit) {
      form.submitImplicitly();
    }

    const isEscape = args.key === VirtualKey.Escape;
    if (isEscape) {
      form.cancel();
    }
  });
}

function fieldAttachment<Adapted extends object>({ adapter, options }: {
  adapter: FieldAdapter<Adapted>;
  options: FieldOptions;
}) {
  return control<Adapted & FieldControl>(native => untrack(() => {
    const form = formFor(options);
    const hasLabel = options.label !== undefined;
    if (hasLabel) {
      AutomationProperties.setName(native, options.label);
    }

    const joined = form.register(
      bindingOf({
        native,
        adapter,
        options
      })
    );
    const stopKeys = listenToKeys({
      native,
      form,
      isTextEntry: adapter.isTextEntry
    });
    const stopBlur = native.onLostFocus(() => {
      joined.state.isTouched = true;
      form.refresh();
    });
    return () => {
      stopKeys();
      stopBlur();
      joined.unregister();
    };
  }));
}

/**
 * Joins a TextBox (or an AutoSuggestBox) to the surrounding `Form`.
 *
 * @param options - The name, and the HTML validation attributes.
 * @returns The attachment to put after `@attach`.
 */
export function textField(options: FieldOptions) {
  return fieldAttachment({
    adapter: TEXT_ADAPTER,
    options
  });
}

/**
 * Joins a PasswordBox to the surrounding `Form`.
 *
 * @param options - The name, and the HTML validation attributes.
 * @returns The attachment to put after `@attach`.
 */
export function passwordField(options: FieldOptions) {
  return fieldAttachment({
    adapter: PASSWORD_ADAPTER,
    options
  });
}

/**
 * Joins a NumberBox to the surrounding `Form`; an empty box collects null.
 *
 * @param options - The name, and the HTML validation attributes (`min`, `max`, `step`).
 * @returns The attachment to put after `@attach`.
 */
export function numberField(options: FieldOptions) {
  return fieldAttachment({
    adapter: NUMBER_ADAPTER,
    options
  });
}

/**
 * Joins a Slider to the surrounding `Form`.
 *
 * @param options - The name, and the HTML validation attributes.
 * @returns The attachment to put after `@attach`.
 */
export function sliderField(options: FieldOptions) {
  return fieldAttachment({
    adapter: SLIDER_ADAPTER,
    options
  });
}

/**
 * Joins a RatingControl to the surrounding `Form`; no rating collects null.
 *
 * @param options - The name, and the HTML validation attributes.
 * @returns The attachment to put after `@attach`.
 */
export function ratingField(options: FieldOptions) {
  return fieldAttachment({
    adapter: RATING_ADAPTER,
    options
  });
}

/**
 * Joins a CheckBox, a ToggleButton or another control with `isChecked`.
 *
 * @param options - The name, `required` (it must be checked) and `checkedValue`.
 * @returns The attachment to put after `@attach`.
 */
export function checkField(options: FieldOptions) {
  return fieldAttachment({
    adapter: CHECK_ADAPTER,
    options
  });
}

/**
 * Joins a ToggleSwitch to the surrounding `Form`.
 *
 * @param options - The name, `required` (it must be on) and `checkedValue`.
 * @returns The attachment to put after `@attach`.
 */
export function switchField(options: FieldOptions) {
  return fieldAttachment({
    adapter: SWITCH_ADAPTER,
    options
  });
}

/**
 * Joins a ComboBox or a RadioButtons to the surrounding `Form`; nothing selected collects null.
 *
 * @param options - The name, the validation attributes, and `itemValue`: how the selected item becomes its value.
 * @returns The attachment to put after `@attach`.
 */
export function selectField(options: FieldOptions & {
  readonly itemValue?: ItemValue | undefined;
}) {
  return fieldAttachment({
    adapter: selectionAdapter(options.itemValue),
    options
  });
}

/**
 * Joins a DatePicker or a CalendarDatePicker to the surrounding `Form`; the value is a Date.
 *
 * @param options - The name, and `required`, `min`, `max`.
 * @returns The attachment to put after `@attach`.
 */
export function dateField(options: FieldOptions) {
  return fieldAttachment({
    adapter: DATE_ADAPTER,
    options
  });
}

/**
 * Joins a TimePicker to the surrounding `Form`; the value is "HH:mm".
 *
 * @param options - The name, and `required`.
 * @returns The attachment to put after `@attach`.
 */
export function timeField(options: FieldOptions) {
  return fieldAttachment({
    adapter: TIME_ADAPTER,
    options
  });
}

/**
 * Joins a ColorPicker to the surrounding `Form`; the value is "#rrggbb".
 *
 * @param options - The name, and `required`.
 * @returns The attachment to put after `@attach`.
 */
export function colorField(options: FieldOptions) {
  return fieldAttachment({
    adapter: COLOR_ADAPTER,
    options
  });
}

/** The members a button has: WinUI's `ButtonBase`. */
interface ButtonControl {
  isEnabled: boolean;
  onClick(callback: Listener): Unsubscribe;
}

/**
 * Makes a Button (or any control with `onClick`) a button of the surrounding
 * `Form`: `submit` validates and submits, `reset` puts the fields back,
 * `button` does nothing to the form.
 *
 * @param options - What the click does (`submit` by default), and the form when the button is not inside its `Form`.
 * @returns The attachment to put after `@attach`.
 */
export function formButton({ kind = ButtonKind.SUBMIT, form: given }: {
  kind?: ButtonKind;
  form?: FormHandle | undefined;
} = {}) {
  return control<ButtonControl>(native => untrack(() => {
    const form = formFor({ form: given });
    const binding: ButtonBinding = {
      kind,
      isEnabled: () => native.isEnabled,
      setEnabled(isEnabled) {
        native.isEnabled = isEnabled;
      }
    };
    const removeButton = form.addButton(binding);
    const stopClick = native.onClick(() => {
      const isSubmit = kind === ButtonKind.SUBMIT;
      if (isSubmit) {
        form.trigger(binding);
      }

      const isReset = kind === ButtonKind.RESET;
      if (isReset) {
        form.reset();
      }
    });
    return () => {
      stopClick();
      removeButton();
    };
  }));
}
