import { InputType } from "./validity.ts";
import type { FieldValue } from "./validity.ts";
import { ticksDate } from "#src/components/values.js";

// How a form reads a control: the property that holds its value, the event
// that says the value changed, and how to put the value back. Each adapter is
// typed by the members it needs, not by a WinUI class, so a stand-in with
// those members is a field in a test, and the one-line difference between
// controls (TextBox.text, ToggleSwitch.isOn) lives here and nowhere else.

type Listener = () => void;
type Unsubscribe = () => void;

/** What a form needs to know about one kind of control. */
export interface FieldAdapter<Control> {
  /** The value the control holds now. */
  read(control: Control): FieldValue;
  /** Says when the value may have changed; returns what undoes it. */
  subscribe(options: {
    control: Control;
    listener: Listener;
  }): Unsubscribe;
  /** Takes the value the control holds now and returns what puts it back (a form's reset). */
  capture(control: Control): Listener;
  /** The type the control implies when the field gives none. */
  readonly type: InputType | undefined;
  /** Whether Enter in the control submits the form: a single-line entry does. */
  readonly isTextEntry: boolean;
}

// Several change events end together.
function joinEnds(ends: readonly Unsubscribe[]) {
  return () => {
    for (const end of ends) {
      end();
    }
  };
}

interface TextControl {
  text: string;
  onTextChanged(callback: Listener): Unsubscribe;
}

/** TextBox and AutoSuggestBox: the text typed. */
export const TEXT_ADAPTER: FieldAdapter<TextControl> = {
  read: control => control.text,
  subscribe: ({ control, listener }) => control.onTextChanged(listener),
  capture(control) {
    const original = control.text;
    return () => {
      control.text = original;
    };
  },
  type: InputType.TEXT,
  isTextEntry: true
};

interface PasswordControl {
  password: string;
  onPasswordChanged(callback: Listener): Unsubscribe;
}

/** PasswordBox: the password typed. */
export const PASSWORD_ADAPTER: FieldAdapter<PasswordControl> = {
  read: control => control.password,
  subscribe: ({ control, listener }) => control.onPasswordChanged(listener),
  capture(control) {
    const original = control.password;
    return () => {
      control.password = original;
    };
  },
  type: InputType.PASSWORD,
  isTextEntry: true
};

interface ValueControl {
  value: number;
  onValueChanged(callback: Listener): Unsubscribe;
}

/** NumberBox: the number, null when the box is empty (WinUI holds NaN). */
export const NUMBER_ADAPTER: FieldAdapter<ValueControl> = {
  read: control => (Number.isNaN(control.value) ? null : control.value),
  subscribe: ({ control, listener }) => control.onValueChanged(listener),
  capture(control) {
    const original = control.value;
    return () => {
      control.value = original;
    };
  },
  type: InputType.NUMBER,
  isTextEntry: true
};

/** Slider: the number the thumb is at. */
export const SLIDER_ADAPTER: FieldAdapter<ValueControl> = {
  ...NUMBER_ADAPTER,
  read: control => control.value,
  isTextEntry: false
};

/** RatingControl: the stars given, null when there is no rating (WinUI holds -1). */
export const RATING_ADAPTER: FieldAdapter<ValueControl> = {
  ...SLIDER_ADAPTER,
  read: control => (control.value < 0 ? null : control.value)
};

interface CheckControl {
  isChecked: boolean | null;
  onChecked(callback: Listener): Unsubscribe;
  onUnchecked(callback: Listener): Unsubscribe;
  onIndeterminate(callback: Listener): Unsubscribe;
}

/** CheckBox, ToggleButton and the like: whether it is checked (indeterminate counts as not). */
export const CHECK_ADAPTER: FieldAdapter<CheckControl> = {
  read: control => control.isChecked === true,
  subscribe: ({ control, listener }) => joinEnds([
    control.onChecked(listener),
    control.onUnchecked(listener),
    control.onIndeterminate(listener)
  ]),
  capture(control) {
    const isInitiallyChecked = control.isChecked;
    return () => {
      control.isChecked = isInitiallyChecked;
    };
  },
  type: undefined,
  isTextEntry: false
};

interface SwitchControl {
  isOn: boolean;
  onToggled(callback: Listener): Unsubscribe;
}

