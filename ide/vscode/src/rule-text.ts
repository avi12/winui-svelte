import type { Declaration } from "./css-rewrite.ts";

export const DEFAULT_UNIT = "  ";
const INDENT_CHARACTERS = /^[ \t]*/u;

function declarationText(declaration: Declaration) {
  return `${declaration.property}: ${declaration.value};`;
}

function escapeRegExp(text: string) {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function indentOf(line: string) {
  return INDENT_CHARACTERS.exec(line)?.[0] ?? "";
}

function firstIndent(body: string) {
  const line = body.split("\n").find(candidate => candidate.trim() !== "");
  return line === undefined ? DEFAULT_UNIT : indentOf(line);
}

function unitOf({ text, ruleIndent }: {
  text: string;
  ruleIndent: string;
}) {
  const deeper = text.split("\n")
    .filter(line => line.trim() !== "" && line.startsWith(ruleIndent) && line.length > ruleIndent.length)
    .map(indentOf)
    .find(indent => indent.length > ruleIndent.length);
  return deeper === undefined ? DEFAULT_UNIT : deeper.slice(ruleIndent.length);
}

/**
 * A rule for a class with one declaration.
 */
export function ruleText({ ruleIndent, unit, className, declaration, newline }: {
  ruleIndent: string;
  unit: string;
  className: string;
  declaration: Declaration;
  newline: string;
}) {
  return `${ruleIndent}.${className} {${newline}${ruleIndent}${unit}${declarationText(declaration)}${newline}${ruleIndent}}`;
}

function withNewRule({ body, className, declaration, newline }: {
  body: string;
  className: string;
  declaration: Declaration;
  newline: string;
}) {
  const ruleIndent = firstIndent(body);
  const trimmed = body.trimEnd();
  const separator = trimmed.trim() === "" ? newline : `${newline}${newline}`;
  const added = ruleText({
    ruleIndent,
    unit: unitOf({
      text: body,
      ruleIndent
    }),
    className,
    declaration,
    newline
  });
  return `${trimmed.trim() === "" ? "" : trimmed}${separator}${added}${newline}`;
}

function withDeclarationInside({ inner, indent, declaration, newline }: {
  inner: string;
  indent: string;
  declaration: Declaration;
  newline: string;
}) {
  const property = new RegExp(`(?<![\\w-])${escapeRegExp(declaration.property)}\\s*:[^;]*;?`, "u");
  if (property.test(inner)) {
    return inner.replace(property, () => declarationText(declaration));
  }

  const content = inner.trimEnd();
  const isClosed = content === "" || content.endsWith(";");
  const closed = isClosed ? content : `${content};`;
  return `${closed}${newline}${indent}${unitOf({
    text: inner,
    ruleIndent: indent
  })}${declarationText(declaration)}${newline}${indent}`;
}

/**
 * The style body with the declaration in the class's rule: the rule is added when there is none, the declaration
 * replaces one of the same property, and is otherwise appended.
 */
export function withDeclaration({ body, className, declaration, newline }: {
  body: string;
  className: string;
  declaration: Declaration;
  newline: string;
}) {
  const rule = new RegExp(`^([ \\t]*)\\.${escapeRegExp(className)}\\s*\\{([^}]*)\\}`, "mu").exec(body);
  const hasNoRule = rule === null;
  if (hasNoRule) {
    return withNewRule({
      body,
      className,
      declaration,
      newline
    });
  }

  const [whole = "", indent = "", inner = ""] = rule;
  const innerStart = rule.index + whole.indexOf("{") + 1;
  const updated = withDeclarationInside({
    inner,
    indent,
    declaration,
    newline
  });
  return `${body.slice(0, innerStart)}${updated}${body.slice(innerStart + inner.length)}`;
}
