// Constraint validation, as HTML's: a value and its constraints give a
// ValidityState and the message that states the first failure. Pure: no WinUI.

/** What a field holds once collected: an input's value on the web, widened to what WinUI's pickers hand out. */
export type FieldValue = string | number | boolean | Date | null;

/** The kind of value a text field is meant to hold, which decides the type check: HTML's `type` attribute. */
export const InputType = {
  TEXT: "text",
  EMAIL: "email",
  URL: "url",
  TEL: "tel",
  PASSWORD: "password",
  NUMBER: "number",
  DATE: "date",
  TIME: "time",
  COLOR: "color"
} as const;

/** An input type: one of the `InputType` values. */
export type InputType = (typeof InputType)[keyof typeof InputType];

/** The ways a value can fail its constraints: the names of HTML's `ValidityState` flags. */
export const ValidityFlag = {
  VALUE_MISSING: "valueMissing",
  BAD_INPUT: "badInput",
  TYPE_MISMATCH: "typeMismatch",
  PATTERN_MISMATCH: "patternMismatch",
  TOO_SHORT: "tooShort",
  TOO_LONG: "tooLong",
  RANGE_UNDERFLOW: "rangeUnderflow",
  RANGE_OVERFLOW: "rangeOverflow",
  STEP_MISMATCH: "stepMismatch",
  CUSTOM_ERROR: "customError"
} as const;

/** A way a value fails: one of the `ValidityFlag` values. */
export type ValidityFlag = (typeof ValidityFlag)[keyof typeof ValidityFlag];

/** HTML's `ValidityState`: a flag per constraint, and `valid` when none is set. */
export type ValidityState = Readonly<Record<ValidityFlag, boolean>> & { readonly valid: boolean };

/** HTML's validation attributes, as typed props. */
export interface Constraints {
  /** The field must hold a value (a check box: be checked). */
  readonly required?: boolean | undefined;
  /** The least characters of a text value. */
  readonly minLength?: number | undefined;
  /** The most characters of a text value. */
  readonly maxLength?: number | undefined;
  /** The least a number or date may be. */
  readonly min?: number | Date | undefined;
  /** The most a number or date may be. */
  readonly max?: number | Date | undefined;
  /** A number must be `min` (or 0) plus a whole multiple of this. */
  readonly step?: number | undefined;
  /** A text value must match all of it: a string is anchored as HTML's `pattern` is, a RegExp is used as written. */
  readonly pattern?: RegExp | string | undefined;
  /** The kind of value, which checks e-mail and URL shapes and that a number is one. */
  readonly type?: InputType | undefined;
}

/** The message for each failure: a string, or a function of the constraints for the ones that quote them. */
export type ValidityMessages = Readonly<Record<ValidityFlag, string | ((constraints: Constraints) => string)>>;

function limitText(limit: number | Date | undefined) {
  return limit instanceof Date ? limit.toLocaleDateString() : String(limit);
}

/** The messages used when the app gives none. */
export const DEFAULT_MESSAGES: ValidityMessages = {
  valueMissing: "Fill in this field",
  badInput: "Enter a value in the right form",
  typeMismatch: "Enter a value of the right type",
  patternMismatch: "The value does not match the required format",
  tooShort: ({ minLength }) => `Enter at least ${minLength} characters`,
  tooLong: ({ maxLength }) => `Enter at most ${maxLength} characters`,
  rangeUnderflow: ({ min }) => `The value must be ${limitText(min)} or more`,
  rangeOverflow: ({ max }) => `The value must be ${limitText(max)} or less`,
  stepMismatch: ({ step }) => `The value must be a multiple of ${step}`,
  customError: "The value is not valid"
};

// The first failure in this order is the one told.
const MESSAGE_ORDER = [
  ValidityFlag.CUSTOM_ERROR,
  ValidityFlag.VALUE_MISSING,
  ValidityFlag.BAD_INPUT,
  ValidityFlag.TYPE_MISMATCH,
  ValidityFlag.PATTERN_MISMATCH,
  ValidityFlag.TOO_SHORT,
  ValidityFlag.TOO_LONG,
  ValidityFlag.RANGE_UNDERFLOW,
  ValidityFlag.RANGE_OVERFLOW,
  ValidityFlag.STEP_MISMATCH
] as const;

// The e-mail shape HTML's specification gives for a valid address.
const EMAIL_PATTERN = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/u;
const STEP_TOLERANCE = 1e-9;

/** A ValidityState with no flag set. */
export const VALID_STATE: ValidityState = {
  valueMissing: false,
  badInput: false,
  typeMismatch: false,
  patternMismatch: false,
  tooShort: false,
  tooLong: false,
  rangeUnderflow: false,
  rangeOverflow: false,
  stepMismatch: false,
  customError: false,
  valid: true
};

/**
 * Whether a value counts as nothing filled in: null, an empty string, or an
 * unchecked box.
 *
 * @param value - The collected value.
 * @returns True when `required` would fail.
 */
