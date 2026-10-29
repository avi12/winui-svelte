import type { Declaration, SourcePosition } from "#src/css/translate/types.js";

/** The two kinds of block a stylesheet holds. */
export const BlockKind = {
  RULE: "rule",
  AT_RULE: "at-rule"
} as const;

/** A style rule: a selector and its declarations. */
export interface RuleBlock {
  kind: typeof BlockKind.RULE;
  selector: string;
  at: SourcePosition;
  declarations: Declaration[];
  /** The style rules nested in this one; the translator flattens them with `&`. */
  nested: RuleBlock[];
  /** The at-rules nested in this one; their body styles this rule's own selector (`&`). */
  nestedAtRules: AtRuleBlock[];
}

/** An at-rule (@media, @import...), with its blocks when it has a body. */
export interface AtRuleBlock {
  kind: typeof BlockKind.AT_RULE;
  name: string;
  prelude: string;
  at: SourcePosition;
  /** Null for an at-rule that ends with `;` (@import). */
  children: Block[] | null;
}

/** One top-level thing in a stylesheet. */
export type Block = RuleBlock | AtRuleBlock;

/** A stylesheet that cannot be read at all, with where it went wrong. */
export class CssSyntaxError extends Error {
  readonly position: SourcePosition;

  constructor(message: string, position: SourcePosition) {
    super(message);
    this.position = position;
  }
}

const NESTING_SELECTOR = "&";
// At-rules whose body is declarations, not rules: it is read as one rule body.
const DECLARATION_AT_RULES: ReadonlySet<string> = new Set(["property"]);
const quoteCharacters = new Set(["\"", "'"]);
const NEWLINE = "\n";

class Cursor {
  readonly text: string;
  index = 0;
  private readonly lineStarts: number[] = [0];

  constructor(text: string) {
    this.text = text;
    for (let i = 0; i < text.length; i++) {
      const isNewline = text[i] === NEWLINE;
      if (isNewline) {
        this.lineStarts.push(i + 1);
      }
    }
  }

  get isAtEnd() {
    return this.index >= this.text.length;
  }

  positionAt(index: number) {
    let low = 0;
    let high = this.lineStarts.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      const isLineStartBeforeIndex = (this.lineStarts[middle] ?? 0) <= index;
      if (isLineStartBeforeIndex) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }

    return {
      line: low + 1,
      column: index - (this.lineStarts[low] ?? 0) + 1
    };
  }

  skipComment() {
    const isComment = this.text.startsWith("/*", this.index);
    if (!isComment) {
      return false;
    }

    const end = this.text.indexOf("*/", this.index + 2);
    this.index = end === -1 ? this.text.length : end + 2;
    return true;
  }

  skipSpace() {
    while (!this.isAtEnd) {
      const character = this.text[this.index] ?? "";
      const isSpace = character.trim() === "";
      if (isSpace) {
        this.index++;
      } else if (!this.skipComment()) {
        return;
      }
    }
  }

  skipString() {
    const quote = this.text[this.index];
    this.index++;
    while (!this.isAtEnd && this.text[this.index] !== quote) {
      const isEscape = this.text[this.index] === "\\";
      this.index += isEscape ? 2 : 1;
    }

    this.index++;
  }
}

const Terminator = {
  OPEN_BRACE: "{",
  CLOSE_BRACE: "}",
  SEMICOLON: ";",
  END: ""
} as const;
type Terminator = (typeof Terminator)[keyof typeof Terminator];

interface Prelude {
  text: string;
  at: SourcePosition;
  terminator: Terminator;
}

// Reads up to the next `{`, `;` or `}` outside parentheses and strings,
// without consuming the terminator.
function readPrelude(cursor: Cursor) {
  cursor.skipSpace();
  const start = cursor.index;
  const position = cursor.positionAt(start);
  let depth = 0;
  let text = "";
  while (!cursor.isAtEnd) {
    const character = cursor.text[cursor.index] ?? "";
    const isComment = cursor.text.startsWith("/*", cursor.index);
    if (isComment) {
      cursor.skipComment();
      continue;
    }

    if (quoteCharacters.has(character)) {
      const stringStart = cursor.index;
      cursor.skipString();
      text += cursor.text.slice(stringStart, cursor.index);
      continue;
    }

    const isOpeningParenthesis = character === "(";
    if (isOpeningParenthesis) {
      depth++;
    } else if (character === ")") {
      depth--;
    }

    const isTerminatorCharacter = character === Terminator.OPEN_BRACE
      || character === Terminator.CLOSE_BRACE
      || character === Terminator.SEMICOLON;
    const isTerminator = depth <= 0 && isTerminatorCharacter;
    if (isTerminator) {
      return {
        text: text.trim(),
        at: position,
        terminator: character
      };
    }

    text += character;
    cursor.index++;
  }

  return {
    text: text.trim(),
    at: position,
    terminator: Terminator.END
  };
}

