import { emitComponent, emitLevel, emitMetadata } from "./emit.ts";
import type { ClassModel } from "./model.ts";
import { buildModel, SlotKind } from "./model.ts";
import { observedProperties, PropertyKind } from "./tables.ts";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const LOCK_PATH = path.join(import.meta.dirname, "..", "..", ".winapp", "winmds.lock.json");
const HAS_METADATA = existsSync(LOCK_PATH);

function levelOf({ name, ...overrides }: Partial<ClassModel> & { name: string }) {
  return {
    type: {
      namespace: "Microsoft.UI.Xaml.Controls",
      name
    },
    tag: name.toLowerCase(),
    parent: null,
    isComponent: true,
    contentProperty: null,
    declaresContent: false,
    properties: [],
    events: [],
    attached: [],
    bindables: [],
    observed: [],
    slots: [],
    holdsItems: false,
    ...overrides
  };
}

test("an observed property is a bound prop the control writes and the prop never writes back", () => {
  const level = levelOf({
    name: "Frame",
    observed: [{
      key: "canGoBack",
      winName: "CanGoBack",
      kind: PropertyKind.BOOLEAN,
      enumType: null,
      events: ["Navigated"]
    }]
  });
  const text = emitLevel(level);
  assert.match(text, /canGoBack\?: boolean \| undefined;/u);
  assert.match(text, /export type FrameBound = Pick<FrameProps, "canGoBack">;/u);
  assert.match(text, /link\.observed\(\{\n {4}bound,\n {4}key: "canGoBack",\n {4}read: \(\) => control\.canGoBack,/u);
  assert.match(text, /handler => control\.onNavigated\(handler\)/u);
  assert.doesNotMatch(text, /control\.canGoBack = /u);
  assert.match(emitComponent(level), /let \{ canGoBack = \$bindable\(\), class: className/u);
});

test("an observed enum is typed by its table and imports no converter", () => {
  const level = levelOf({
    name: "TwoPaneView",
    observed: [{
      key: "mode",
      winName: "Mode",
      kind: PropertyKind.ENUM,
      enumType: {
        namespace: "Microsoft.UI.Xaml.Controls",
        name: "TwoPaneViewMode"
      },
      events: ["ModeChanged"]
    }]
  });
  const text = emitLevel(level);
  assert.match(text, /mode\?: EnumInput<typeof TwoPaneViewMode> \| undefined;/u);
  assert.match(text, /import type \{ AttachedInput, ElementProps, EnumInput \} from "\.\.\/\.\.\/convert\.ts";/u);
  assert.doesNotMatch(text, /enumValue/u);
});

test("a class that is a collection of controls renders its children loose, in no property", () => {
  const level = levelOf({
    name: "SwipeItems",
    holdsItems: true
  });
  const component = emitComponent(level);
  assert.match(component, /let \{ children, class: className, style, \.\.\.rest \}/u);
  assert.match(component, /\{#if children\}\n {4}\{@render children\(\)\}\n {2}\{\/if\}/u);
  assert.doesNotMatch(component, /<property/u);
  assert.match(emitLevel(level), /children\?: Snippet;/u);
});

test("an attached slot is a prop that takes a snippet, filled through its owner", () => {
  const owner = {
    namespace: "Microsoft.UI.Xaml.Controls",
    name: "ToolTipService"
  };
  const level = levelOf({
    name: "Border",
    attached: [{
      key: "toolTip",
      owner,
      name: "ToolTip",
      setter: "setToolTip",
      isSlot: true,
      kind: PropertyKind.OBJECT,
      enumType: null,
      target: "UIElement"
    }],
    slots: [{
      key: "toolTip",
      winName: "ToolTip",
      kind: SlotKind.VALUE,
      elementName: "tool-tip-service.tool-tip"
    }]
  });
  assert.match(emitLevel(level), /toolTip\?: ObjectInput \| Snippet;/u);
  const component = emitComponent(level);
  assert.match(component, /import \{ Border, ToolTipService \} from "\.\/bindings\.ts";/u);
  assert.match(component, /registerControls\(\{ "border": Border, "tool-tip-service": ToolTipService \}\);/u);
  assert.match(component, /<property name="tool-tip-service\.tool-tip">\{@render rest\.toolTip\(\)\}<\/property>/u);
});

test("the metadata lists what a level observes", () => {
  const text = emitMetadata({
    classes: [levelOf({
      name: "ScrollViewer",
      observed: [{
        key: "verticalOffset",
        winName: "VerticalOffset",
        kind: PropertyKind.NUMBER,
        enumType: null,
        events: ["ViewChanged"]
      }]
    })],
    enums: [],
    owners: [],
    excluded: []
  });
  assert.match(text, /observed: \["verticalOffset"\],/u);
});

// The metadata is the one `pnpm restore` locked, so these need it.
test("every row of observedProperties is a read-only property of a component, with its event", { skip: !HAS_METADATA }, () => {
  const model = buildModel(LOCK_PATH);
  const names = model.classes.map(level => level.observed.map(entry => `${level.type.name}.${entry.winName}`));
  const found = names.flat();
  assert.deepEqual(found.sort(), [...observedProperties.keys()].sort());
  const navigationView = model.classes.find(level => level.type.name === "NavigationView");
  const isWritable = navigationView?.properties.some(property => property.key === "displayMode");
  assert.equal(isWritable, false, "it is read-only, so it is no writable prop");
});

test("the value objects are components, and a collection of them holds its children", { skip: !HAS_METADATA }, () => {
  const model = buildModel(LOCK_PATH);
  const find = (name: string) => model.classes.find(level => level.type.name === name);
  const names = ["SwipeItem", "SwipeItems", "MapIcon", "MapElementsLayer", "TextHighlighter", "RatingItemFontInfo", "RatingItemImageInfo"];
  for (const name of names) {
    assert.equal(find(name)?.isComponent, true, `${name} is a component`);
  }

  assert.equal(find("SwipeItems")?.holdsItems, true);
  assert.equal(find("SwipeItem")?.holdsItems, false);
});

test("a swipe control, a map, a text block and a rating control take the value objects by snippet", { skip: !HAS_METADATA }, () => {
  const model = buildModel(LOCK_PATH);
  const slots = (name: string) => model.classes.find(level => level.type.name === name)?.slots ?? [];
  const keys = (name: string) => slots(name).map(slot => slot.key);
  assert.deepEqual(keys("SwipeControl").sort(), ["bottomItems", "leftItems", "rightItems", "topItems"]);
  assert.ok(keys("MapControl").includes("layers"));
  assert.ok(keys("MapElementsLayer").includes("mapElements"));
  assert.equal(slots("TextBlock").find(slot => slot.key === "textHighlighters")?.kind, SlotKind.COLLECTION);
  assert.ok(keys("RichTextBlock").includes("textHighlighters"));
  assert.ok(keys("RatingControl").includes("itemInfo"));
});

test("the tool tip and the attached flyout are snippet slots of every element, set through their owners", { skip: !HAS_METADATA }, () => {
  const model = buildModel(LOCK_PATH);
  const slotOf = (level: string, key: string) => {
    const slots = model.classes.find(entry => entry.type.name === level)?.slots;
    return slots?.find(slot => slot.key === key);
  };
  assert.equal(slotOf("UIElement", "toolTip")?.elementName, "tool-tip-service.tool-tip");
  assert.equal(slotOf("FrameworkElement", "attachedFlyout")?.elementName, "flyout-base.attached-flyout");
  assert.equal(slotOf("UIElement", "toolTipPlacement"), undefined, "an attached property that holds no control is no slot");
});

test("the storyboard's target is set on every timeline", { skip: !HAS_METADATA }, () => {
  const model = buildModel(LOCK_PATH);
  const timeline = model.classes.find(level => level.type.name === "Timeline");
  assert.deepEqual(timeline?.attached.map(entry => entry.key).sort(), [
    "storyboardTarget",
    "storyboardTargetName",
    "storyboardTargetProperty"
  ]);
});