export function isEmptyValue(value: FieldValue) {
  const isBlank = value === null || value === "" || value === false;
  const isNotANumber = typeof value === "number" && Number.isNaN(value);
  return isBlank || isNotANumber;
}

function comparable(value: number | Date) {
  return value instanceof Date ? value.getTime() : value;
}

function patternOf(pattern: RegExp | string) {
  const isExpression = pattern instanceof RegExp;
  return isExpression ? pattern : new RegExp(`^(?:${pattern})$`, "u");
}

function isTypeMismatch({ value, type }: {
  value: string;
  type: InputType | undefined;
}) {
  const isEmail = type === InputType.EMAIL;
  if (isEmail) {
    return !EMAIL_PATTERN.test(value);
  }

  const isUrl = type === InputType.URL;
  if (isUrl) {
    return !URL.canParse(value);
  }

  return false;
}

function isBadNumber({ value, type }: {
  value: FieldValue;
  type: InputType | undefined;
}) {
  const isText = typeof value === "string";
  const isNumeric = value !== "" && !Number.isNaN(Number(value));
  return type === InputType.NUMBER && isText && !isNumeric;
}

function isStepMismatch({ value, constraints }: {
  value: number;
  constraints: Constraints;
}) {
  const { step, min } = constraints;
  const isStepped = step !== undefined && step > 0;
  if (!isStepped) {
    return false;
  }

  const base = typeof min === "number" ? min : 0;
  const steps = (value - base) / step;
  return Math.abs(steps - Math.round(steps)) > STEP_TOLERANCE;
}

function textFlags({ value, constraints }: {
  value: string;
  constraints: Constraints;
}) {
  const { minLength, maxLength, pattern, type } = constraints;
  return {
    typeMismatch: isTypeMismatch({
      value,
      type
    }),
    patternMismatch: pattern !== undefined && !patternOf(pattern).test(value),
    tooShort: minLength !== undefined && value.length < minLength,
    tooLong: maxLength !== undefined && value.length > maxLength
  };
}

function rangeFlags({ value, constraints }: {
  value: number | Date;
  constraints: Constraints;
}) {
  const { min, max } = constraints;
  const compared = comparable(value);
  return {
    rangeUnderflow: min !== undefined && compared < comparable(min),
    rangeOverflow: max !== undefined && compared > comparable(max),
    stepMismatch: typeof value === "number" && isStepMismatch({
      value,
      constraints
    })
  };
}

// A number-typed text is compared as the number it spells; plain text is not
// compared at all.
function rangeable({ value, type }: {
  value: FieldValue;
  type: InputType | undefined;
}) {
  const isNumberText = typeof value === "string" && type === InputType.NUMBER;
  const candidate = isNumberText ? Number(value) : value;
  const isOrdered = typeof candidate === "number" || candidate instanceof Date;
  const isUsable = isOrdered && !Number.isNaN(comparable(candidate));
  return isUsable ? candidate : null;
}

function constraintFlags({ value, constraints }: {
  value: FieldValue;
  constraints: Constraints;
}) {
  const ordered = rangeable({
    value,
    type: constraints.type
  });
  return {
    ...(typeof value === "string" ? textFlags({
      value,
      constraints
    }) : {}),
    ...(ordered === null ? {} : rangeFlags({
      value: ordered,
      constraints
    }))
  };
}

/** The result of checking a value: its ValidityState and the message of the first failure ("" when valid). */
export interface ValidityResult {
  readonly validity: ValidityState;
  readonly message: string;
}

/**
 * Checks a value against HTML's constraints. An empty value fails only
 * `required` (the other constraints say nothing about no value).
 *
 * @param options - The value, its constraints, the custom error ("" for none) and replacement messages.
 * @returns The validity flags and the message of the first one set.
 */
export function validityOf({ value, constraints, customMessage = "", messages = {} }: {
  value: FieldValue;
  constraints: Constraints;
  customMessage?: string;
  messages?: Partial<Record<ValidityFlag, string>>;
}) {
  const isEmpty = isEmptyValue(value);
  const flags = {
    valueMissing: constraints.required === true && isEmpty,
    badInput: !isEmpty && isBadNumber({
      value,
      type: constraints.type
    }),
    customError: customMessage !== "",
    ...(isEmpty ? {} : constraintFlags({
      value,
      constraints
    }))
  };
  const validity: ValidityState = {
    ...VALID_STATE,
    ...flags,
    valid: !Object.values(flags).includes(true)
  };
  const failed = MESSAGE_ORDER.find(flag => validity[flag]);
  const isValid = failed === undefined;
  if (isValid) {
    return {
      validity,
      message: ""
    };
  }

  const text = failed === ValidityFlag.CUSTOM_ERROR ? customMessage : (messages[failed] ?? DEFAULT_MESSAGES[failed]);
  return {
    validity,
    message: typeof text === "function" ? text(constraints) : text
  };
}