function toDeclaration(prelude: Prelude) {
  const colon = prelude.text.indexOf(":");
  const isColonMissing = colon === -1;
  if (isColonMissing) {
    throw new CssSyntaxError(`expected "property: value", found "${prelude.text}"`, prelude.at);
  }

  const property = prelude.text.slice(0, colon).trim();
  const rawValue = prelude.text.slice(colon + 1).trim();
  const importantMatch = /\s*!important$/iu.exec(rawValue);
  const value = importantMatch === null ? rawValue : rawValue.slice(0, importantMatch.index);
  const isCustomProperty = property.startsWith("--");
  return {
    property: isCustomProperty ? property : property.toLowerCase(),
    value,
    isImportant: importantMatch !== null,
    at: prelude.at
  };
}

function atRule({ prelude, children }: {
  prelude: Prelude;
  children: Block[] | null;
}) {
  const [name = "", ...rest] = prelude.text.slice(1).split(/\s+/u);
  return {
    kind: BlockKind.AT_RULE,
    name: name.toLowerCase(),
    prelude: rest.join(" "),
    at: prelude.at,
    children
  } satisfies AtRuleBlock;
}

function ruleBlock(prelude: Prelude) {
  return {
    kind: BlockKind.RULE,
    selector: prelude.text,
    at: prelude.at,
    declarations: [],
    nested: [],
    nestedAtRules: []
  } satisfies RuleBlock;
}

// After the `{` of a style rule.
function readRuleBody({ cursor, block }: {
  cursor: Cursor;
  block: RuleBlock;
}) {
  while (!cursor.isAtEnd) {
    const prelude = readPrelude(cursor);
    cursor.index++;

    const isNestedRule = prelude.terminator === Terminator.OPEN_BRACE;
    const isNestedAtRule = isNestedRule && prelude.text.startsWith("@");
    if (isNestedAtRule) {
      const body = ruleBlock({
        ...prelude,
        text: NESTING_SELECTOR
      });
      readRuleBody({
        cursor,
        block: body
      });
      block.nestedAtRules.push(
        atRule({
          prelude,
          children: [body]
        })
      );
      continue;
    }

    if (isNestedRule) {
      const child = ruleBlock(prelude);
      readRuleBody({
        cursor,
        block: child
      });
      block.nested.push(child);
      continue;
    }

    const hasText = prelude.text !== "";
    if (hasText) {
      block.declarations.push(toDeclaration(prelude));
    }

    const isRuleEnd = prelude.terminator === Terminator.CLOSE_BRACE;
    if (isRuleEnd) {
      return;
    }
  }
}

function readBlocks({ cursor, isNested }: {
  cursor: Cursor;
  isNested: boolean;
}) {
  const blocks: Block[] = [];
  while (!cursor.isAtEnd) {
    const prelude = readPrelude(cursor);
    const isClose = prelude.terminator === Terminator.CLOSE_BRACE;
    if (isClose) {
      if (isNested) {
        cursor.index++;
        return blocks;
      }

      throw new CssSyntaxError("unexpected }", prelude.at);
    }

    const isAtRule = prelude.text.startsWith("@");
    const isBlock = prelude.terminator === Terminator.OPEN_BRACE;
    cursor.index++;

    const hasDeclarations = isAtRule && isBlock && DECLARATION_AT_RULES.has(
      atRule({
        prelude,
        children: null
      }).name
    );
    if (hasDeclarations) {
      const body = ruleBlock({
        ...prelude,
        text: NESTING_SELECTOR
      });
      readRuleBody({
        cursor,
        block: body
      });
      blocks.push(
        atRule({
          prelude,
          children: [body]
        })
      );
    } else if (isAtRule) {
      blocks.push(
        atRule({
          prelude,
          children: isBlock ? readBlocks({
            cursor,
            isNested: true
          }) : null
        })
      );
    } else if (isBlock) {
      const block = ruleBlock(prelude);
      readRuleBody({
        cursor,
        block
      });
      blocks.push(block);
    }
  }

  return blocks;
}

/**
 * Reads the CSS Svelte emits for a component into rules and at-rules, with
 * the 1-based line and column of every declaration. Only what a stylesheet
 * written for a component can hold: style rules, @media blocks, declarations
 * and comments, with style rules nested in one another. Anything else (@import, @keyframes...) is reported
 * by the caller as having no WinUI meaning, with the position this gives it.
 */
export function parseCss(css: string) {
  return readBlocks({
    cursor: new Cursor(css),
    isNested: false
  });
}
