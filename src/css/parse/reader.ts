import { parseColor } from "./colors.ts";
import { parseLength, parseVariable, splitWords } from "./values.ts";
import type { ResourceKind, VariableResolution } from "#src/css/runtime/resources.js";
import type { Declaration, Keyframes, Severity, SourcePosition } from "#src/css/translate/types.js";

/** What lowering a declaration needs from its surroundings. */
export interface LowerOptions {
  /** The element the style is for ("stack-panel"), or null when only the syntax is being checked. */
  elementType: string | null;
  /** Resolves `var(--name)` to the key of a WinUI resource of the given kind. */
  resolveVariable(input: {
    declaration: Declaration;
    name: string;
    kind: ResourceKind;
  }): VariableResolution;
  /**
   * The `@keyframes` of an `animation-name`: absent where only a sheet's syntax
   * is checked and the names of other sheets are not known; `isComplete` says
   * whether a name `find` does not return is an error.
   */
  keyframes?: {
    find(name: string): Keyframes | undefined;
    isComplete: boolean;
  };
  /** Whether a style with this key already exists. */
  hasStyle(key: string): boolean;
  /** Reports a problem at the declaration's source position. */
  report(input: {
    severity: Severity;
    message: string;
    position: SourcePosition;
  }): void;
}

const THEME_RESOURCE_MARKUP = {
  open: "{ThemeResource ",
  close: "}"
} as const;

function themeResource(key: string) {
  return `${THEME_RESOURCE_MARKUP.open}${key}${THEME_RESOURCE_MARKUP.close}`;
}

/** WinUI's spelling of "auto" for a length that has no number. */
export const NOT_A_NUMBER = "NaN";

/** WinUI's spelling of "no limit" for a maximum length. */
export const UNBOUNDED = "Infinity";

/**
 * Parses one declaration's value into WinUI's spelling, reporting what it
 * cannot at the declaration's position. Every method returns null after an
 * error, so a caller that gets null emits nothing.
 */
export class Reader {
  readonly declaration: Declaration;
  readonly options: LowerOptions;
  /** Set once anything was reported as an error. */
  hasFailed = false;

  constructor(declaration: Declaration, options: LowerOptions) {
    this.declaration = declaration;
    this.options = options;
  }

  get words() {
    return splitWords(this.declaration.value);
  }

  error(message: string) {
    this.hasFailed = true;
    this.options.report({
      severity: "error",
      message,
      position: this.declaration.at
    });
    return null;
  }

  warn(message: string) {
    this.options.report({
      severity: "warning",
      message,
      position: this.declaration.at
    });
  }

  /** Reports that the whole value is not `what`: `expected a length, found "12px 16"`. */
  expected(what: string) {
    return this.expectedToken({
      what,
      token: this.declaration.value
    });
  }

  /** Reports that one `token` of the value is not `what`. */
  expectedToken({ what, token }: {
    what: string;
    token: string;
  }) {
    return this.error(`${this.declaration.property}: expected ${what}, found "${token}"`);
  }

  /**
   * A `var(--name)` token as the ThemeResource markup of a resource of `kind`:
   * undefined when the token is not a variable at all, null after an error.
   */
  variable({ token, kind }: {
    token: string;
    kind: ResourceKind;
  }) {
    const reference = parseVariable(token);
    const isReferenceMissing = reference === null;
    if (isReferenceMissing) {
      return undefined;
    }

    const resolution = this.options.resolveVariable({
      declaration: this.declaration,
      name: reference.name,
      kind
    });
    if (resolution.isFound) {
      return themeResource(resolution.key);
    }

    return this.error(`${this.declaration.property}: ${resolution.reason}`);
  }

  brush(token: string) {
    const fromVariable = this.variable({
      token,
      kind: "Brush"
    });
    const hasFromVariable = fromVariable !== undefined;
    if (hasFromVariable) {
      return fromVariable;
    }

    const color = parseColor(token);
    return color ?? this.expectedToken({
      what: "a color (hex, rgb(), a name, transparent) or var(--brush)",
      token
    });
  }

  length(token: string) {
    const fromVariable = this.variable({
      token,
      kind: "Double"
    });
    const hasFromVariable = fromVariable !== undefined;
    if (hasFromVariable) {
      return fromVariable;
    }

    const pixels = parseLength(token);
    return pixels === null ? this.expectedToken({
      what: "a length in px (or rem, or 0)",
      token
    }) : String(pixels);
  }

  pixels(token: string) {
    const pixels = parseLength(token);
    return pixels ?? this.expectedToken({
      what: "a length in px (or rem, or 0)",
      token
    });
  }

  /** One of the keywords in `choices`, as the value it maps to. */
  keyword<Value extends string>({ token, choices }: {
    token: string;
    choices: ReadonlyMap<string, Value>;
  }) {
    const found = choices.get(token.toLowerCase());
    return found ?? this.expectedToken({
      what: `one of ${[...choices.keys()].join(", ")}`,
      token
    });
  }

  /** The declaration's whole value, which must be exactly one token. */
  single() {
    const [only, ...rest] = this.words;
    const isSingle = only !== undefined && rest.length === 0;
    return isSingle ? only : this.expected("a single value");
  }
}
