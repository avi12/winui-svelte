import { classesIn, firstClassOf, kebab, unusedClass } from "./class-naming.ts";
import { CLASS_DIRECTIVE_PREFIX } from "./css-rewrite.ts";
import type { Declaration, Leaf } from "./css-rewrite.ts";
import { DEFAULT_UNIT, ruleText, withDeclaration } from "./rule-text.ts";
import type { TextEdit } from "./text-edit.ts";

export interface ClassAttribute {
  valueStart: number;
  valueEnd: number;
  value: string;
}

export interface TagContext {
  tagName: string;
  tagNameEnd: number;
  attributeStart: number;
  attributeEnd: number;
  classAttribute: ClassAttribute | undefined;
  hasDynamicClass: boolean;
}

const StyleLocationKind = {
  UNSUPPORTED: "unsupported",
  MISSING: "missing",
  FOUND: "found"
} as const;

type StyleLocation =
  | { kind: typeof StyleLocationKind.UNSUPPORTED }
  | { kind: typeof StyleLocationKind.MISSING }
  | {
    kind: typeof StyleLocationKind.FOUND;
    bodyStart: number;
    bodyEnd: number;
  };

interface StyleRule {
  className: string;
  declaration: Declaration;
}

const CLOSING_TAG = "</style>";
const CSS = "css";
const OPENING = /<style\b([^>]*)>/u;
const LANGUAGE = /\blang\s*=\s*["']?([\w-]+)/u;

function locateStyle(fileText: string) {
  const open = OPENING.exec(fileText);
  const hasNoOpen = open === null;
  if (hasNoOpen) {
    return { kind: StyleLocationKind.MISSING } satisfies StyleLocation;
  }

  const written = LANGUAGE.exec(open[1] ?? "")?.[1];
  const isOtherLanguage = written !== undefined && written.toLowerCase() !== CSS;
  const bodyStart = open.index + open[0].length;
  const bodyEnd = fileText.indexOf(CLOSING_TAG, bodyStart);
  const isUnsupported = isOtherLanguage || bodyEnd < 0;
  if (isUnsupported) {
    return { kind: StyleLocationKind.UNSUPPORTED } satisfies StyleLocation;
  }

  return {
    kind: StyleLocationKind.FOUND,
    bodyStart,
    bodyEnd
  } satisfies StyleLocation;
}

function newlineOf(fileText: string) {
  return fileText.includes("\r\n") ? "\r\n" : "\n";
}

function styleEdit({ fileText, style, rules }: {
  fileText: string;
  style: StyleLocation;
  rules: StyleRule[];
}) {
  const newline = newlineOf(fileText);
  const isFound = style.kind === StyleLocationKind.FOUND;
  if (isFound) {
    const body = fileText.slice(style.bodyStart, style.bodyEnd);
    let edited = body;
    for (const rule of rules) {
      edited = withDeclaration({
        body: edited,
        className: rule.className,
        declaration: rule.declaration,
        newline
      });
    }

    return {
      start: style.bodyStart,
      end: style.bodyEnd,
      text: edited
    } satisfies TextEdit;
  }

  const written = rules.map(rule => ruleText({
    ruleIndent: DEFAULT_UNIT,
    unit: DEFAULT_UNIT,
    className: rule.className,
    declaration: rule.declaration,
    newline
  })).join(`${newline}${newline}`);
  return {
    start: fileText.trimEnd().length,
    end: fileText.length,
    text: `${newline}${newline}<style>${newline}${written}${newline}</style>${newline}`
  } satisfies TextEdit;
}

function removal({ fileText, tag }: {
  fileText: string;
  tag: TagContext;
}) {
  let start = tag.attributeStart;
  while (start > 0 && /\s/u.test(fileText.charAt(start - 1))) {
    start -= 1;
  }

  return {
    start,
    end: tag.attributeEnd,
    text: ""
  } satisfies TextEdit;
}

function classEdit({ tag, className }: {
  tag: TagContext;
  className: string;
}) {
  const attribute = tag.classAttribute;
  const hasNoAttribute = attribute === undefined;
  if (hasNoAttribute) {
    return {
      start: tag.tagNameEnd,
      end: tag.tagNameEnd,
      text: ` class="${className}"`
    } satisfies TextEdit;
  }

  return {
    start: attribute.valueStart,
    end: attribute.valueEnd,
    text: className
  } satisfies TextEdit;
}

/**
 * The edits that move a declaration out of an attribute into the rule of the tag's class, naming the class and
 * adding the style block when there are none; undefined when the tag's class or style cannot take it.
 */
export function planRule({ fileText, tag, declaration }: {
  fileText: string;
  tag: TagContext;
  declaration: Declaration;
}) {
  const style = locateStyle(fileText);
  const written = tag.classAttribute;
  const existing = written === undefined ? undefined : firstClassOf(written.value);
  const hasUnusableClass = written !== undefined && written.value.trim() !== "" && existing === undefined;
  const isUnusable = style.kind === StyleLocationKind.UNSUPPORTED || tag.hasDynamicClass || hasUnusableClass;
  if (isUnusable) {
    return undefined;
  }

  const className = existing ?? unusedClass({
    base: kebab(tag.tagName),
    taken: classesIn(fileText)
  });
  const edits = [removal({
    fileText,
    tag
  })];
  const hasNoExisting = existing === undefined;
  if (hasNoExisting) {
    edits.push(
      classEdit({
        tag,
        className
      })
    );
  }

  edits.push(
    styleEdit({
      fileText,
      style,
      rules: [{
        className,
        declaration
      }]
    })
  );
  return edits;
}

function conditionOf(conditions: string[]) {
  const [only] = conditions;
  const isSingle = conditions.length === 1 && only !== undefined;
  return isSingle ? only : conditions.map(condition => `(${condition})`).join(" || ");
}

/**
 * The edits that turn a conditional prop into class directives and the rules they toggle.
 */
export function planToggles({ fileText, tag, property, leaves }: {
  fileText: string;
  tag: TagContext;
  property: string;
  leaves: Leaf[];
}) {
  const style = locateStyle(fileText);
  const isUnusable = style.kind === StyleLocationKind.UNSUPPORTED || leaves.length === 0;
  if (isUnusable) {
    return undefined;
  }

  const written = tag.classAttribute;
  const base = (written === undefined ? undefined : firstClassOf(written.value)) ?? kebab(tag.tagName);
  const modifiers = [...new Set(leaves.map(leaf => leaf.modifier))];
  const toggles = modifiers.map(modifier => {
    const same = leaves.filter(leaf => leaf.modifier === modifier);
    return {
      name: `${base}--${modifier}`,
      condition: conditionOf(same.map(leaf => leaf.condition)),
      declaration: {
        property,
        value: same[0]?.value ?? ""
      }
    };
  });
  const directives = toggles.map(toggle => `${CLASS_DIRECTIVE_PREFIX}${toggle.name}={${toggle.condition}}`).join(" ");
  return [
    {
      start: tag.attributeStart,
      end: tag.attributeEnd,
      text: directives
    },
    styleEdit({
      fileText,
      style,
      rules: toggles.map(toggle => ({
        className: toggle.name,
        declaration: toggle.declaration
      }))
    })
  ];
}
