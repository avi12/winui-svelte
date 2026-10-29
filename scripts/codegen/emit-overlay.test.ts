import { emitComponent, emitDeclaration } from "./emit.ts";
import { OverlayHost, overlayHosted } from "./tables.ts";
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
    slots: [],
    registers: []
  };
}

const flyouts = [...overlayHosted].filter(([, kind]) => kind === OverlayHost.FLYOUT).map(([name]) => name);

test("ContentDialog binds open, keeps its children and connects the dialog host", () => {
  const level = classNamed({
    name: "ContentDialog",
    contentProperty: "Content"
  });
  const component = emitComponent(level);
  assert.match(component, /<script lang="ts">/u);
  assert.match(component, /let \{ open = \$bindable\(\), children, class: className, style, \.\.\.rest \}/u);
  assert.match(component, /: DialogOverlayComponentProps<ContentDialogComponentProps> = \$props\(\);/u);
  assert.match(component, /get open\(\) \{\n {6}return open;/u);
  assert.match(component, /function connect\(placed: PlacedControl<ContentDialog>\)/u);
  assert.match(component, /connectContentDialog\(placed\.control, rest, bound\)/u);
  assert.match(component, /attachDialog\(\{ placed, props: rest, bound \}\)/u);
  assert.match(component, /overlay\.dispose\(\);/u);
  assert.match(component, /\{@attach placedControl\(\(placed: PlacedControl<ContentDialog>\) => untrack\(\(\) => connect\(placed\)\)\)\}/u);
  assert.match(component, /import \{ attachmentsOf, placedControl, registerControls \} from "\.\.\/runtime\.ts";/u);
  assert.doesNotMatch(component, /generics|attachFlyout|attachItems/u);
});

test("ContentDialog declares open as its binding and takes onResult", () => {
  const declaration = emitDeclaration(
    classNamed({
      name: "ContentDialog",
      contentProperty: "Content"
    })
  );
  assert.match(declaration, /export type ContentDialogComponentProps = DialogOverlayComponentProps<ContentDialogControlProps>;/u);
  assert.match(declaration, /declare const ContentDialog: Component<ContentDialogComponentProps, Record<string, never>, "open">;/u);
});

for (const name of flyouts) {
  test(`${name} binds open and connects the flyout host`, () => {
    const component = emitComponent(
      classNamed({
        name,
        contentProperty: null
      })
    );
    assert.match(component, /let \{ open = \$bindable\(\), class: className, style, \.\.\.rest \}/u);
    assert.match(component, new RegExp(`: FlyoutOverlayComponentProps<${name}ComponentProps> = \\$props\\(\\);`, "u"));
    assert.match(component, /attachFlyout\(\{ placed, props: rest, bound \}\)/u);
    assert.doesNotMatch(component, /attachDialog/u);
  });

  test(`${name} declares open as its binding`, () => {
    const declaration = emitDeclaration(
      classNamed({
        name,
        contentProperty: null
      })
    );
    assert.match(declaration, new RegExp(`export type ${name}ComponentProps = FlyoutOverlayComponentProps<${name}ControlProps>;`, "u"));
    assert.match(declaration, new RegExp(`declare const ${name}: Component<${name}ComponentProps, Record<string, never>, "open">;`, "u"));
  });
}

test("a class that opens from no state is a plain component", () => {
  const level = classNamed({
    name: "Button",
    contentProperty: "Content"
  });
  const component = emitComponent(level);
  assert.doesNotMatch(component, /open|placedControl|PlacedControl|Overlay/u);
  assert.match(component, /import \{ attachmentsOf, control, registerControls \} from "\.\.\/runtime\.ts";/u);
  assert.doesNotMatch(emitDeclaration(level), /Overlay|"open"/u);
});
