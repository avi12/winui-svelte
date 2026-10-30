import {
  alignChildren,
  CONTAINER_MEMBERS,
  DISTRIBUTIONS,
  foldContainer,
  keepAtStart,
  KIND_MEMBERS,
  NO_DISTRIBUTION,
  NO_SPACE
} from "./container-alignment.ts";
import type { Folded } from "./container-alignment.ts";
import { CHILD_MEMBERS, childFacts, rejectGrowth, reorder } from "./container-children.ts";
import type { ChildFacts } from "./container-children.ts";
import { declarationsOf, ruleSubjects } from "./container-rules.ts";
import type { RuleSubject } from "./container-rules.ts";
import { addLine, fail, failElement, take } from "./container-run.ts";
import type { Run } from "./container-run.ts";
import { removeDeclaration } from "./declaration-ranges.ts";
import type { FlexItem } from "./flex-values.ts";
import type { Move } from "./reorder.ts";
import { generatedName } from "./resolve-selector.ts";
import type { Context } from "./resolve-selector.ts";
import type { Edit } from "./style-edits.ts";
import type { TemplateElement } from "./template-elements.ts";
import type { Block } from "#src/css/parse/parser.js";
import { orientationOf } from "#src/css/translate/layout-properties.js";
import { ElementType } from "#src/css/translate/property-kit.js";
import type { Declaration } from "#src/css/translate/types.js";

const PREFIX = "container|";
const COLUMN = "column";
const ROW = "row";
const NO_WRAP = "nowrap";
const WRAP = "flex-wrap";
const HORIZONTAL = "Horizontal";
const FLEX_DISPLAYS: ReadonlySet<string> = new Set(["flex", "inline-flex"]);
const MEMBERS: ReadonlySet<string> = new Set([...CONTAINER_MEMBERS, ...CHILD_MEMBERS, ...KIND_MEMBERS]);

/**
 * What a container's rules lower to in the markup: the declarations to take
 * out of the `<style>`, and the children to write in another order.
 */
export interface ContainerLowering {
  edits: Edit[];
  moves: Move[];
}

type Mode = "stack" | "grid" | "grid-flex";

interface Lowering {
  run: Run;
  container: TemplateElement;
  children: readonly ChildFacts[];
  folded: Folded;
  declarations: readonly Declaration[];
}

function modeOf({ element, folded }: {
  element: TemplateElement;
  folded: Folded;
}) {
  const isStack = element.name === ElementType.STACK_PANEL;
  if (isStack) {
    return "stack";
  }

  const isGrid = element.name === ElementType.GRID;
  const isFlex = FLEX_DISPLAYS.has(folded.display?.value ?? "");
  const gridMode = isFlex ? "grid-flex" : "grid";
  return isGrid ? gridMode : null;
}

function trackOf(item: FlexItem) {
  const pixels = item.basis.kind === "length" ? item.basis.pixels : 0;
  const hasShare = item.grow > 0;
  if (hasShare) {
    return pixels > 0 ? `minmax(${pixels}px, ${item.grow}fr)` : `${item.grow}fr`;
  }

  return pixels > 0 ? `${pixels}px` : "auto";
}

// Whether a stack lays out along a row: `flex-direction`, else `display: flex`, else WinUI's own vertical.
function isRowOf(declarations: readonly Declaration[]) {
  const computed = new Map<string, Declaration>();
  for (const declaration of declarations) {
    computed.set(declaration.property, declaration);
  }

  return (orientationOf(computed) ?? HORIZONTAL) === HORIZONTAL;
}

function lowerStack({ run, container, children, folded, declarations }: Lowering) {
  const isRow = isRowOf(declarations);
  keepAtStart({
    run,
    entry: folded.justifyContent,
    reason: "a stack-panel lays its children from the start; write the container as a <grid> with display: flex, which spaces them"
  });
  const cross = folded.alignItems;
  const hasCross = cross !== undefined;
  if (hasCross) {
    alignChildren({
      run,
      entry: cross,
      property: isRow ? "align-self" : "justify-self",
      children: children.map(({ element }) => element)
    });
  }

  for (const child of children) {
    const { basis, grow } = child.flex;
    const hasShare = grow > 0;
    if (hasShare) {
      rejectGrowth({
        run,
        container,
        child
      });
    }

    const hasLength = basis.kind === "length" && basis.pixels > 0;
    if (hasLength) {
      addLine({
        run,
        element: child.element,
        line: `${isRow ? "width" : "height"}: ${basis.pixels}px`
      });
    }
  }
}

