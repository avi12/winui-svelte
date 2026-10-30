import { checkCssEffects } from "./css-effects-behaviours.ts";
import { checkCssPrecedence } from "./css-precedence-behaviours.ts";
import type { Counts, Failure, Report } from "./mount-report.ts";
import SlotsFixture from "./Slots.fixture.svelte";
import { checkXamlBehaviours } from "./xaml-behaviours.svelte.ts";
import { unboxObject } from "@microsoft/dynwinrt";
import * as bindings from "#src/components/generated/bindings.js";
import type { LevelMetadata } from "#src/components/generated/metadata.js";
import { levels } from "#src/components/generated/metadata.js";
import ToggleSwitch from "#src/components/generated/ToggleSwitch.svelte";
import { installMedia } from "#src/components/media.js";
import { ticksDate } from "#src/components/values.js";
import { installXaml } from "#src/components/xaml.js";
import { installCss } from "#src/css/index.js";
import type { NativeValue } from "#src/native-value.js";
import { mountControl } from "#src/renderer/host/mount.svelte.js";
import { call, isRecord, read, vectorOf } from "#src/renderer/host/reflect.js";
import * as winui from "#src/winui.js";
import { DispatcherQueue } from "#winui/microsoft/ui/dispatching/DispatcherQueue";
import { Application } from "#winui/microsoft/ui/xaml/Application";
import { Window } from "#winui/microsoft/ui/xaml/Window";
import assert from "node:assert/strict";
import { appendFileSync } from "node:fs";
import { flushSync } from "svelte";

// The inside of the mount test (mount-all.ts): on the UI thread, every
// generated component is linked to a control it makes, first with no props
// and then with every property at the value it has, every event with a
// handler and every attached property, so a constructor, a property setter or
// an event subscription that throws is found. Then a few behaviours are
// checked: a bindable goes both ways, a changed prop is written again, and
// the conversions build what WinUI takes.

const offScreen = {
  x: -8000,
  y: 0,
  width: 700,
  height: 4000
};
const LAYOUT_MILLISECONDS = 1500;
const ticksPerMillisecond = 10_000n;
const ATTACHED_PREFIX = "set";
// WinUI refuses the composite transform properties (rotation, scale, …) on an
// element whose RenderTransform, its origin, Projection or Transform3D is in
// use, so the sweep, which writes back every default, leaves these out.
const renderTransformFamily = new Set(["renderTransform", "renderTransformOrigin", "projection", "transform3D"]);
// What WinUI refuses to be set on a control, which the sweep therefore leaves
// out: AnimatedVisualPlayer owns its visual, RichTextBlockOverflow takes its
// tab behaviour from its RichTextBlock, a WebView2 fails fast on being given
// its own manipulation mode, a brush drawn by the compositor takes
// no transform, and the layout reads its own default of no columns as invalid.
const compositeTransformFamily = ["centerPoint", "rotation", "rotationAxis", "scale", "transformMatrix"];
// Controls made, mounted and set like the rest, but WinUI fails fast (a native
// crash, no exception) when one is laid out in a plain panel: each draws
// itself for an owner that hands it its parts (a list view's item, a Pivot, a
// map), so the test does not place them.
const needsOwnerToLayOut = new Set([
  "GridViewItemPresenter",
  "ListViewItemPresenter",
  "MapControl",
  "PivotPanel",
  "RevealListViewItemPresenter",
  "WebView2",
  "WrapGrid"
]);
const compositionBrushTransforms = ["relativeTransform", "transform"];
const refusedByWinui = new Map<string, string[]>([
  ["AcrylicBrush", compositionBrushTransforms],
  ["RadialGradientBrush", compositionBrushTransforms],
  ["ColumnMajorUniformToLargestGridLayout", ["maxColumns"]],
  ["SvgImageSource", ["rasterizePixelHeight", "rasterizePixelWidth"]],
  ["WebView2", ["manipulationMode"]],
  ["AnimatedVisualPlayer", compositeTransformFamily],
  ["RichTextBlockOverflow", ["isTabStop", "tabIndex"]]
]);

// What the behaviour checks write and expect, named so a reader sees which
// number is the state's and which is the user's.
const SLIDER_FROM_STATE = 30;
const SLIDER_FROM_USER = 70;
// Typed as number: a literal type would make the second assertion on the same
// property a comparison TypeScript sees as never true.
const OPACITY_FIRST: number = 0.5;
const OPACITY_CHANGED: number = 0.25;
const BORDER_PADDING_SIDES = 8;
const BORDER_PADDING_ENDS = 4;
const BORDER_CORNER_RADIUS = 6;
const BORDER_WIDTH = 120;
const BORDER_GRID_ROW = 2;
const BORDER_CANVAS_LEFT = 7;
const HORIZONTAL_ALIGNMENT_CENTER = 1;
const ANIMATION_TICKS = 3_000_000n;
const BEGIN_TICKS = 1_000_000n;
const DURATION_TYPE_TIME_SPAN = 1;
const REPEAT_TYPE_FOREVER = 2;
const BOLD_WEIGHT = 700;
const POLYGON_POINT_COUNT = 3;
const DASH_COUNT = 2;
const SUGGESTION_COUNT = 2;
const SVG_TEXT = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"4\" height=\"4\"/>";
const PNG_BYTES = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="),
  character => character.charCodeAt(0)
);
const PICKED_DATE = new Date(Date.UTC(2020, 5, 15, 12));
const DATE_TOLERANCE_MILLISECONDS = 86_400_000;

