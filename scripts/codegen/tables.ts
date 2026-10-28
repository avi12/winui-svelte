import type { TypeName } from "./winmd.ts";

// What the metadata cannot say, or says too loosely, in one place: the
// generator reads these tables and nothing else decides it.

// Where a component hierarchy starts. Everything below is a component or the
// abstract base one inherits from.
export const rootClasses: TypeName[] = [
  {
    namespace: "Microsoft.UI.Xaml",
    name: "UIElement"
  },
  {
    namespace: "Microsoft.UI.Xaml.Documents",
    name: "TextElement"
  },
  {
    namespace: "Microsoft.UI.Xaml.Controls.Primitives",
    name: "FlyoutBase"
  },
  {
    namespace: "Microsoft.UI.Xaml.Media",
    name: "Brush"
  },
  {
    namespace: "Microsoft.UI.Xaml.Media",
    name: "Geometry"
  },
  {
    namespace: "Microsoft.UI.Xaml.Media",
    name: "Transform"
  },
  {
    namespace: "Microsoft.UI.Xaml.Media",
    name: "PathSegment"
  },
  {
    namespace: "Microsoft.UI.Xaml.Media",
    name: "PathFigure"
  },
  {
    namespace: "Microsoft.UI.Xaml.Media",
    name: "GradientStop"
  },
  {
    namespace: "Microsoft.UI.Xaml.Media.Animation",
    name: "Transition"
  },
  {
    namespace: "Microsoft.UI.Xaml.Media.Animation",
    name: "Timeline"
  },
  {
    namespace: "Microsoft.UI.Xaml.Controls",
    name: "Layout"
  },
  {
    namespace: "Microsoft.UI.Xaml.Input",
    name: "KeyboardAccelerator"
  },
  {
    namespace: "Microsoft.UI.Xaml.Input",
    name: "XamlUICommand"
  },
  {
    namespace: "Microsoft.UI.Xaml.Media",
    name: "SystemBackdrop"
  },
  {
    namespace: "Microsoft.UI.Xaml.Media",
    name: "Shadow"
  },
  {
    namespace: "Microsoft.UI.Xaml.Controls",
    name: "TreeViewNode"
  },
  {
    namespace: "Microsoft.UI.Xaml.Media",
    name: "ImageSource"
  },
  {
    namespace: "Microsoft.UI.Xaml.Controls",
    name: "IconSource"
  },
  {
    namespace: "Microsoft.UI.Xaml.Media.Animation",
    name: "EasingFunctionBase"
  },
  {
    namespace: "Microsoft.UI.Xaml.Media.Animation",
    name: "DoubleKeyFrame"
  },
  {
    namespace: "Microsoft.UI.Xaml.Media.Animation",
    name: "ColorKeyFrame"
  },
  {
    namespace: "Microsoft.UI.Xaml.Media.Animation",
    name: "ObjectKeyFrame"
  },
  {
    namespace: "Microsoft.UI.Xaml.Media.Animation",
    name: "PointKeyFrame"
  },
  {
    namespace: "Microsoft.UI.Xaml.Media.Animation",
    name: "KeySpline"
  },
  {
    namespace: "Microsoft.UI.Xaml.Media.Animation",
    name: "NavigationTransitionInfo"
  },
  {
    namespace: "Microsoft.UI.Xaml.Media.Media3D",
    name: "Transform3D"
  },
  {
    namespace: "Microsoft.UI.Xaml.Media",
    name: "Projection"
  },
  {
    namespace: "Microsoft.UI.Xaml.Media",
    name: "CacheMode"
  },
  {
    namespace: "Microsoft.UI.Xaml.Documents",
    name: "ContentLinkProvider"
  }
];

// The winmd the components are read from; the rest only resolve the types
// their properties name.
export const COMPONENT_WINMD = "Microsoft.UI.Xaml.winmd";
export const referenceWinmds = [
  "Microsoft.UI.Text.winmd",
  "Microsoft.UI.winmd",
  "Microsoft.Foundation.winmd",
  "Microsoft.Graphics.winmd",
  "Microsoft.Web.WebView2.Core.winmd",
  "Windows.Foundation.FoundationContract.winmd",
  "Windows.Foundation.UniversalApiContract.winmd"
];