/** ToggleSwitch: whether it is on. */
export const SWITCH_ADAPTER: FieldAdapter<SwitchControl> = {
  read: control => control.isOn,
  subscribe: ({ control, listener }) => control.onToggled(listener),
  capture(control) {
    const isInitiallyOn = control.isOn;
    return () => {
      control.isOn = isInitiallyOn;
    };
  },
  type: undefined,
  isTextEntry: false
};

interface SelectionControl {
  selectedItem: unknown;
  selectedIndex: number;
  onSelectionChanged(callback: Listener): Unsubscribe;
}

/** How a selected item becomes the value a form collects. */
export type ItemValue = (item: unknown) => FieldValue;

/**
 * The value of an item that is text, a number or a boolean as it is, of a
 * ComboBoxItem or the like as its text content, and of anything else as its
 * text.
 *
 * @param item - The selected item.
 * @returns The value the form collects.
 */
export function defaultItemValue(item: unknown) {
  const isNone = item === null || item === undefined;
  if (isNone) {
    return null;
  }

  const isPlain = typeof item === "string" || typeof item === "number" || typeof item === "boolean";
  if (isPlain) {
    return item;
  }

  const hasContent = typeof item === "object" && "content" in item;
  const content = hasContent ? item.content : item;
  return typeof content === "string" ? content : String(content);
}

/**
 * ComboBox and RadioButtons: the value of the selected item, null when none is.
 *
 * @param itemValue - How an item becomes a value (its text by default).
 * @returns The adapter.
 */
export function selectionAdapter(itemValue: ItemValue = defaultItemValue) {
  const adapter: FieldAdapter<SelectionControl> = {
    read: control => (control.selectedIndex < 0 ? null : itemValue(control.selectedItem)),
    subscribe: ({ control, listener }) => control.onSelectionChanged(listener),
    capture(control) {
      const original = control.selectedIndex;
      return () => {
        control.selectedIndex = original;
      };
    },
    type: undefined,
    isTextEntry: false
  };
  return adapter;
}

interface DateTimeValue {
  universalTime: bigint;
}

interface DateControl {
  date: DateTimeValue | null;
  onDateChanged(callback: Listener): Unsubscribe;
}

/** DatePicker and CalendarDatePicker: the date chosen, null when none is. */
export const DATE_ADAPTER: FieldAdapter<DateControl> = {
  read: control => (control.date === null ? null : ticksDate(control.date.universalTime)),
  subscribe: ({ control, listener }) => control.onDateChanged(listener),
  capture(control) {
    const original = control.date;
    return () => {
      control.date = original;
    };
  },
  type: InputType.DATE,
  isTextEntry: false
};

interface TimeControl {
  time: {
    duration: bigint;
  };
  onTimeChanged(callback: Listener): Unsubscribe;
}

const TICKS_PER_MINUTE = 600_000_000n;
const MINUTES_PER_HOUR = 60n;

function twoDigits(value: bigint) {
  return String(value).padStart(2, "0");
}

/** TimePicker: the time as HTML's time input gives it, "HH:mm". */
export const TIME_ADAPTER: FieldAdapter<TimeControl> = {
  read(control) {
    const minutes = control.time.duration / TICKS_PER_MINUTE;
    return `${twoDigits(minutes / MINUTES_PER_HOUR)}:${twoDigits(minutes % MINUTES_PER_HOUR)}`;
  },
  subscribe: ({ control, listener }) => control.onTimeChanged(listener),
  capture(control) {
    const original = control.time;
    return () => {
      control.time = original;
    };
  },
  type: InputType.TIME,
  isTextEntry: false
};

interface ColorControl {
  color: {
    r: number;
    g: number;
    b: number;
  };
  onColorChanged(callback: Listener): Unsubscribe;
}

function hexByte(channel: number) {
  const hexadecimal = 16;
  return channel.toString(hexadecimal).padStart(2, "0");
}

/** ColorPicker: the color as HTML's color input gives it, "#rrggbb". */
export const COLOR_ADAPTER: FieldAdapter<ColorControl> = {
  read: ({ color }) => `#${hexByte(color.r)}${hexByte(color.g)}${hexByte(color.b)}`,
  subscribe: ({ control, listener }) => control.onColorChanged(listener),
  capture(control) {
    const original = control.color;
    return () => {
      control.color = original;
    };
  },
  type: InputType.COLOR,
  isTextEntry: false
};