type Linked = () => void;
type Connect = (control: object, props: object, bound: object) => Linked;

// Held until the process ends: a timer whose wrapper is collected stops.
// eslint-disable-next-line svelte/prefer-svelte-reactivity -- not component state
const heldTimers = new Set<object>();

// A native failure takes the process down without a message, so the last
// component started is written, synchronously, where this variable says.
const TRACE_FILE = process.env["WINUI_SVELTE_TRACE"];

function trace(line: string) {
  const isTracing = TRACE_FILE !== undefined;
  if (isTracing) {
    appendFileSync(TRACE_FILE, `${Date.now() % 1_000_000} ${line}\n`);
  }
}

function isConstructor(value: NativeValue): value is new () => object {
  return typeof value === "function";
}

function isElement(value: object): value is bindings.UIElement {
  return "opacity" in value && "margin" in value;
}

function isConnect(value: NativeValue): value is Connect {
  return typeof value === "function";
}

function chainOf(name: string) {
  const chain: LevelMetadata[] = [];
  let level: LevelMetadata | undefined = levels[name];
  for (; level !== undefined; level = level.parent === null ? undefined : levels[level.parent]) {
    chain.push(level);
  }

  return chain;
}

function componentNames() {
  return Object.entries(levels).filter(([, level]) => level.isComponent).map(([name]) => name);
}

async function loadConnectors() {
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- not component state
  const connectors = new Map<string, Connect>();
  for (const name of componentNames()) {
    const loaded: Record<string, NativeValue> = await import(`#src/components/generated/controls/${name}.svelte.js`);
    const connect = loaded[`connect${name}`];
    if (!isConnect(connect)) {
      throw new Error(`${name} has no connect${name}`);
    }

    connectors.set(name, connect);
  }

  return connectors;
}

// What a control would be given for each key: the value it has now (null
// ones are left out, as they have nothing to write back).
interface Sample {
  props: Record<string, NativeValue>;
  state: Record<string, NativeValue>;
  counts: Counts;
}

function emptySample() {
  const sample: Sample = {
    props: {},
    state: {},
    counts: {
      properties: 0,
      events: 0,
      attached: 0,
      bindables: 0
    }
  };
  return sample;
}

function attachedValue({ owner, setter, control }: {
  owner: string;
  setter: string;
  control: object;
}) {
  const getter = `get${setter.slice(ATTACHED_PREFIX.length)}`;
  const holder = read(bindings, owner);
  const method = read(holder, getter);
  return typeof method === "function" ? method.apply(holder, [control]) : undefined;
}

interface SampleSource {
  sample: Sample;
  level: LevelMetadata;
  control: object;
  isWanted: (key: string) => boolean;
}

function samplePropertiesOf({ sample, name, level, control, isWanted }: SampleSource & { name: string }) {
  for (const key of level.properties) {
    const value = read(control, key);
    const isBindable = level.bindables.includes(key);
    const isWritable = !renderTransformFamily.has(key) && !refusedByWinui.get(name)?.includes(key);
    const hasValue = value !== undefined && value !== null && isWanted(key) && isWritable;
    const isBoundValue = hasValue && isBindable;
    if (isBoundValue) {
      sample.state[key] = value;
      sample.counts.bindables++;
    } else if (hasValue) {
      sample.props[key] = value;
      sample.counts.properties++;
    }
  }
}

function sampleAttachedOf({ sample, level, control, isWanted }: SampleSource) {
  for (const [key, [owner, setter]] of Object.entries(level.attached).filter(([key]) => isWanted(key))) {
    const value = attachedValue({
      owner,
      setter,
      control
    });
    const isPresent = value !== undefined && value !== null;
    if (isPresent) {
      sample.props[key] = value;
      sample.counts.attached++;
    }
  }
}

function sampleOf({ name, control, only }: {
  name: string;
  control: object;
  only: ReadonlySet<string> | null;
}) {
  const sample = emptySample();
  function isWanted(key: string) {
    const isEverything = only === null;
    return isEverything || only.has(key);
  }

  for (const level of chainOf(name)) {
    samplePropertiesOf({
      sample,
      name,
      level,
      control,
      isWanted
    });
    for (const key of level.events.filter(isWanted)) {
      sample.props[key] = () => undefined;
      sample.counts.events++;
    }

    sampleAttachedOf({
      sample,
      level,
      control,
      isWanted
    });
  }

  return sample;
}

// The props the component gets, and the bindables as getters and setters over
// state the test holds, as the component's own destructuring would.
function boundOver({ state, name }: {
  state: Record<string, NativeValue>;
  name: string;
}) {
  const bound: Record<string, NativeValue> = {};
  for (const level of chainOf(name)) {
    for (const key of [...level.bindables, ...level.observed]) {
      Object.defineProperty(bound, key, {
        get: () => state[key],
        set(value) {
          state[key] = value;
        },
        enumerable: true
      });
    }
  }

  return bound;
}