function lowerGrid({ run, children, folded }: Lowering) {
  keepAtStart({
    run,
    entry: folded.justifyContent,
    reason: "a grid's tracks are the ones grid-template-columns lists; give it a track of 1fr around the content instead"
  });
  keepAtStart({
    run,
    entry: folded.alignContent,
    reason: "a grid's tracks are the ones grid-template-rows lists; give it a track of 1fr around the content instead"
  });
  const elements = children.map(({ element }) => element);
  const { alignItems, justifyItems } = folded;
  const hasAlignItems = alignItems !== undefined;
  if (hasAlignItems) {
    alignChildren({
      run,
      entry: alignItems,
      property: "align-self",
      children: elements
    });
  }

  const hasJustifyItems = justifyItems !== undefined;
  if (hasJustifyItems) {
    alignChildren({
      run,
      entry: justifyItems,
      property: "justify-self",
      children: elements
    });
  }
}

// The tracks of a flex container written as a grid: one for each child, and the spacers `justify-content` asks for.
function flexTracks({ children, folded }: {
  children: readonly ChildFacts[];
  folded: Folded;
}) {
  const isShared = children.some(({ flex }) => flex.grow > 0);
  const space = isShared ? NO_SPACE : DISTRIBUTIONS.get(folded.justifyContent?.value ?? "") ?? NO_SPACE;
  const tracks: string[] = space.leading === null ? [] : [space.leading];
  const lines: number[] = [];
  for (const [i, child] of children.entries()) {
    const spacer = space.between;
    const isBetween = i > 0 && spacer !== null;
    if (isBetween) {
      tracks.push(spacer);
    }

    tracks.push(trackOf(child.flex));
    lines.push(tracks.length);
  }

  const { trailing } = space;
  const hasTrailing = trailing !== null;
  if (hasTrailing) {
    tracks.push(trailing);
  }

  return {
    tracks,
    lines
  };
}

// A flex container written as a grid: a track for each child (and for the space
// `justify-content` leaves), each child in its own.
function lowerGridFlex({ run, container, children, folded }: Lowering) {
  const { direction, justifyContent } = folded;
  const isDirectionKnown = direction === undefined || direction.value === ROW || direction.value === COLUMN;
  if (!isDirectionKnown) {
    fail({
      run,
      declaration: direction.declaration,
      message: `flex-direction: ${direction.value} has no WinUI meaning (write row or column, and order the children as they should appear)`
    });
    return;
  }

  const isRow = direction?.value !== COLUMN;
  const axis = isRow ? "column" : "row";
  if (!container.childLevel.isStatic) {
    failElement({
      run,
      element: container,
      message: `<element> is a flex container whose tracks are made from its children, and it holds an {#each}, an {#if} or a component, so how many there are is not known at build time; write grid-template-${axis}s and place each child with grid-${axis}`
    });
    return;
  }

  const isJustifyKnown = justifyContent === undefined
    || DISTRIBUTIONS.has(justifyContent.value)
    || NO_DISTRIBUTION.has(justifyContent.value);
  if (!isJustifyKnown) {
    fail({
      run,
      declaration: justifyContent.declaration,
      message: `justify-content: ${justifyContent.value} has no WinUI meaning (start, end, center, space-between, space-around or space-evenly)`
    });
  }

  const { tracks, lines } = flexTracks({
    children,
    folded
  });
  addLine({
    run,
    element: container,
    line: `grid-template-${axis}s: ${tracks.join(" ")}`
  });
  for (const [i, child] of children.entries()) {
    addLine({
      run,
      element: child.element,
      line: `grid-${axis}: ${lines[i]}`
    });
  }

  const cross = folded.alignItems;
  const hasCross = cross !== undefined;
  if (hasCross) {
    alignChildren({
      run,
      entry: cross,
      property: isRow ? "align-self" : "justify-self",
      children: children.map(({ element }) => element)
    });
  }
}

const LOWERINGS = new Map<Mode, (input: Lowering) => void>([
  ["stack", lowerStack],
  ["grid", lowerGrid],
  ["grid-flex", lowerGridFlex]
]);

// What the lowering of an element took out of the rules that reach it.
function takeLowered({ run, element, mode, declarations }: {
  run: Run;
  element: TemplateElement;
  mode: Mode;
  declarations: readonly Declaration[];
}) {
  for (const declaration of declarations) {
    const { property } = declaration;
    const isContainerMember = CONTAINER_MEMBERS.includes(property);
    const isNoWrap = property === WRAP && declaration.value.trim().toLowerCase() === NO_WRAP;
    const isKind = mode === "grid-flex" && KIND_MEMBERS.includes(property) && property !== WRAP;
    const isLowered = isContainerMember || isNoWrap || isKind;
    if (isLowered) {
      take({
        run,
        declaration,
        element
      });
    }
  }
}