// An interface a class implements for the code that derives from it, not for
// the code that uses it.
export const subclassInterfaceSuffixes = ["Protected", "Overrides", "Private", "Factory", "Statics"];

// Events a class declares but WinUI does not implement: subscribing returns
// E_NOTIMPL. By the full name of the class that declares them.
export const unimplementedEvents = new Map<string, string[]>([
  [
    "Microsoft.UI.Xaml.Documents.TextElement",
    ["AccessKeyDisplayDismissed", "AccessKeyDisplayRequested", "AccessKeyInvoked"]
  ]
]);

// A property a component does not take, and why.
export const skippedProperties = new Map<string, string>([
  ["Style", "style is the CSS string of the element; WinUI's Style object is set from the class"]
]);

// The metadata types these properties Object, but WinUI takes less than any
// value: the input type (src/components/convert.ts) each prop is narrowed to.
// Every other Object property keeps ObjectInput (a boxed string, number or
// boolean, or an object): content, headers, tool tips, command parameters,
// selected items, data contexts and tags hold whatever the app puts there.
export const narrowedObjectInputs = new Map<string, string>([
  // A collection or a template (DataTemplate, selector or element factory): a
  // boxed primitive is never one.
  ["itemsSource", "ObjectReferenceInput"],
  ["menuItemsSource", "ObjectReferenceInput"],
  ["footerMenuItemsSource", "ObjectReferenceInput"],
  ["tabItemsSource", "ObjectReferenceInput"],
  ["itemTemplate", "ObjectReferenceInput"],
  ["scrollOwner", "ObjectReferenceInput"],
  // RelativePanel places an element by another element, or by its name.
  ["relativePanelLeftOf", "ElementReferenceInput"],
  ["relativePanelAbove", "ElementReferenceInput"],
  ["relativePanelRightOf", "ElementReferenceInput"],
  ["relativePanelBelow", "ElementReferenceInput"],
  ["relativePanelAlignHorizontalCenterWith", "ElementReferenceInput"],
  ["relativePanelAlignVerticalCenterWith", "ElementReferenceInput"],
  ["relativePanelAlignLeftWith", "ElementReferenceInput"],
  ["relativePanelAlignTopWith", "ElementReferenceInput"],
  ["relativePanelAlignRightWith", "ElementReferenceInput"],
  ["relativePanelAlignBottomWith", "ElementReferenceInput"]
]);

// A component with props the metadata cannot give (Grid's columns and rows
// are read-only collections): src/components/extensions/<kebab-name>.ts
// exports `<Name>Extras` (the props) and `link<Name>Extras(control, props,
// link)`, which the generated level mixes in.
export const extendedClasses = new Set(["Grid"]);

// Properties markup does not fill with a snippet, though their type would let
// it (the slot rule in model.ts takes every settable property typed as a
// control or Object, and every collection of them, as one a <property>
// element fills): what holds the app's data or the control's state rather
// than something shown, and what points at a control placed elsewhere.
export const unslottedProperties = new Set([
  "Tag",
  "DataContext",
  "SelectedItem",
  "SelectedValue",
  "SelectedItems",
  "SectionHeaders",
  "SectionsInView",
  "PlacementTarget",
  "Target",
  "SemanticZoomOwner",
  "OverflowContentTarget",
  "Source",
  "ScrollOwner",
  "SourceElement"
]);
// The same of a whole family, by the end of the name: a command's parameter,
// an items source, a template.
export const unslottedSuffixes = ["CommandParameter", "ItemsSource", "Template"];

// A property that has its own props `children`, `class`, `style` or
// `attached`, which every component takes.
export const reservedKeys = new Set(["children", "class", "style", "attached"]);