function unlinkNothing() {}

interface Opening {
  connect: Connect;
  control: object;
  props: object;
  bound: object;
}

// Links the control inside an effect root, as the component's attachment
// would; what it returns ends the root and the subscriptions.
function open({ connect, control, props, bound }: Opening) {
  let unlink: Linked = unlinkNothing;
  const stop = $effect.root(() => {
    unlink = connect(control, props, bound);
  });
  return () => {
    stop();
    unlink();
  };
}

function link({ connect, name, control, sample }: {
  connect: Connect;
  name: string;
  control: object;
  sample: Sample;
}) {
  const close = open({
    connect,
    control,
    props: sample.props,
    bound: boundOver({
      state: sample.state,
      name
    })
  });
  try {
    flushSync();
  } finally {
    close();
  }
}

function describe(value: NativeValue) {
  const isObject = typeof value === "object" && value !== null;
  return isObject ? JSON.stringify(value, (_key, part) => typeof part === "bigint" ? String(part) : part) : String(value);
}

class Exercise {
  readonly failures: Failure[] = [];
  readonly exercised: Counts = {
    properties: 0,
    events: 0,
    attached: 0,
    bindables: 0
  };
  mounted = 0;
  private readonly panel: bindings.StackPanel;

  constructor(panel: bindings.StackPanel) {
    this.panel = panel;
  }

