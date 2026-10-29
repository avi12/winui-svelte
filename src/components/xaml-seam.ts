import type { ControlTemplate, DataTemplate, ItemsPanelTemplate, ResourceDictionary, Style } from "./generated/bindings.ts";
import type { ResourceRecordInput } from "./resource-record.ts";
import type { XamlKind } from "./xaml-source.ts";

// How a prop given XAML text, or a record of resources, gets the WinUI object.
// Making it takes XamlReader and the classes of the templates, which every
// window carries (xaml.ts, installed when the application starts) and a bundle
// of one Button need not: the converters the components share reach WinUI
// through this seam, and so do not name those bindings.

/** What each kind of XAML loads as. */
export interface XamlClasses {
  controlTemplate: ControlTemplate;
  dataTemplate: DataTemplate;
  itemsPanelTemplate: ItemsPanelTemplate;
  style: Style;
  resourceDictionary: ResourceDictionary;
}

/**
 * What the components need of WinUI to read XAML text and a record of
 * resources: a loader for each kind of XAML, which throws when the XAML is not
 * of that kind.
 */
export type XamlSeam = { [Kind in XamlKind]: (xaml: string) => XamlClasses[Kind] } & {
  resources(record: ResourceRecordInput): ResourceDictionary;
};

let installed: XamlSeam | null = null;

/** Connects the components to WinUI's XAML reader: `runWindow` does it, a host of one's own calls `installXaml()`. */
export function installXamlSeam(seam: XamlSeam) {
  installed = seam;
}

/**
 * The seam a prop given XAML text goes through.
 *
 * @throws {Error} When no application has installed it.
 */
export function xamlSeam() {
  if (installed === null) {
    throw new Error("XAML text and records of resources need runWindow or installXaml()");
  }

  return installed;
}
