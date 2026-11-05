import { mappingOf } from "./conversion-table.ts";
import { convertValue } from "./conversion.ts";
import { rewriteOf, STYLE_DIRECTIVE_PREFIX } from "./css-rewrite.ts";
import type { Rewrite } from "./css-rewrite.ts";
import { scanTags, ValueKind } from "./markup-scan.ts";
import type { AttributeNode, TagNode } from "./markup-scan.ts";
import { readAttribute } from "./prop-value.ts";
import { planRule, planToggles } from "./style-block.ts";
import type { ClassAttribute, TagContext } from "./style-block.ts";
import { applyEdits } from "./text-edit.ts";
import type { TextEdit } from "./text-edit.ts";

export const Destination = {
  STYLE_BLOCK: "styleBlock",
  STYLE_DIRECTIVE: "styleDirective"
} as const;
export type Destination = (typeof Destination)[keyof typeof Destination];

const CLASS_ATTRIBUTE = "class";
const MAX_STEPS = 10_000;

export interface Conversion {
  tag: TagNode;
  attribute: AttributeNode;
  rewrite: Rewrite;
  edits: TextEdit[];
}

function isComponent(tagName: string) {
  return /^\p{Lu}/u.test(tagName);
}

function classAttributeOf(attribute: AttributeNode) {
  const { value } = attribute;
  const isStatic = value?.kind === ValueKind.QUOTED && value.text.length >= 2 && !value.text.includes("{");
  return {
    isStatic,
    written: isStatic ? {
      valueStart: value.start + 1,
      valueEnd: value.end - 1,
      value: value.text.slice(1, -1)
    } satisfies ClassAttribute : undefined
  };
}

function contextOf({ tag, attribute }: {
  tag: TagNode;
  attribute: AttributeNode;
}) {
  const classAttribute = tag.attributes.find(candidate => candidate.name === CLASS_ATTRIBUTE);
  const { isStatic, written } = classAttribute === undefined ? {
    isStatic: false,
    written: undefined
  } : classAttributeOf(classAttribute);
  return {
    tagName: tag.name,
    tagNameEnd: tag.nameEnd,
    attributeStart: attribute.start,
    attributeEnd: attribute.end,
    classAttribute: written,
    hasDynamicClass: classAttribute !== undefined && !isStatic
  } satisfies TagContext;
}

function editsOf({ fileText, tag, attribute, rewrite }: {
  fileText: string;
  tag: TagNode;
  attribute: AttributeNode;
  rewrite: Rewrite;
}) {
  const isDirective = rewrite.kind === "directive";
  if (isDirective) {
    return [{
      start: attribute.start,
      end: attribute.end,
      text: rewrite.text
    }];
  }

  const context = contextOf({
    tag,
    attribute
  });
  const isRule = rewrite.kind === "rule";
  if (isRule) {
    return planRule({
      fileText,
      tag: context,
      declaration: rewrite.declaration
    });
  }

  return planToggles({
    fileText,
    tag: context,
    property: rewrite.cssProperty,
    leaves: rewrite.leaves
  });
}

/**
 * What an attribute of a component converts to, and the edits that do it; undefined when it has no CSS counterpart,
 * its value is computed, or the file's class or style cannot take it.
 */
export function conversionOf({ fileText, tag, attribute, destination }: {
  fileText: string;
  tag: TagNode;
  attribute: AttributeNode;
  destination: Destination;
}) {
  const mapping = mappingOf(attribute.name);
  const isDirective = destination === Destination.STYLE_DIRECTIVE;
  const hasDirective = mapping !== undefined && isDirective
    && tag.attributes.some(candidate => candidate.name === `${STYLE_DIRECTIVE_PREFIX}${mapping.cssProperty}`);
  const isUnconvertible = mapping === undefined || !isComponent(tag.name) || hasDirective;
  if (isUnconvertible) {
    return undefined;
  }

  const value = readAttribute(attribute);
  const converted = value === undefined ? undefined : convertValue({
    mapping,
    value
  });
  const rewrite = converted === undefined ? undefined : rewriteOf({
    cssProperty: mapping.cssProperty,
    defaultValue: mapping.defaultValue,
    value: converted,
    isDirective
  });
  const hasNoRewrite = rewrite === undefined;
  if (hasNoRewrite) {
    return undefined;
  }

  const edits = editsOf({
    fileText,
    tag,
    attribute,
    rewrite
  });
  return edits === undefined ? undefined : {
    tag,
    attribute,
    rewrite,
    edits
  } satisfies Conversion;
}

/**
 * Every attribute of the file that converts now, in the order they are written.
 */
export function conversionsIn({ fileText, destination }: {
  fileText: string;
  destination: Destination;
}) {
  return scanTags(fileText).flatMap(tag => tag.attributes.flatMap(attribute => conversionOf({
    fileText,
    tag,
    attribute,
    destination
  }) ?? []));
}

/**
 * The file with every convertible attribute converted, one at a time, since each move changes the classes and the
 * style the next one finds; how many attributes moved.
 */
export function convertText({ fileText, destination }: {
  fileText: string;
  destination: Destination;
}) {
  let text = fileText;
  let count = 0;
  for (; count < MAX_STEPS; count += 1) {
    const [first] = conversionsIn({
      fileText: text,
      destination
    });
    const hasNoFirst = first === undefined;
    if (hasNoFirst) {
      break;
    }

    text = applyEdits({
      text,
      edits: first.edits
    });
  }

  return {
    text,
    count
  };
}
