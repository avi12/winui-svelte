import { declarationOffset } from "./declaration-ranges.ts";
import type { Move } from "./reorder.ts";
import { positionOf, report } from "./resolve-selector.ts";
import type { Context } from "./resolve-selector.ts";
import type { TemplateElement } from "./template-elements.ts";
import type { Declaration } from "#src/css/translate/types.js";

/** A container property's value, with the declaration it came from. */
export interface Entry {
  value: string;
  declaration: Declaration;
}

/** What lowering the containers of one component works on and collects. */
export interface Run {
  context: Context;
  /** The elements each declaration reaches, and the ones it was lowered for. */
  reach: Map<Declaration, Set<TemplateElement>>;
  taken: Map<Declaration, Set<TemplateElement>>;
  /** The declarations each element's generated class carries. */
  lines: Map<TemplateElement, string[]>;
  moves: Move[];
}

/** Marks a declaration as lowered for an element: it is taken out of its rule once every element it reaches is. */
export function take({ run, declaration, element }: {
  run: Run;
  declaration: Declaration;
  element: TemplateElement;
}) {
  const known = run.taken.get(declaration) ?? new Set<TemplateElement>();
  known.add(element);
  run.taken.set(declaration, known);
}

/** Adds a declaration to the generated class of an element. */
export function addLine({ run, element, line }: {
  run: Run;
  element: TemplateElement;
  line: string;
}) {
  run.lines.set(element, [...run.lines.get(element) ?? [], line]);
}

/** Reports a problem at a declaration. */
export function fail({ run, declaration, message }: {
  run: Run;
  declaration: Declaration;
  message: string;
}) {
  report({
    context: run.context,
    message,
    at: declarationOffset({
      context: run.context,
      declaration
    })
  });
}

/** Reports a problem with an element's markup, naming its line. */
export function failElement({ run, element, message }: {
  run: Run;
  element: TemplateElement;
  message: string;
}) {
  const { line } = positionOf({
    source: run.context.source,
    offset: element.start
  });
  report({
    context: run.context,
    message: message.replace("<element>", `<${element.name}> (line ${line})`),
    at: element.start
  });
}