// What a container's rules say about it and its children is lowered to the generated classes of both.
function lowerContainer({ run, element, declarations, subjects }: {
  run: Run;
  element: TemplateElement;
  declarations: readonly Declaration[];
  subjects: readonly RuleSubject[];
}) {
  const folded = foldContainer(declarations);
  const mode = modeOf({
    element,
    folded
  });
  const isUnlowered = mode === null;
  if (isUnlowered) {
    return;
  }

  const facts = childFacts({
    run,
    children: run.context.elements.filter(candidate => candidate.parent === element),
    declarationsOf: child => declarationsOf({
      subjects,
      element: child
    })
  });
  const children = reorder({
    run,
    container: element,
    children: facts
  });
  const lowering = LOWERINGS.get(mode);
  lowering?.({
    run,
    container: element,
    children,
    folded,
    declarations
  });
  const hasClassedChild = children.some(child => run.lines.has(child.element));
  const hasOpaqueChild = element.childLevel.hasOpaque;
  const isUnreachable = hasClassedChild && hasOpaqueChild;
  if (isUnreachable) {
    failElement({
      run,
      element,
      message: "<element> holds a component or a snippet render, which cannot be given the class that carries its alignment; set it inside the component"
    });
  }

  takeLowered({
    run,
    element,
    mode,
    declarations
  });
}

function isContainerOf({ element, declarations, subjects }: {
  element: TemplateElement;
  declarations: readonly Declaration[];
  subjects: readonly RuleSubject[];
}) {
  const isAligned = declarations.some(({ property }) => CONTAINER_MEMBERS.includes(property));
  const isFlexGrid = element.name === ElementType.GRID
    && declarations.some(({ property, value }) => property === "display" && FLEX_DISPLAYS.has(value.trim().toLowerCase()));
  const hasChildRule = subjects.some(subject => (
    subject.declarations.some(({ property }) => CHILD_MEMBERS.includes(property))
    && subject.matched.some(child => child.parent === element)
  ));
  return isAligned || isFlexGrid || hasChildRule;
}

// Each element with something to carry gets the class of its declarations, written once as a rule of no specificity.
function writeClasses({ context, lines }: {
  context: Context;
  lines: ReadonlyMap<TemplateElement, readonly string[]>;
}) {
  for (const [element, declarations] of lines) {
    const text = declarations.join("; ");
    const key = `${PREFIX}${text}`;
    const isNew = !context.names.has(key);
    const name = generatedName({
      context,
      key
    });
    if (isNew) {
      context.prelude.push(`:where(.${name}) { ${text}; }`);
    }

    context.given.set(element, [...context.given.get(element) ?? [], name]);
  }
}

/**
 * Lowers what a container's rules say about its children: `align-items`,
 * `justify-items`, `place-items`, `justify-content` and `align-content` on a
 * `<stack-panel>` or `<grid>`, `display: flex` on a `<grid>` (its tracks are
 * made from the children's `flex`), the children's `flex-grow`, `flex-basis` and
 * `order`. A Style applies to one element and cannot see its children; the markup
 * is known at build time, so each child gets a generated class carrying what it
 * needs, the declarations are taken out of the rules, and children with an
 * `order` are written in that order.
 */
export function lowerContainers({ context, blocks }: {
  context: Context;
  blocks: readonly Block[];
}) {
  const subjects = ruleSubjects({
    context,
    blocks,
    members: MEMBERS
  });
  const run: Run = {
    context,
    reach: new Map(),
    taken: new Map(),
    lines: new Map(),
    moves: []
  };
  for (const subject of subjects) {
    for (const declaration of subject.declarations) {
      const reached = run.reach.get(declaration) ?? new Set<TemplateElement>();
      for (const element of subject.matched) {
        reached.add(element);
      }

      run.reach.set(declaration, reached);
    }
  }

  for (const element of context.elements) {
    const declarations = declarationsOf({
      subjects,
      element
    });
    if (isContainerOf({
      element,
      declarations,
      subjects
    })) {
      lowerContainer({
        run,
        element,
        declarations,
        subjects
      });
    }
  }

  const edits: Edit[] = [];
  for (const [declaration, reached] of run.reach) {
    const lowered = run.taken.get(declaration);
    const isLoweredEverywhere = lowered !== undefined && lowered.size === reached.size;
    if (isLoweredEverywhere) {
      context.removed.add(declaration);
      edits.push(
        removeDeclaration({
          context,
          declaration
        })
      );
    }
  }

  writeClasses({
    context,
    lines: run.lines
  });
  return {
    edits,
    moves: run.moves
  } satisfies ContainerLowering;
}