// A class WinUI activates but the generator leaves out, and why. Filled from
// the mount test: a control the test cannot construct on its own.
export const nonConstructible = new Map<string, string>([
  [
    "Microsoft.UI.Xaml.Controls.SwapChainBackgroundPanel",
    "the UWP panel WinUI 3 keeps for compatibility: it refuses most FrameworkElement properties (Opacity, Height...), "
    + "so a component for it would throw on being given them; SwapChainPanel is its replacement"
  ],
  [
    "Microsoft.UI.Xaml.Controls.Primitives.PivotHeaderItem",
    "constructing it fails with E_NOINTERFACE: it is activatable in the metadata but WinUI makes it only inside a Pivot"
  ]
]);

// Classes whose bindings scripts/bindings/after-winapp.ts makes after winapp's
// run (`pnpm bindings`), so they stay out of the list winapp is given: WebView2's
// events name Microsoft.Web.WebView2.Core types, and winapp passes that winmd to
// dynwinrt-codegen neither to emit nor to resolve against; the swap chain panels
// reach Microsoft.UI.Input.PointerEventArgs and Windows.UI.Core.PointerEventArgs
// in one pass, where the second names the latter differently from the first, and
// makes no trouble in a pass of its own. All in the controls namespace.
export const bindingsAfterWinapp = new Set([
  "Microsoft.UI.Xaml.Controls.SwapChainPanel",
  "Microsoft.UI.Xaml.Controls.WebView2"
]);

// A property whose value changes by the user raises an event; the property
// is then $bindable(). The rule `<Property>Changed` finds the regular ones;
// these are the irregular, each listing the events that say the value
// changed. An event the class does not have is left out.
export const bindableEvents = new Map<string, string[]>([
  ["IsOn", ["Toggled"]],
  ["SelectedIndex", ["SelectionChanged"]],
  ["SelectedItem", ["SelectionChanged"]],
  ["SelectedValue", ["SelectionChanged"]],
  ["IsChecked", ["Checked", "Unchecked", "Indeterminate"]],
  ["IsDropDownOpen", ["DropDownOpened", "DropDownClosed"]],
  ["IsExpanded", ["Expanding", "Collapsed"]],
  ["IsOpen", ["Opened", "Closed"]],
  ["IsPaneOpen", ["PaneOpened", "PaneClosed"]]
]);

// A property the rule would make bindable but is not the control's to give
// back: the data context is pushed down by the owner, and its change event
// also fires when an ancestor's changes; IsEnabled is the effective value, so
// a disabled parent would write false into an enabled child for good.
export const neverBindable = new Set(["DataContext", "IsEnabled"]);

// Classes whose static Set<Name>(element, value) methods are attached
// properties, each as a prop named by the prefix and the property: gridRow,
// automationName, toolTip. A property that starts with the prefix already
// keeps its own name (AutomationId is automationId, not automationAutomationId).
export const attachedOwners: Array<{
  owner: TypeName;
  prefix: string;
}> = [
  {
    owner: {
      namespace: "Microsoft.UI.Xaml.Controls",
      name: "Grid"
    },
    prefix: "grid"
  },
  {
    owner: {
      namespace: "Microsoft.UI.Xaml.Controls",
      name: "Canvas"
    },
    prefix: "canvas"
  },
  {
    owner: {
      namespace: "Microsoft.UI.Xaml.Controls",
      name: "RelativePanel"
    },
    prefix: "relativePanel"
  },
  {
    owner: {
      namespace: "Microsoft.UI.Xaml.Controls",
      name: "VariableSizedWrapGrid"
    },
    prefix: "variableSizedWrapGrid"
  },
  {
    owner: {
      namespace: "Microsoft.UI.Xaml.Controls",
      name: "ScrollViewer"
    },
    prefix: "scrollViewer"
  },
  {
    owner: {
      namespace: "Microsoft.UI.Xaml.Controls",
      name: "ToolTipService"
    },
    prefix: "toolTip"
  },
  {
    owner: {
      namespace: "Microsoft.UI.Xaml.Automation",
      name: "AutomationProperties"
    },
    prefix: "automation"
  }
];

