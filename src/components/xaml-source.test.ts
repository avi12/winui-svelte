import { loadableXaml, XamlKind } from "./xaml-source.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const PRESENTATION = "http://schemas.microsoft.com/winfx/2006/xaml/presentation";
const KEYWORDS = "http://schemas.microsoft.com/winfx/2006/xaml";

test("a root without namespaces gets WinUI's two", () => {
  const xaml = loadableXaml({
    kind: XamlKind.CONTROL_TEMPLATE,
    xaml: "<ControlTemplate TargetType=\"Button\"><Border/></ControlTemplate>"
  });
  assert.equal(
    xaml,
    `<ControlTemplate xmlns="${PRESENTATION}" xmlns:x="${KEYWORDS}" TargetType="Button"><Border/></ControlTemplate>`
  );
});

test("a namespace the root declares is kept, and only the other is added", () => {
  const xaml = loadableXaml({
    kind: XamlKind.DATA_TEMPLATE,
    xaml: `<DataTemplate xmlns="${PRESENTATION}"><TextBlock Text="{Binding}"/></DataTemplate>`
  });
  assert.equal(
    xaml,
    `<DataTemplate xmlns:x="${KEYWORDS}" xmlns="${PRESENTATION}"><TextBlock Text="{Binding}"/></DataTemplate>`
  );
});

test("a root with both namespaces is passed on as it is", () => {
  const written = `<ResourceDictionary xmlns="${PRESENTATION}" xmlns:x="${KEYWORDS}"/>`;
  const loadable = loadableXaml({
    kind: XamlKind.RESOURCE_DICTIONARY,
    xaml: written
  });
  assert.equal(loadable, written);
});

test("an XML declaration and comments before the root are kept", () => {
  const xaml = loadableXaml({
    kind: XamlKind.STYLE,
    xaml: "<?xml version=\"1.0\"?>\n<!-- row -->\n<Style TargetType=\"Button\"/>"
  });
  assert.match(xaml, /^<\?xml version="1\.0"\?>\n<!-- row -->\n<Style xmlns=".*" xmlns:x=".*" TargetType="Button"\/>$/u);
});

test("an attribute value that holds a namespace name is not a declaration", () => {
  const xaml = loadableXaml({
    kind: XamlKind.ITEMS_PANEL_TEMPLATE,
    xaml: "<ItemsPanelTemplate Tag=\"xmlns=1\"><StackPanel/></ItemsPanelTemplate>"
  });
  assert.match(xaml, /^<ItemsPanelTemplate xmlns="[^"]+" xmlns:x="[^"]+" Tag="xmlns=1">/u);
});

test("a root of another kind names both", () => {
  assert.throws(
    () => loadableXaml({
      kind: XamlKind.CONTROL_TEMPLATE,
      xaml: "<DataTemplate/>"
    }),
    /controlTemplate starts with <ControlTemplate>, this XAML starts with <DataTemplate>/u
  );
});

test("text with no root element is refused", () => {
  assert.throws(
    () => loadableXaml({
      kind: XamlKind.DATA_TEMPLATE,
      xaml: "just text"
    }),
    /dataTemplate is XAML text starting with <DataTemplate>/u
  );
});

test("a kind that is none names the kinds there are", () => {
  assert.throws(
    () => loadableXaml({
      // @ts-expect-error "brush" is no kind of XAML
      kind: "brush",
      xaml: "<Brush/>"
    }),
    /"brush" is no XAML kind \(controlTemplate, dataTemplate, itemsPanelTemplate, style, resourceDictionary\)/u
  );
});
