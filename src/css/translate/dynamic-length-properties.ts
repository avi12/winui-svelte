import { XAML_SEPARATOR } from "./property-kit.ts";
import type { GroupInput, PropertyGroup, WriteContext } from "./property-kit.ts";
import { resolveDynamicLength } from "#src/css/parse/dynamic-length.js";
import type { LengthBasis } from "#src/css/parse/dynamic-length.js";
import type { Viewport } from "#src/css/parse/media.js";
import { containerOf, sizeOfContainer } from "#src/css/runtime/containers.js";
import type { ContainerNative } from "#src/css/runtime/containers.js";
import type { NativeValue } from "#src/native-value.js";

/** The prefix the build puts on a length property whose value depends on the layout. */
const DYNAMIC_PREFIX = "-winui-dynamic-";

// CSS property, the WinUI property it sets, and the axis a percentage is of.
const DYNAMIC_PROPERTIES = new Map([
  ["width", {
    control: "width",
    axis: "width"
  }],
  ["min-width", {
    control: "minWidth",
    axis: "width"
  }],
  ["max-width", {
    control: "maxWidth",
    axis: "width"
  }],
  ["height", {
    control: "height",
    axis: "height"
  }],
  ["min-height", {
    control: "minHeight",
    axis: "height"
  }],
  ["max-height", {
    control: "maxHeight",
    axis: "height"
  }]
]);
const DYNAMIC_TARGET = "dynamic-length";
const ENTRY_SEPARATOR = "|";

/** The properties whose layout-dependent values the build renames, and this group reads. */
export const DYNAMIC_MEMBERS = [...DYNAMIC_PROPERTIES.keys()].map(property => `${DYNAMIC_PREFIX}${property}`);

// Whether the expression is a length at all, tried against sizes of 1px.
function isLengthExpression(expression: string) {
  const unit = {
    width: 1,
    height: 1
  };
  const titleBar = {
    x: 1,
    y: 1,
    width: 1,
    height: 1
  };
  return resolveDynamicLength({
    expression,
    basis: {
      percent: 1,
      viewport: unit,
      container: unit,
      titleBar
    }
  }) !== null;
}

function dynamicLength(input: GroupInput) {
  const entries = DYNAMIC_MEMBERS.flatMap(member => {
    const reader = input.readers.get(member);
    const value = reader?.declaration.value ?? "";
    const isInvalid = reader !== undefined && !isLengthExpression(value);
    if (isInvalid) {
      reader.expectedToken({
        what: "a calc(), min(), max() or clamp() of lengths",
        token: value
      });
      return [];
    }

    return reader === undefined ? [] : [`${member.slice(DYNAMIC_PREFIX.length)}${ENTRY_SEPARATOR}${reader.declaration.value}`];
  });
  return [{
    kind: "write",
    target: DYNAMIC_TARGET,
    value: entries.join(XAML_SEPARATOR)
  } as const];
}

function isRecordValue(value: NativeValue): value is object {
  return typeof value === "object" && value !== null;
}

function sizeOf({ node, native }: {
  node: NativeValue;
  native: ContainerNative;
}) {
  return isRecordValue(node) ? sizeOfContainer({
    container: node,
    native
  }) : null;
}

// The sizes the units are of, read when the layout changes.
function basisFor({ context, axis }: {
  context: WriteContext;
  axis: string;
}) {
  const { control, native } = context;
  const parent = sizeOf({
    node: native.read({
      control,
      property: "parent"
    }),
    native
  });
  const root = native.read({
    control,
    property: "xamlRoot"
  });
  const size = isRecordValue(root) ? native.read({
    control: root,
    property: "size"
  }) : null;
  const width = isRecordValue(size) ? native.read({
    control: size,
    property: "width"
  }) : null;
  const height = isRecordValue(size) ? native.read({
    control: size,
    property: "height"
  }) : null;
  const isSized = typeof width === "number" && typeof height === "number";
  const viewport: Viewport | null = isSized ? {
    width,
    height
  } : null;
  const container = containerOf({
    control,
    name: "",
    native
  });
  return {
    percent: axis === "width" ? parent?.width ?? null : parent?.height ?? null,
    titleBar: native.titleBarOf?.(control) ?? null,
    viewport,
    container: container === null ? null : sizeOfContainer({
      container,
      native
    })
  } satisfies LengthBasis;
}

// Sets each property from its expression against the sizes now, and again when they change.
function applyDynamicLengths(context: WriteContext) {
  const { control, native } = context;
  function update() {
    for (const entry of context.value.split(XAML_SEPARATOR)) {
      const [property = "", expression = ""] = entry.split(ENTRY_SEPARATOR);
      const target = DYNAMIC_PROPERTIES.get(property);
      const pixels = target === undefined ? null : resolveDynamicLength({
        expression,
        basis: basisFor({
          context,
          axis: target.axis
        })
      });
      const canAssign = target !== undefined && pixels !== null;
      if (canAssign) {
        native.assign(control, { [target.control]: pixels });
      }
    }
  }

  update();
  const root = native.read({
    control,
    property: "xamlRoot"
  });
  const unsubscribers = [
    native.subscribe(control, "Loaded", update),
    ...[native.read({
      control,
      property: "parent"
    }), containerOf({
      control,
      name: "",
      native
    })].map(node => (isRecordValue(node) ? native.subscribe(node, "SizeChanged", update) : null)),
    isRecordValue(root) ? native.subscribe(root, "Changed", update) : null
  ];
  return () => {
    for (const unsubscribe of unsubscribers) {
      unsubscribe?.();
    }
  };
}

/** The group of the renamed properties: `calc()`, `min()`, `max()` and `clamp()` with %, vw, vh or container units. */
export function dynamicLengthGroups() {
  return [{
    members: DYNAMIC_MEMBERS,
    lower: dynamicLength,
    writes: {
      [DYNAMIC_TARGET]: applyDynamicLengths
    }
  } satisfies PropertyGroup];
}

/** The renamed property for a layout-dependent length, or null for any other declaration. */
export function dynamicPropertyOf(property: string) {
  return DYNAMIC_PROPERTIES.has(property) ? `${DYNAMIC_PREFIX}${property}` : null;
}