// What the runtime conversions build or read, which the bindings must hold
// whether or not a property names them.
export const supportClasses: TypeName[] = [
  {
    namespace: "Microsoft.UI.Xaml",
    name: "Application"
  },
  {
    namespace: "Microsoft.UI.Xaml.Controls",
    name: "ColumnDefinition"
  },
  {
    namespace: "Microsoft.UI.Xaml.Controls",
    name: "RowDefinition"
  },
  {
    namespace: "Microsoft.UI.Xaml.Media",
    name: "Brush"
  },
  {
    namespace: "Microsoft.UI.Xaml.Media",
    name: "ImageSource"
  },
  {
    namespace: "Microsoft.UI.Xaml.Media",
    name: "SolidColorBrush"
  },
  {
    namespace: "Microsoft.UI.Xaml.Media",
    name: "FontFamily"
  },
  {
    namespace: "Microsoft.UI.Xaml.Media.Imaging",
    name: "BitmapImage"
  },
  {
    namespace: "Windows.Foundation",
    name: "PropertyValue"
  },
  {
    namespace: "Windows.Foundation",
    name: "Uri"
  },
  // The list components (src/components/hand-written/): the item template they
  // parse, the containers they fill and reset, and the keys they read.
  {
    namespace: "Microsoft.UI.Xaml",
    name: "DataTemplate"
  },
  {
    namespace: "Microsoft.UI.Xaml",
    name: "DependencyObject"
  },
  {
    namespace: "Microsoft.UI.Xaml",
    name: "VisualStateManager"
  },
  {
    namespace: "Microsoft.UI.Xaml.Markup",
    name: "XamlReader"
  },
  {
    namespace: "Microsoft.UI.Xaml.Media",
    name: "VisualTreeHelper"
  },
  {
    namespace: "Microsoft.UI.Xaml.Input",
    name: "KeyRoutedEventArgs"
  },
  {
    namespace: "Microsoft.UI.Xaml.Controls",
    name: "ContainerContentChangingEventArgs"
  }
];

// What the package itself reaches besides its components, from src/winui.ts
// (the package's one import site of the bindings; a test keeps the two in
// step): an app generates bindings for these as well.
export const coreClasses: TypeName[] = [
  {
    namespace: "Microsoft.UI.Dispatching",
    name: "DispatcherQueue"
  },
  {
    namespace: "Microsoft.UI.Dispatching",
    name: "DispatcherQueueTimer"
  },
  {
    namespace: "Microsoft.UI.Windowing",
    name: "AppWindow"
  },
  {
    namespace: "Microsoft.UI.Windowing",
    name: "DisplayArea"
  },
  {
    namespace: "Microsoft.UI.Windowing",
    name: "OverlappedPresenter"
  },
  {
    namespace: "Microsoft.UI.Xaml",
    name: "ResourceDictionary"
  },
  {
    namespace: "Microsoft.UI.Xaml",
    name: "Style"
  },
  {
    namespace: "Microsoft.UI.Xaml",
    name: "Window"
  },
  {
    namespace: "Microsoft.UI.Xaml.Controls",
    name: "RowDefinition"
  },
  // The renderer shows the text between a text block's inline elements as
  // Runs.
  {
    namespace: "Microsoft.UI.Xaml.Documents",
    name: "Run"
  },
  {
    namespace: "Microsoft.UI.Xaml.Markup",
    name: "XamlReader"
  },
  {
    namespace: "Microsoft.UI.Xaml.Media",
    name: "DesktopAcrylicBackdrop"
  },
  // MicaBackdrop is one class for both Mica and Mica Alt (its Kind property
  // says which).
  {
    namespace: "Microsoft.UI.Xaml.Media",
    name: "MicaBackdrop"
  },
  {
    namespace: "Microsoft.UI.Xaml.Media",
    name: "SystemBackdrop"
  }
];

// How a control shows the app's items by a snippet (src/components/hand-written/
// items): the component takes `items`, `key` and `item` in place of the control's
// children and items source, and a host connects them to the control. LIST
// is a ListViewBase, which reports its containers; REPEATER keeps its items
// in an ItemsRepeater (itself, or one in its template) whose elements are
// a ContentControl the row goes in (the template's root, or the element
// itself); ITEM_CONTAINER is that with an ItemContainer as root.
export const ItemsHost = {
  LIST: "list",
  REPEATER: "repeater",
  ITEM_CONTAINER: "itemContainer"
} as const;

