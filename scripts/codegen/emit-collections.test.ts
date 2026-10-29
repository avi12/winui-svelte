import { emitComponent, emitLevel } from "./emit.ts";
import { bindingClasses, buildModel, SlotKind } from "./model.ts";
import type { ClassModel } from "./model.ts";
import { createdCollections } from "./tables.ts";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const LOCK_PATH = path.join(import.meta.dirname, "..", "..", ".winapp", "winmds.lock.json");
const HAS_METADATA = existsSync(LOCK_PATH);
const TRANSITION_COLLECTION = {
  namespace: "Microsoft.UI.Xaml.Media.Animation",
  name: "TransitionCollection"
};

function classNamed(overrides: Partial<ClassModel>) {
  const level: ClassModel = {
    type: {
      namespace: "Microsoft.UI.Xaml.Controls",
      name: "Panel"
    },
    tag: "panel",
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
    registers: [],
    ...overrides
  };
  return level;
}

test("a slot with a created collection names its class's tag on the <property> element", () => {
  const component = emitComponent(
    classNamed({
      slots: [
        {
          key: "childrenTransitions",
          winName: "ChildrenTransitions",
          kind: SlotKind.COLLECTION,
          elementName: "childrenTransitions",
          collection: TRANSITION_COLLECTION
        }
      ]
    })
  );
  assert.match(
    component,
    /\{#if rest\.childrenTransitions\}\n\s+<property name="childrenTransitions" collection="transition-collection">/u
  );
});

test("a component that can be an item registers the collection class beside its own", () => {
  const component = emitComponent(
    classNamed({
      type: {
        namespace: "Microsoft.UI.Xaml.Media.Animation",
        name: "EntranceThemeTransition"
      },
      tag: "entrance-theme-transition",
      registers: [TRANSITION_COLLECTION]
    })
  );
  assert.match(component, /import \{ EntranceThemeTransition, TransitionCollection \} from "\.\/bindings\.ts";/u);
  assert.match(
    component,
    /registerControls\(\{ "entrance-theme-transition": EntranceThemeTransition, "transition-collection": TransitionCollection \}\);/u
  );
});

test("the transition collection properties are slots, and only transitions register the class", { skip: !HAS_METADATA }, () => {
  const model = buildModel(LOCK_PATH);
  function find(name: string) {
    return model.classes.find(level => level.type.name === name);
  }

  function slotOf({ level, winName }: {
    level: ClassModel | undefined;
    winName: string;
  }) {
    return level?.slots.find(slot => slot.winName === winName);
  }

  assert.equal(
    slotOf({
      level: find("UIElement"),
      winName: "Transitions"
    })?.collection?.name, "TransitionCollection"
  );
  assert.equal(
    slotOf({
      level: find("Panel"),
      winName: "ChildrenTransitions"
    })?.kind, SlotKind.COLLECTION
  );
  assert.equal(
    slotOf({
      level: find("ContentControl"),
      winName: "ContentTransitions"
    })?.collection?.name, "TransitionCollection"
  );
  assert.equal(
    slotOf({
      level: find("Border"),
      winName: "ChildTransitions"
    })?.collection?.name, "TransitionCollection"
  );
  assert.equal(
    slotOf({
      level: find("ItemsControl"),
      winName: "ItemContainerTransitions"
    })?.collection?.name, "TransitionCollection"
  );
  assert.deepEqual(find("EntranceThemeTransition")?.registers.map(type => type.name), ["TransitionCollection"]);
  assert.deepEqual(find("Button")?.registers, []);
  assert.doesNotMatch(emitComponent(find("Button") ?? classNamed({})), /TransitionCollection/u);
  assert.ok(bindingClasses(model).some(type => type.name === "TransitionCollection"));
  assert.match(emitLevel(find("Panel") ?? classNamed({})), /childrenTransitions\?: Snippet;/u);
  assert.equal(find("Panel")?.properties.some(property => property.winName === "ChildrenTransitions"), false);
});

test("every created collection names a property some class has", { skip: !HAS_METADATA }, () => {
  const model = buildModel(LOCK_PATH);
  const slotNames = new Set(model.classes.flatMap(level => level.slots.map(slot => slot.winName)));
  for (const name of createdCollections.keys()) {
    assert.ok(slotNames.has(name), `${name} is in createdCollections but no class has it as a slot`);
  }
});