  private attempt({ name, step, action }: {
    name: string;
    step: string;
    action: () => void;
  }) {
    trace(`${name}: ${step}`);
    try {
      action();
      return true;
    } catch (error) {
      this.failures.push({
        name,
        step,
        message: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  component({ name, connect }: {
    name: string;
    connect: Connect;
  }) {
    trace(`${name}`);
    const controlClass = read(bindings, name);
    if (!isConstructor(controlClass)) {
      this.failures.push({
        name,
        step: "bindings",
        message: "the bindings export no class of this name"
      });
      return;
    }

    const holder: { control: object | null } = { control: null };
    this.attempt({
      name,
      step: "constructor",
      action() {
        holder.control = new controlClass();
      }
    });
    const made = holder.control;
    if (!made) {
      return;
    }

    const isLinked = this.attempt({
      name,
      step: "default props",
      action: () => link({
        connect,
        name,
        control: new controlClass(),
        sample: emptySample()
      })
    });
    // Every value is the control's own default, so an object it holds (its
    // resources, its transitions) goes back to the control that holds it.
    const sample = sampleOf({
      name,
      control: made,
      only: null
    });
    const isFull = this.attempt({
      name,
      step: "all props",
      action: () => link({
        connect,
        name,
        control: made,
        sample
      })
    });
    if (isFull) {
      this.exercised.properties += sample.counts.properties;
      this.exercised.events += sample.counts.events;
      this.exercised.attached += sample.counts.attached;
      this.exercised.bindables += sample.counts.bindables;
    } else {
      this.bisect({
        name,
        connect,
        controlClass,
        sample
      });
    }

    const isFullyMounted = isLinked && isFull;
    if (isFullyMounted) {
      this.mounted++;
    }

    const isPlaced = new RegExp(process.env["WINUI_SVELTE_PLACE"] ?? ".").test(name) && !needsOwnerToLayOut.has(name);
    // A text element (Run, Bold) is placed in a text block, not a panel.
    const canPlace = isPlaced && isElement(made);
    if (canPlace) {
      const element = made;
      this.attempt({
        name,
        step: "place in a panel",
        action: () => this.panel.children.append(element)
      });
    }
  }

  // Which key made the full mount fail: each one alone, and when every one
  // alone is fine, the smallest set that still fails together (the keys
  // dropped one at a time while it fails).
  private bisect({ name, connect, controlClass, sample }: {
    name: string;
    connect: Connect;
    controlClass: new () => object;
    sample: Sample;
  }) {
    const keys = [...Object.keys(sample.props), ...Object.keys(sample.state)];
    function fails(subset: string[]) {
      const control = new controlClass();
      try {
        link({
          connect,
          name,
          control,
          sample: sampleOf({
            name,
            control,
            only: new Set(subset)
          })
        });
        return false;
      } catch {
        return true;
      }
    }

    let isAnyAloneFailing = false;
    for (const key of keys) {
      const control = new controlClass();
      const isFine = this.attempt({
        name,
        step: `${key} = ${describe(sample.props[key] ?? sample.state[key])}`,
        action: () => link({
          connect,
          name,
          control,
          sample: sampleOf({
            name,
            control,
            only: new Set([key])
          })
        })
      });
      isAnyAloneFailing = isAnyAloneFailing || !isFine;
    }

    if (!isAnyAloneFailing) {
      let minimal = keys;
      for (const key of keys) {
        const without = minimal.filter(candidate => candidate !== key);
        if (fails(without)) {
          minimal = without;
        }
      }

      this.failures.push({
        name,
        step: "together",
        message: `these fail together, though each alone is fine: ${minimal.join(", ")}`
      });
    }
  }
}

function checkBehaviours({ connectors, failures }: {
  connectors: Map<string, Connect>;
  failures: Failure[];
}) {
  let count = 0;
  function check({ name, action }: {
    name: string;
    action: () => void;
  }) {
    count++;
    try {
      action();
    } catch (error) {
      failures.push({
        name: `behaviour: ${name}`,
        step: "check",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  function connectorFor(name: string) {
    const connect = connectors.get(name);
    const isUnknown = connect === undefined;
    if (isUnknown) {
      throw new Error(`no component ${name}`);
    }

    return connect;
  }

  check({
    name: "a bindable goes both ways (ToggleSwitch.isOn)",
    action() {
      const toggle = new bindings.ToggleSwitch();
      const state = $state<Record<string, NativeValue>>({ isOn: true });
      const close = open({
        connect: connectorFor("ToggleSwitch"),
        control: toggle,
        props: {},
        bound: boundOver({
          state,
          name: "ToggleSwitch"
        })
      });
      flushSync();
      assert.ok(toggle.isOn, "the state's true did not reach the switch");
      toggle.isOn = false;
      assert.ok(state["isOn"] === false, "the user's flip did not reach the state");
      state["isOn"] = true;
      flushSync();
      assert.ok(toggle.isOn, "the state's change did not reach the switch");
      close();
    }
  });

  check({
    name: "a bindable number goes both ways (Slider.value)",
    action() {
      const slider = new bindings.Slider();
      const state = $state<Record<string, NativeValue>>({ value: SLIDER_FROM_STATE });
      const close = open({
        connect: connectorFor("Slider"),
        control: slider,
        props: {},
        bound: boundOver({
          state,
          name: "Slider"
        })
      });
      flushSync();
      assert.ok(slider.value === SLIDER_FROM_STATE, "the state's value did not reach the slider");
      slider.value = SLIDER_FROM_USER;
      assert.ok(state["value"] === SLIDER_FROM_USER, "the user's value did not reach the state");
      close();
    }
  });

  check({
    name: "a boolean-or-null bindable is written (CheckBox.isChecked)",
    action() {
      const box = new bindings.CheckBox();
      const state = $state<Record<string, NativeValue>>({ isChecked: true });
      const close = open({
        connect: connectorFor("CheckBox"),
        control: box,
        props: {},
        bound: boundOver({
          state,
          name: "CheckBox"
        })
      });
      flushSync();
      assert.ok(box.isChecked === true, `the state's true did not reach the box (it reads ${String(box.isChecked)})`);
      close();
    }
  });

  check({
    name: "an observed property holds the control's value as soon as it is linked (NavigationView.displayMode, TextBlock.isTextTrimmed)",
    action() {
      const view = new bindings.NavigationView();
      const text = new bindings.TextBlock();
      const viewState = $state<Record<string, NativeValue>>({});
      const textState = $state<Record<string, NativeValue>>({});
      const closeView = open({
        connect: connectorFor("NavigationView"),
        control: view,
        props: {},
        bound: boundOver({
          state: viewState,
          name: "NavigationView"
        })
      });
      const closeText = open({
        connect: connectorFor("TextBlock"),
        control: text,
        props: {},
        bound: boundOver({
          state: textState,
          name: "TextBlock"
        })
      });
      flushSync();
      assert.ok(typeof viewState["displayMode"] === "number", "the display mode did not reach the state");
      assert.ok(viewState["displayMode"] === view.displayMode, "the state is not the control's display mode");
      assert.ok(textState["isTextTrimmed"] === false, "the text block's trimming did not reach the state");
      closeView();
      closeText();
    }
  });

  check({
    name: "a changed prop is written again (Border.opacity)",
    action() {
      const border = new bindings.Border();
      const props = $state<Record<string, NativeValue>>({ opacity: OPACITY_FIRST });
      const close = open({
        connect: connectorFor("Border"),
        control: border,
        props,
        bound: {}
      });
      flushSync();
      assert.ok(border.opacity === OPACITY_FIRST, "the first value was not written");
      props["opacity"] = OPACITY_CHANGED;
      flushSync();
      assert.ok(border.opacity === OPACITY_CHANGED, "the changed value was not written");
      close();
    }
  });

  check({
    name: "an event prop is called (ToggleSwitch.onToggled)",
    action() {
      const toggle = new bindings.ToggleSwitch();
      let calls = 0;
      function onToggled() {
        calls++;
      }

      const close = open({
        connect: connectorFor("ToggleSwitch"),
        control: toggle,
        props: {
          onToggled
        },
        bound: {}
      });
      flushSync();
      toggle.isOn = true;
      assert.ok(calls === 1, `the handler was called ${calls} times, not once`);
      close();
    }
  });

  check({
    name: "conversions build what WinUI takes (Border)",
    action() {
      const border = new bindings.Border();
      const props = {
        padding: [BORDER_PADDING_SIDES, BORDER_PADDING_ENDS],
        cornerRadius: BORDER_CORNER_RADIUS,
        background: "#336699",
        horizontalAlignment: "Center",
        width: BORDER_WIDTH,
        gridRow: BORDER_GRID_ROW,
        attached: [bindings.Canvas, "Left", BORDER_CANVAS_LEFT]
      };
      const close = open({
        connect: connectorFor("Border"),
        control: border,
        props,
        bound: {}
      });
      flushSync();
      const isPaddingOnSides = border.padding.left === BORDER_PADDING_SIDES;
      const isPaddingOnEnds = border.padding.top === BORDER_PADDING_ENDS;
      const isPaddingFromTwoNumbers = isPaddingOnSides && isPaddingOnEnds;
      assert.ok(isPaddingFromTwoNumbers, "padding [8, 4] is not left/right 8, top/bottom 4");
      assert.ok(border.cornerRadius.topLeft === BORDER_CORNER_RADIUS, "cornerRadius 6 is not 6 on every corner");
      assert.ok(border.horizontalAlignment === HORIZONTAL_ALIGNMENT_CENTER, "horizontalAlignment Center is not 1");
      assert.ok(border.width === BORDER_WIDTH, "width was not written");
      assert.ok(bindings.Grid.getRow(border) === BORDER_GRID_ROW, "gridRow 2 did not reach Grid.Row");
      assert.ok(bindings.Canvas.getLeft(border) === BORDER_CANVAS_LEFT, "attached Canvas.Left 7 did not reach Canvas.Left");
      assert.ok(border.background !== null, "the background color made no brush");
      close();
    }
  });

  function checkProps({ name, component, control, props, verify }: {
    name: string;
    component: string;
    control: object;
    props: object;
    verify: () => void;
  }) {
    check({
      name,
      action() {
        const close = open({
          connect: connectorFor(component),
          control,
          props,
          bound: {}
        });
        try {
          flushSync();
          verify();
        } finally {
          close();
        }
      }
    });
  }

  const animation = new bindings.DoubleAnimation();
  checkProps({
    name: "a duration text is a time span (DoubleAnimation.duration)",
    component: "DoubleAnimation",
    control: animation,
    props: {
      duration: "0.3s"
    },
    verify() {
      assert.ok(animation.duration.timeSpan.duration === ANIMATION_TICKS, "duration \"0.3s\" is not 3,000,000 ticks");
      assert.ok(animation.duration.type === DURATION_TYPE_TIME_SPAN, "duration \"0.3s\" is not a time span");
    }
  });
  const repeating = new bindings.DoubleAnimation();
  checkProps({
    name: "a repeat text is a repeat behavior (DoubleAnimation.repeatBehavior)",
    component: "DoubleAnimation",
    control: repeating,
    props: {
      repeatBehavior: "forever"
    },
    verify() {
      assert.ok(repeating.repeatBehavior.type === REPEAT_TYPE_FOREVER, "repeatBehavior \"forever\" is not Forever");
    }
  });
  const delayed = new bindings.DoubleAnimation();
  checkProps({
    name: "a nullable time span text is written (DoubleAnimation.beginTime)",
    component: "DoubleAnimation",
    control: delayed,
    props: {
      beginTime: "100ms"
    },
    verify() {
      assert.ok(delayed.beginTime?.duration === BEGIN_TICKS, "beginTime \"100ms\" did not reach the animation");
    }
  });
  const block = new bindings.TextBlock();
  checkProps({
    name: "a font weight name is a weight (TextBlock.fontWeight)",
    component: "TextBlock",
    control: block,
    props: {
      fontWeight: "bold"
    },
    verify() {
      assert.ok(block.fontWeight.weight === BOLD_WEIGHT, "fontWeight \"bold\" is not 700");
    }
  });
  const polygon = new bindings.Polygon();
  checkProps({
    name: "text of coordinate pairs is a point collection (Polygon.points)",
    component: "Polygon",
    control: polygon,
    props: {
      points: "0,0 10,0 10,10"
    },
    verify() {
      assert.ok(
        sizeOf({
          control: polygon,
          property: "points"
        }) === POLYGON_POINT_COUNT, "points \"0,0 10,0 10,10\" are not three points"
      );
    }
  });
  const rectangle = new bindings.Rectangle();
  checkProps({
    name: "an array of numbers is a double collection (Rectangle.strokeDashArray)",
    component: "Rectangle",
    control: rectangle,
    props: {
      strokeDashArray: [4, 2]
    },
    verify() {
      assert.ok(
        sizeOf({
          control: rectangle,
          property: "strokeDashArray"
        }) === DASH_COUNT, "strokeDashArray [4, 2] is not two numbers"
      );
    }
  });
  const suggest = new bindings.AutoSuggestBox();
  checkProps({
    name: "an array is a collection of boxed items (AutoSuggestBox.itemsSource)",
    component: "AutoSuggestBox",
    control: suggest,
    props: {
      itemsSource: ["one", "two"]
    },
    verify() {
      const items = bindings.IVector_Object.from(read(suggest, "itemsSource"));
      assert.ok(items.size === SUGGESTION_COUNT, "itemsSource [\"one\", \"two\"] is not a collection of two");
    }
  });
  const path = new bindings.Path();
  checkProps({
    name: "path data makes a geometry (Path.data)",
    component: "Path",
    control: path,
    props: {
      data: "M0,0 L10,10"
    },
    verify() {
      assert.ok(path.data !== null, "the path data made no geometry");
    }
  });

  check({
    name: "an .svg source string makes an SvgImageSource (Image.source)",
    action() {
      const image = new bindings.Image();
      const close = open({
        connect: connectorFor("Image"),
        control: image,
        props: {
          source: "ms-appx:///Assets/missing.svg"
        },
        bound: {}
      });
      flushSync();
      const source = bindings.projectAs(image.source, bindings.SvgImageSource);
      assert.ok(source.uriSource.absoluteUri.endsWith(".svg"), "the source is not an SVG image of that URI");
      close();
    }
  });

  check({
    name: "SVG bytes make an SvgImageSource, other bytes a BitmapImage (Image.source)",
    action() {
      const svgImage = new bindings.Image();
      const bitmapImage = new bindings.Image();
      const closeSvg = open({
        connect: connectorFor("Image"),
        control: svgImage,
        props: {
          source: new TextEncoder().encode(SVG_TEXT)
        },
        bound: {}
      });
      const closeBitmap = open({
        connect: connectorFor("Image"),
        control: bitmapImage,
        props: {
          source: PNG_BYTES
        },
        bound: {}
      });
      flushSync();
      assert.ok(
        bindings.projectAs(svgImage.source, bindings.SvgImageSource) !== null,
        "SVG bytes made no SvgImageSource"
      );
      assert.ok(
        bindings.projectAs(bitmapImage.source, bindings.BitmapImage) !== null,
        "PNG bytes made no BitmapImage"
      );
      closeSvg();
      closeBitmap();
    }
  });

  const player = new bindings.MediaPlayerElement();
  checkProps({
    name: "a URI string makes a MediaSource (MediaPlayerElement.source)",
    component: "MediaPlayerElement",
    control: player,
    props: {
      source: "https://example.com/clip.mp4"
    },
    verify() {
      assert.ok(read(player, "source") !== null, "the URI made no media source");
    }
  });

  check({
    name: "a bindable date reaches the picker (DatePicker.date)",
    action() {
      const picker = new bindings.DatePicker();
      const state = $state<Record<string, NativeValue>>({ date: PICKED_DATE });
      const close = open({
        connect: connectorFor("DatePicker"),
        control: picker,
        props: {},
        bound: boundOver({
          state,
          name: "DatePicker"
        })
      });
      flushSync();
      const shown = ticksDate(picker.date.universalTime);
      const isNearPicked = Math.abs(shown.getTime() - PICKED_DATE.getTime()) < DATE_TOLERANCE_MILLISECONDS;
      assert.ok(isNearPicked, `the state's Date reached the picker as ${shown.toISOString()}`);
      close();
    }
  });

  check({
    name: "a string is boxed for an object property (Button.content)",
    action() {
      const button = new bindings.Button();
      const close = open({
        connect: connectorFor("Button"),
        control: button,
        props: {
          content: "OK"
        },
        bound: {}
      });
      flushSync();
      assert.ok(button.content !== null, "the content was not written");
      close();
    }
  });

  checkXamlBehaviours({
    check,
    checkProps
  });
  checkCssEffects({ check });
  checkCssPrecedence({ check });
  return count;
}

function statistics() {
  const all = Object.values(levels);
  const totals = {
    properties: 0,
    events: 0,
    attached: 0,
    bindables: 0
  };
  for (const level of all) {
    totals.properties += level.properties.length;
    totals.events += level.events.length;
    totals.attached += Object.keys(level.attached).length;
    totals.bindables += level.bindables.length;
  }

  return {
    components: componentNames().length,
    ...totals
  } satisfies Pick<Report, "components" | "properties" | "events" | "attached" | "bindables">;
}

function launch({ connectors, report, throughRenderer }: {
  connectors: Map<string, Connect>;
  report: (result: Report) => void;
  throughRenderer: ReadonlyArray<(failures: Failure[]) => void>;
}) {
  const panel = new bindings.StackPanel();
  const window = new Window();
  window.content = panel;
  const exercise = new Exercise(panel);
  const only = new RegExp(process.env["WINUI_SVELTE_ONLY"] ?? ".");
  for (const [name, connect] of connectors) {
    if (only.test(name)) {
      exercise.component({
        name,
        connect
      });
    }
  }

  trace("behaviours");
  const behaviours = checkBehaviours({
    connectors,
    failures: exercise.failures
  }) + throughRenderer.length;
  for (const check of throughRenderer) {
    check(exercise.failures);
  }
  trace("show");
  window.appWindow.moveAndResize(offScreen);
  window.appWindow.showWithActivation(false);
  trace("shown");
  // Let WinUI measure and arrange what was placed before the verdict.
  const timer = DispatcherQueue.getForCurrentThread().createTimer();
  timer.interval = { duration: BigInt(LAYOUT_MILLISECONDS) * ticksPerMillisecond };
  timer.isRepeating = false;
  timer.onTick(() => {
    const result: Report = {
      ...statistics(),
      mounted: exercise.mounted,
      exercised: exercise.exercised,
      behaviours,
      failures: exercise.failures
    };
    report(result);
    Application.current.exit();
  });
  heldTimers.add(timer);
  timer.start();
}

// A generated .svelte component through the renderer, as an app would use it.
function checkComponentThroughRenderer(failures: Failure[]) {
  try {
    let toggles = 0;
    const mounted = mountControl({
      component: ToggleSwitch,
      props: {
        isOn: true,
        header: "Hi",
        onToggled() {
          toggles++;
        }
      }
    });
    const isSwitchOn = read(mounted.root, "isOn") === true;
    if (!isSwitchOn) {
      throw new Error("<ToggleSwitch isOn> did not turn the switch on");
    }

    mounted.set({ isOn: false });

    const isSwitchOff = read(mounted.root, "isOn") === false;
    if (!isSwitchOff) {
      throw new Error("a changed isOn prop did not reach the switch");
    }

    const hasHandlerRun = toggles !== 0;
    if (!hasHandlerRun) {
      throw new Error("onToggled was not called when the prop turned the switch off");
    }
  } catch (error) {
    failures.push({
      name: "behaviour: ToggleSwitch.svelte through the renderer",
      step: "check",
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

// What the slots fixture's control of one name holds when the check runs.
interface SlotExpectation {
  name: string;
  what: string;
  isMet: (control: object) => boolean;
}

function sizeOf({ control, property }: {
  control: object;
  property: string;
}) {
  return read(vectorOf(read(control, property)), "size");
}

function menuItemCountOf(button: object) {
  const flyout = read(button, "flyout");
  const menu = isRecord(flyout) ? bindings.projectAs(flyout, bindings.MenuFlyout) : null;
  return menu?.items?.size ?? 0;
}

// The panel's first visual state group as "group/state/triggers/setters".
function stateSummaryOf(control: NativeValue) {
  const groups = vectorOf(call(bindings.VisualStateManager, "getVisualStateGroups", control));
  const group = call(groups, "getAt", 0);
  const state = call(vectorOf(read(group, "states")), "getAt", 0);
  const sizes = ["stateTriggers", "setters"].map(property => String(read(read(state, property), "size")));
  return [read(group, "name"), read(state, "name"), ...sizes].join("/");
}

function highlightRangeCountOf(textBlock: object) {
  const highlighters = vectorOf(read(textBlock, "textHighlighters"));
  const isOne = read(highlighters, "size") === 1;
  return isOne ? read(read(call(highlighters, "getAt", 0), "ranges"), "size") : 0;
}

function pageLabelOf(navigator: object) {
  const page = bindings.projectAs(read(navigator, "content"), bindings.TextBlock);
  return page.text;
}

function stopCountOf(border: object) {
  const brush = bindings.projectAs(read(border, "background"), bindings.LinearGradientBrush);
  return brush.gradientStops.size;
}

function firstRootChildCountOf(tree: object) {
  const first = bindings.projectAs(call(read(tree, "rootNodes"), "getAt", 0), bindings.TreeViewNode);
  return first.children?.size ?? 0;
}

const slotsAtFirst: SlotExpectation[] = [
  {
    name: "comboBox",
    what: "the items written with {#each} are the combo box's items",
    isMet: control => sizeOf({
      control,
      property: "items"
    }) === 2
  },
  {
    name: "gradientBorder",
    what: "a brush in the background snippet holds its stops",
    isMet: control => stopCountOf(control) === 2
  },
  {
    name: "rotatedBorder",
    what: "a transform in the renderTransform snippet is the render transform",
    isMet: control => bindings.projectAs(read(control, "renderTransform"), bindings.RotateTransform).angle === 45
  },
  {
    name: "transitionPanel",
    what: "transitions in the childrenTransitions and transitions snippets fill collections made for the null properties",
    isMet: control => sizeOf({
      control,
      property: "childrenTransitions"
    }) === 2 && sizeOf({
      control,
      property: "transitions"
    }) === 1
  },
  {
    name: "navigator",
    what: "the navigator shows the page it was navigated to",
    isMet: control => pageLabelOf(control) === "First"
  },
  {
    name: "readyNavigator",
    what: "a page navigated to from onReady, while the control is being attached, is shown",
    isMet: control => pageLabelOf(control) === "Ready"
  },
  {
    name: "storyboard",
    what: "the animation is a child of the storyboard, which no panel holds",
    isMet: control => sizeOf({
      control,
      property: "children"
    }) === 1
  },
  {
    name: "splitView",
    what: "the pane snippet fills Pane, the children Content",
    isMet: control => isRecord(read(control, "pane")) && isRecord(read(control, "content"))
  },
  {
    name: "commandBar",
    what: "the children are the primary commands, an empty snippet adds no secondary one",
    isMet: control => sizeOf({
      control,
      property: "primaryCommands"
    }) === 1 && sizeOf({
      control,
      property: "secondaryCommands"
    }) === 0
  },
  {
    name: "navigationView",
    what: "the menuItems snippet fills MenuItems",
    isMet: control => sizeOf({
      control,
      property: "menuItems"
    }) === 1
  },
  {
    name: "textBlock",
    what: "text and an inline element are the inlines, spaced as a browser shows them",
    isMet: control => read(control, "text") === "Hello bold world"
  },
  {
    name: "button",
    what: "the flyout snippet fills Flyout, the flyout's children its items",
    isMet: control => menuItemCountOf(control) === 2
  },
  {
    name: "flyout",
    what: "a flyout among a panel's children is closed while open is false",
    isMet: control => read(control, "isOpen") === false
  },
  {
    name: "dialog",
    what: "a dialog among a panel's children holds its text as content",
    isMet: control => unboxObject(read(control, "content")) === "Sure?"
  },
  {
    name: "toggleSwitch",
    what: "the children are the header",
    isMet: control => unboxObject(read(control, "header")) === "Wi-Fi"
  },
  {
    name: "richTextBlock",
    what: "a paragraph is a block, a control in it an InlineUIContainer",
    isMet: control => sizeOf({
      control,
      property: "blocks"
    }) === 1
  },
  {
    name: "swipeControl",
    what: "the leftItems snippet fills LeftItems with the swipe items written in it",
    isMet: control => sizeOf({
      control,
      property: "leftItems"
    }) === 2
  },
  {
    name: "highlightedText",
    what: "the textHighlighters snippet adds a highlighter that holds its range",
    isMet: control => highlightRangeCountOf(control) === 1
  },
  {
    name: "ratingControl",
    what: "the itemInfo snippet fills ItemInfo",
    isMet: control => isRecord(read(control, "itemInfo"))
  },
  {
    name: "tipButton",
    what: "the toolTip snippet is the tool tip",
    isMet: control => isRecord(
      attachedValue({
        owner: "ToolTipService",
        setter: "setToolTip",
        control
      })
    )
  },
  {
    name: "groupedList",
    what: "the groupStyle snippet adds its group style to the list",
    isMet: control => sizeOf({
      control,
      property: "groupStyle"
    }) === 1
  },
  {
    name: "stateGrid",
    what: "VisualStateGroups fills the panel's visual state groups with a named group, state, trigger and setter",
    isMet: control => stateSummaryOf(control) === "Sizes/Wide/1/1"
  },
  {
    name: "mapControl",
    what: "the layers snippet adds its layer to the map",
    isMet: control => sizeOf({
      control,
      property: "layers"
    }) === 1
  },
  {
    name: "treeView",
    what: "the items are the root nodes, and an expanded key has its children made",
    isMet: control => sizeOf({
      control,
      property: "rootNodes"
    }) === 1 && firstRootChildCountOf(control) === 1
  }
];

const slotsWhenShown: SlotExpectation[] = [
  {
    name: "navigator",
    what: "a second navigation replaces the page in the control",
    isMet: control => pageLabelOf(control) === "Second"
  },
  {
    name: "flyout",
    what: "a flyout asked to open before its element is on screen waits for it instead of failing",
    isMet: control => read(control, "isOpen") === false
  },
  {
    name: "comboBox",
    what: "an item added by a block is an item",
    isMet: control => sizeOf({
      control,
      property: "items"
    }) === 3
  },
  {
    name: "commandBar",
    what: "a command the snippet adds is a secondary command",
    isMet: control => sizeOf({
      control,
      property: "secondaryCommands"
    }) === 1
  },
  {
    name: "navigationView",
    what: "an item the snippet adds is a menu item",
    isMet: control => sizeOf({
      control,
      property: "menuItems"
    }) === 2
  },
  {
    name: "treeView",
    what: "an item added to the items is a root node, the others stay",
    isMet: control => sizeOf({
      control,
      property: "rootNodes"
    }) === 2 && firstRootChildCountOf(control) === 1
  }
];

function unmetSlots({ controls, expectations }: {
  controls: ReadonlyMap<string, object>;
  expectations: SlotExpectation[];
}) {
  return expectations.filter(expectation => {
    const control = controls.get(expectation.name);
    return control === undefined || !expectation.isMet(control);
  });
}

// Children and snippet props through the renderer: each fills the property
// it stands for, and what a snippet stops rendering leaves it again.
function checkSlotsThroughRenderer(failures: Failure[]) {
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- not component state
  const controls = new Map<string, object>();
  const phases: Array<{
    isShown: boolean;
    expectations: SlotExpectation[];
  }> = [
    {
      isShown: false,
      expectations: slotsAtFirst
    },
    {
      isShown: true,
      expectations: slotsWhenShown
    },
    {
      isShown: false,
      expectations: slotsAtFirst
    }
  ];
  try {
    const mounted = mountControl({
      component: SlotsFixture,
      props: {
        isShown: false,
        onFound({ name, native }: {
          name: string;
          native: object;
        }) {
          controls.set(name, native);
        }
      }
    });
    for (const { isShown, expectations } of phases) {
      mounted.set({ isShown });
      for (const unmet of unmetSlots({
        controls,
        expectations
      })) {
        failures.push({
          name: `behaviour: slots of ${unmet.name}`,
          step: isShown ? "shown" : "hidden",
          message: unmet.what
        });
      }
    }

    mounted.unmount();
  } catch (error) {
    failures.push({
      name: "behaviour: slots through the renderer",
      step: "mount",
      message: error instanceof Error ? String(error.stack) : String(error)
    });
  }
}

export async function run(report: (result: Report) => void) {
  trace("loading");
  const connectors = await loadConnectors();
  trace("loaded");
  await Application.startScheduled(() => {
    Application.create(() => {
      installCss(winui);
      installXaml();
      installMedia();
      launch({
        connectors,
        report,
        throughRenderer: [checkComponentThroughRenderer, checkSlotsThroughRenderer]
      });
    });
  });
}