export type ItemsHost = typeof ItemsHost[keyof typeof ItemsHost];

export const itemsHosted = new Map<string, ItemsHost>([
  ["ListView", ItemsHost.LIST],
  ["GridView", ItemsHost.LIST],
  ["ItemsRepeater", ItemsHost.REPEATER],
  ["BreadcrumbBar", ItemsHost.REPEATER],
  ["ItemsView", ItemsHost.ITEM_CONTAINER]
]);

// Exports of the bindings that are not metadata types: the generic
// instantiations the conversions name.
export const extraBindings = [
  {
    name: "IReference_Boolean",
    module: "#winui/windows/foundation/IReference_Boolean"
  },
  {
    name: "IReference_Double",
    module: "#winui/windows/foundation/IReference_Double"
  },
  // The list components hold their keys in a vector of boxed values, and
  // narrow the controls WinUI hands back (projectAs).
  {
    name: "IVector_Object",
    module: "#winui/windows/foundation/collections/IVector_Object"
  },
  {
    name: "projectAs",
    module: "#winui/lifetime"
  }
];

// Enums the conversions and the hand-written components use, which arrive in
// the bindings with the classes that name them (ColumnDefinition and
// GridUnitType, KeyRoutedEventArgs and VirtualKey, MicaBackdrop and MicaKind).
export const supportEnums: TypeName[] = [
  {
    namespace: "Microsoft.UI.Xaml",
    name: "GridUnitType"
  },
  {
    namespace: "Microsoft.UI.Xaml",
    name: "FocusState"
  },
  {
    namespace: "Microsoft.UI.Xaml",
    name: "WindowActivationState"
  },
  {
    namespace: "Microsoft.UI.Windowing",
    name: "DisplayAreaFallback"
  },
  {
    namespace: "Microsoft.UI.Composition.SystemBackdrops",
    name: "MicaKind"
  },
  {
    namespace: "Windows.System",
    name: "VirtualKey"
  }
];

// How a property's value is written, by the type it holds.
export const PropertyKind = {
  BOOLEAN: "boolean",
  NUMBER: "number",
  STRING: "string",
  ENUM: "enum",
  THICKNESS: "thickness",
  CORNER_RADIUS: "cornerRadius",
  GRID_LENGTH: "gridLength",
  BRUSH: "brush",
  COLOR: "color",
  IMAGE_SOURCE: "imageSource",
  FONT_FAMILY: "fontFamily",
  URI: "uri",
  NULLABLE_BOOLEAN: "nullableBoolean",
  NULLABLE_DOUBLE: "nullableDouble",
  OBJECT: "object",
  PASSTHROUGH: "passthrough"
} as const;

export type PropertyKind = (typeof PropertyKind)[keyof typeof PropertyKind];

// By the full name of the type; anything else a value or a class is handed
// on as the bindings type it.
export const kindOfType = new Map<string, PropertyKind>([
  ["Microsoft.UI.Xaml.Thickness", PropertyKind.THICKNESS],
  ["Microsoft.UI.Xaml.CornerRadius", PropertyKind.CORNER_RADIUS],
  ["Microsoft.UI.Xaml.GridLength", PropertyKind.GRID_LENGTH],
  ["Microsoft.UI.Xaml.Media.Brush", PropertyKind.BRUSH],
  ["Windows.UI.Color", PropertyKind.COLOR],
  ["Microsoft.UI.Xaml.Media.ImageSource", PropertyKind.IMAGE_SOURCE],
  ["Microsoft.UI.Xaml.Media.FontFamily", PropertyKind.FONT_FAMILY],
  ["Windows.Foundation.Uri", PropertyKind.URI]
]);

export const numericPrimitives = new Set(["SByte", "Byte", "Int16", "UInt16", "Int32", "UInt32", "Single", "Double"]);
