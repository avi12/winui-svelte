import { fail, failElement, take } from "./container-run.ts";
import type { Run } from "./container-run.ts";
import { applyFlex, DEFAULT_FLEX, FLEX_MEMBERS } from "./flex-values.ts";
import type { FlexItem } from "./flex-values.ts";
import type { TemplateElement } from "./template-elements.ts";
import type { Declaration } from "#src/css/translate/types.js";

const ORDER = "order";

/** The properties of a child that are lowered. */
export const CHILD_MEMBERS = [...FLEX_MEMBERS, ORDER];

/** What a container's rules say about one child. */
export interface ChildFacts {
  element: TemplateElement;
  flex: FlexItem;
  order: number;
  /** The `order` declaration, or null when the child has none. */
  declared: Declaration | null;
}

function flexOf({ run, declarations, element }: {
  run: Run;
  declarations: readonly Declaration[];
  element: TemplateElement;
}) {
  let item = DEFAULT_FLEX;
  for (const declaration of declarations.filter(({ property }) => FLEX_MEMBERS.includes(property))) {
    const next = applyFlex({
      item,
      declaration
    });
    const isUnreadable = next === null;
    if (isUnreadable) {
      fail({
        run,
        declaration,
        message: `${declaration.property}: "${declaration.value}" has no WinUI meaning (a flex item is sized by a number of shares, auto, 0 or a length in px)`
      });
    } else {
      item = next;
    }

    take({
      run,
      declaration,
      element
    });
  }

  return item;
}

// The `order` of a child: a whole number, 0 when unwritten.
function orderOf({ run, declarations, element }: {
  run: Run;
  declarations: readonly Declaration[];
  element: TemplateElement;
}) {
  let order = 0;
  let declared: Declaration | null = null;
  for (const declaration of declarations.filter(({ property }) => property === ORDER)) {
    const value = Number(declaration.value.trim());
    if (Number.isInteger(value)) {
      order = value;
      declared = declaration;
    } else {
      fail({
        run,
        declaration,
        message: `order: "${declaration.value}" must be a whole number`
      });
    }

    take({
      run,
      declaration,
      element
    });
  }

  return {
    order,
    declared
  };
}

/** The facts about each child of a container, from the declarations that reach it. */
export function childFacts({ run, children, declarationsOf }: {
  run: Run;
  children: readonly TemplateElement[];
  declarationsOf(element: TemplateElement): readonly Declaration[];
}) {
  return children.map(element => {
    const declarations = declarationsOf(element);
    const { order, declared } = orderOf({
      run,
      declarations,
      element
    });
    return {
      element,
      flex: flexOf({
        run,
        declarations,
        element
      }),
      order,
      declared
    } satisfies ChildFacts;
  });
}

/**
 * The children in the order `order` gives them. When that is not the order
 * they are written in, a move is recorded that writes them so (the markup is
 * what WinUI lays out, so the order is the markup's); children that are not
 * fixed in the markup (a block or a component among them) are an error.
 */
export function reorder({ run, container, children }: {
  run: Run;
  container: TemplateElement;
  children: readonly ChildFacts[];
}) {
  const declaredBy = children.map(child => child.declared).find(declaration => declaration !== null);
  const hasOrder = declaredBy !== undefined;
  if (!hasOrder) {
    return children;
  }

  if (!container.childLevel.isStatic) {
    fail({
      run,
      declaration: declaredBy,
      message: `order: <${container.name}> holds an {#each}, an {#if} or a component, so its children have no fixed place in the markup to reorder; sort the list in the script`
    });
    return children;
  }

  const byOrder = (first: number, second: number) => (
    (children[first]?.order ?? 0) - (children[second]?.order ?? 0) || first - second
  );
  const sequence = children.map((_child, i) => i).toSorted(byOrder);
  const isSorted = sequence.every((written, i) => written === i);
  if (!isSorted) {
    run.moves.push({
      ranges: children.map(({ element }) => ({
        start: element.start,
        end: element.end
      })),
      sequence
    });
  }

  return sequence.map(i => children[i]).filter(child => child !== undefined);
}

/** Reports a child that a stack-panel cannot give the free space to. */
export function rejectGrowth({ run, container, child }: {
  run: Run;
  container: TemplateElement;
  child: ChildFacts;
}) {
  failElement({
    run,
    element: child.element,
    message: `flex-grow: <element> cannot take the free space of a <${container.name}>, which gives each child what it needs; write the container as a <grid> with display: flex`
  });
}
