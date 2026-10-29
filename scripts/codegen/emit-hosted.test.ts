import { emitComponent, emitDeclaration } from "./emit.ts";
import { SlotKind } from "./model.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

function classNamed({ name, contentProperty }: {
  name: string;
  contentProperty: string | null;
}) {
  return {
    type: {
      namespace: "Microsoft.UI.Xaml.Controls",
      name
    },
    tag: name.toLowerCase(),
    parent: null,
    isComponent: true,
    contentProperty,
    declaresContent: contentProperty !== null,
    properties: [],
    events: [],
    attached: [],
    bindables: [],
    slots: []
  };
}

function hosted(name: string) {
  return classNamed({
    name,
    contentProperty: "Items"
  });
}

for (const name of ["ListView", "GridView"]) {
  test(`${name} is generic over its items and hands the app the list handle`, () => {
    const component = emitComponent(hosted(name));
    assert.match(component, /<script generics="Item" lang="ts">/u);
    assert.match(
      component,
      /let \{ selectedKey = \$bindable\(\), selectedKeys = \$bindable\(\), handle = \$bindable\(\), class: className, style, \.\.\.rest \}/u
    );
    assert.match(component, /const bound = \{\n    get selectedKey\(\) \{\n      return selectedKey;\n    \},\n    set selectedKey\(next\) \{/u);
    assert.match(component, new RegExp(`ListComponentProps<Item, ${name}ComponentProps>`, "u"));
    assert.match(component, /attachItems\(\{ view: native, props: rest, selection: bound \}\)/u);
    assert.match(component, /handle = items\.handle;/u);
    assert.doesNotMatch(component, /children/u);
    assert.doesNotMatch(component, /attachRepeaterItems/u);
  });

  test(`${name} declares its props generic and typed as a ListComponent`, () => {
    const declaration = emitDeclaration(hosted(name));
    assert.match(declaration, new RegExp(`export type ${name}ComponentProps<Item = object> = ListComponentProps<Item, ${name}ControlProps>;`, "u"));
    assert.match(declaration, new RegExp(`declare const ${name}: ListComponent<${name}ControlProps>;`, "u"));
  });
}

for (const name of ["ItemsRepeater", "BreadcrumbBar"]) {
  test(`${name} attaches a repeater of slot elements and has no handle`, () => {
    const component = emitComponent(hosted(name));
    assert.match(component, /<script generics="Item" lang="ts">/u);
    assert.match(component, /attachRepeaterItems\(\{ owner: native, props: rest, kind: RepeaterElement\.SLOT \}\)/u);
    assert.match(component, /RepeaterComponentProps<Item, /u);
    assert.doesNotMatch(component, /handle|selection/u);
    assert.doesNotMatch(component, /children/u);
    assert.doesNotMatch(component, /attachItems/u);
  });

  test(`${name} declares its props generic and typed as a RepeaterComponent`, () => {
    const declaration = emitDeclaration(hosted(name));
    assert.match(declaration, new RegExp(`export type ${name}ComponentProps<Item = object> = RepeaterComponentProps<Item, ${name}ControlProps>;`, "u"));
    assert.match(declaration, new RegExp(`declare const ${name}: RepeaterComponent<${name}ControlProps>;`, "u"));
  });
}

test("ItemsView attaches a repeater whose elements are item containers", () => {
  const component = emitComponent(hosted("ItemsView"));
  assert.match(component, /kind: RepeaterElement\.ITEM_CONTAINER/u);
  assert.doesNotMatch(component, /handle/u);
  assert.doesNotMatch(component, /children/u);
  assert.match(emitDeclaration(hosted("ItemsView")), /declare const ItemsView: RepeaterComponent<ItemsViewControlProps>;/u);
});

test("TreeView renders none of the slots its host owns, and the others it keeps", () => {
  const tree = {
    ...hosted("TreeView"),
    slots: [
      {
        key: "rootNodes",
        winName: "RootNodes",
        kind: SlotKind.COLLECTION
      },
      {
        key: "selectedNode",
        winName: "SelectedNode",
        kind: SlotKind.VALUE
      },
      {
        key: "selectedNodes",
        winName: "SelectedNodes",
        kind: SlotKind.COLLECTION
      },
      {
        key: "contextFlyout",
        winName: "ContextFlyout",
        kind: SlotKind.VALUE
      }
    ]
  };
  const component = emitComponent(tree);
  assert.doesNotMatch(component, /rootNodes|selectedNode/u);
  assert.match(component, /<property name="contextFlyout">\{@render rest\.contextFlyout\(\)\}<\/property>/u);
});

test("TreeView is generic over its items, binds its selection and expanded keys, and has no handle", () => {
  const component = emitComponent(hosted("TreeView"));
  assert.match(component, /<script generics="Item" lang="ts">/u);
  assert.match(
    component,
    /let \{ selectedKey = \$bindable\(\), selectedKeys = \$bindable\(\), expandedKeys = \$bindable\(\), class: className, style, \.\.\.rest \}/u
  );
  assert.match(component, /get expandedKeys\(\) \{\n      return expandedKeys;/u);
  assert.match(component, /TreeComponentProps<Item, TreeViewComponentProps>/u);
  assert.match(component, /import \{ attachTree \} from "\.\.\/hand-written\/items\/tree-host\.svelte\.ts";/u);
  assert.match(component, /attachTree\(\{ view: native, props: rest, bound \}\)/u);
  assert.doesNotMatch(component, /handle|children|attachItems|attachRepeaterItems/u);
});

test("TreeView declares its props generic and typed as a TreeComponent", () => {
  const declaration = emitDeclaration(hosted("TreeView"));
  assert.match(declaration, /export type TreeViewComponentProps<Item = object> = TreeComponentProps<Item, TreeViewControlProps>;/u);
  assert.match(declaration, /declare const TreeView: TreeComponent<TreeViewControlProps>;/u);
});

test("a class that is not hosted keeps its children and has no generics", () => {
  const level = classNamed({
    name: "Button",
    contentProperty: "Content"
  });
  const component = emitComponent(level);
  assert.match(component, /<script lang="ts">/u);
  assert.match(component, /let \{ children, class: className, style, \.\.\.rest \}: ButtonComponentProps = \$props\(\);/u);
  assert.doesNotMatch(component, /generics|attachItems|attachRepeaterItems|handle/u);
  const declaration = emitDeclaration(level);
  assert.doesNotMatch(declaration, /Item = object|ListComponent|RepeaterComponent/u);
  assert.match(declaration, /declare const Button: Component<ButtonComponentProps/u);
});
