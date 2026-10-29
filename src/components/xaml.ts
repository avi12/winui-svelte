import { fontFamilyOf } from "./convert.ts";
import {
  Control,
  ControlTemplate,
  DataTemplate,
  ItemsPanelTemplate,
  projectAs,
  ResourceDictionary,
  Style,
  VisualStateManager,
  XamlReader
} from "./generated/bindings.ts";
import type { DirectResource, ResourceRecordInput } from "./resource-record.ts";
import { resourceParts } from "./resource-record.ts";
import { installXamlSeam } from "./xaml-seam.ts";
import type { XamlClasses } from "./xaml-seam.ts";
import type { XamlSource } from "./xaml-source.ts";
import { loadableXaml, XamlKind } from "./xaml-source.ts";
import type { ResourceCatalogue } from "#src/css/runtime/resources.js";
import { ResourceKind } from "#src/css/runtime/resources.js";
import { loadWinuiCatalogue } from "#src/css/translate/catalogue.js";
import { boxed } from "#src/renderer/host/values.js";

interface ProjectedClass<Instance extends object> {
  readonly prototype: Instance;
}

type XamlClassTable = { [Kind in XamlKind]: ProjectedClass<XamlClasses[Kind]> };

// Built when used, not at import: a table that names a binding at the top
// level keeps that binding in the bundle of every app that imports this module.
function xamlClasses() {
  const table: XamlClassTable = {
    [XamlKind.CONTROL_TEMPLATE]: ControlTemplate,
    [XamlKind.DATA_TEMPLATE]: DataTemplate,
    [XamlKind.ITEMS_PANEL_TEMPLATE]: ItemsPanelTemplate,
    [XamlKind.STYLE]: Style,
    [XamlKind.RESOURCE_DICTIONARY]: ResourceDictionary
  };
  return table;
}

/**
 * Loads XAML text as a template, a style or a resource dictionary, to give a
 * prop that takes one (`template`, `contentTemplate`, `headerTemplate`,
 * `itemsPanel`, `resources`), or to keep and use for several. The root element
 * must be the kind's, and a root that declares no namespace gets WinUI's.
 *
 * @example
 * const template = xamlOf({
 *   kind: XamlKind.DATA_TEMPLATE,
 *   xaml: `<DataTemplate><TextBlock Text="{Binding}"/></DataTemplate>`
 * });
 *
 * @throws {RangeError} When the kind is none of `XamlKind`.
 * @throws {TypeError} When the XAML's root element is not the kind's.
 */
export function xamlOf<Kind extends XamlKind>(source: XamlSource<Kind>) {
  const xaml = loadableXaml(source);
  return projectAs(XamlReader.load(xaml), xamlClasses()[source.kind]);
}

function loaderOf<Kind extends XamlKind>(kind: Kind) {
  return (xaml: string) => xamlOf({
    kind,
    xaml
  });
}

let catalogue: ResourceCatalogue | null = null;

// WinUI's resource names and kinds, read the first time a record needs them.
function winuiCatalogue() {
  catalogue ??= loadWinuiCatalogue();
  return catalogue;
}

function directValue({ kind, value }: DirectResource) {
  const isFontFamily = kind === ResourceKind.FONT_FAMILY && typeof value === "string";
  if (isFontFamily) {
    return fontFamilyOf(value);
  }

  return typeof value === "object" ? value : boxed(value);
}

/**
 * A ResourceDictionary of a record of resources: colors and lengths as the
 * kind their key has in WinUI (the CSS custom properties' rule), the rest as
 * they are.
 *
 * @throws {TypeError} When a value is not the kind its key has in WinUI.
 */
export function resourceDictionaryOf(record: ResourceRecordInput) {
  const { xaml, direct } = resourceParts({
    record,
    catalogue: winuiCatalogue()
  });
  const dictionary = xaml === null ? new ResourceDictionary() : xamlOf({
    kind: XamlKind.RESOURCE_DICTIONARY,
    xaml
  });
  for (const resource of direct) {
    dictionary.insert(boxed(resource.key), directValue(resource));
  }

  return dictionary;
}

/**
 * Lets a prop be given XAML text or a record of resources. `runWindow` calls
 * it when the application starts; call it yourself when the app starts WinUI
 * another way.
 */
export function installXaml() {
  installXamlSeam({
    [XamlKind.CONTROL_TEMPLATE]: loaderOf(XamlKind.CONTROL_TEMPLATE),
    [XamlKind.DATA_TEMPLATE]: loaderOf(XamlKind.DATA_TEMPLATE),
    [XamlKind.ITEMS_PANEL_TEMPLATE]: loaderOf(XamlKind.ITEMS_PANEL_TEMPLATE),
    [XamlKind.STYLE]: loaderOf(XamlKind.STYLE),
    [XamlKind.RESOURCE_DICTIONARY]: loaderOf(XamlKind.RESOURCE_DICTIONARY),
    resources: resourceDictionaryOf
  });
}

/**
 * Moves a control to one of the visual states its template defines (`Pressed`,
 * `PointerOver`, `Disabled`), as `VisualStateManager.GoToState` does. A control
 * whose template is not applied yet has no states.
 *
 * @returns True when the control is now in the state (or already was), false
 * when its template has no state of that name.
 */
export function goToState({ control, name, useTransitions = false }: {
  control: Control;
  name: string;
  useTransitions?: boolean;
}) {
  return VisualStateManager.goToState(control, name, useTransitions);
}
