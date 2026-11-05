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
  },
  // The visual state groups of a control's root element, which a control
  // template would hold: the states, their setters and their triggers.
  {
    namespace: "Microsoft.UI.Xaml",
    name: "VisualStateGroup"
  },
  {
    namespace: "Microsoft.UI.Xaml",
    name: "VisualState"
  },
  {
    namespace: "Microsoft.UI.Xaml",
    name: "VisualTransition"
  },
  {
    namespace: "Microsoft.UI.Xaml",
    name: "SetterBase"
  },
  {
    namespace: "Microsoft.UI.Xaml",
    name: "StateTriggerBase"
  },
  // What a list needs to group its items natively: the source that groups
  // them and the style of a group's header.
  {
    namespace: "Microsoft.UI.Xaml.Data",
    name: "CollectionViewSource"
  },
  {
    namespace: "Microsoft.UI.Xaml.Controls",
    name: "GroupStyle"
  },
  // Value objects that are not elements: a swipe control's commands and the
  // list of them, a map's layers and what they hold, a text block's
  // highlights, a rating control's glyphs or images.
  {
    namespace: "Microsoft.UI.Xaml.Controls",
    name: "SwipeItem"
  },
  {
    namespace: "Microsoft.UI.Xaml.Controls",
    name: "SwipeItems"
  },
  {
    namespace: "Microsoft.UI.Xaml.Controls",
    name: "MapElement"
  },
  {
    namespace: "Microsoft.UI.Xaml.Controls",
    name: "MapLayer"
  },
  {
    namespace: "Microsoft.UI.Xaml.Documents",
    name: "TextHighlighter"
  },
  {
    namespace: "Microsoft.UI.Xaml.Controls",
    name: "RatingItemInfo"
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

/**
 * Packages beyond WinUI whose controls become components too: the winmd they
 * are read from (an entry of extraPackages), the namespace they live in, the
 * folder of src/components/generated and subpath export they are written to,
 * and the classes that become components (the rest of the winmd is reached
 * through bindings and the drawing API). Their parents are WinUI's levels.
 */
export const componentWinmds = [
  {
    winmd: "Microsoft.Graphics.Canvas.winmd",
    namespace: "Microsoft.Graphics.Canvas",
    folder: "win2d",
    classes: [
      "Microsoft.Graphics.Canvas.UI.Xaml.CanvasAnimatedControl",
      "Microsoft.Graphics.Canvas.UI.Xaml.CanvasControl",
      "Microsoft.Graphics.Canvas.UI.Xaml.CanvasSwapChainPanel",
      "Microsoft.Graphics.Canvas.UI.Xaml.CanvasVirtualControl"
    ]
  }
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

// A property a component does not take, and why: by its name, or by
// `Class.Name` for the one class that declares it.
export const skippedProperties = new Map<string, string>([
  ["Style", "style is the CSS string of the element; WinUI's Style object is set from the class"],
  ["Setter.Property", "a DependencyProperty handle: the setter's `path` prop names the property instead"],
  ["Setter.Target", "built by the setter's extension from its `target` and `path` props"],
  ["GroupStyle.ContainerStyle", "a group's container takes the class of the list's own item container"],
  ["GroupStyle.HeaderContainerStyle", "a group's header takes the class of the list's own header container"]
]);

// The metadata types these properties Object, but WinUI takes less than any
// value: the input type (src/components/convert.ts) each prop is narrowed to.
// Every other Object property keeps ObjectInput (a boxed string, number or
// boolean, or an object): content, headers, tool tips, command parameters,
// selected items, data contexts and tags hold whatever the app puts there.
export const narrowedObjectInputs = new Map<string, string>([
  // A collection (or an array, which is made one) of the items a control shows.
  ["itemsSource", "CollectionInput"],
  ["menuItemsSource", "CollectionInput"],
  ["footerMenuItemsSource", "CollectionInput"],
  ["tabItemsSource", "CollectionInput"],
  // A template (DataTemplate, selector or element factory) or a scroll host: a
  // boxed primitive is never one.
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
// and a text highlighter's ranges are read-only collections):
// src/components/extensions/<kebab-name>.ts exports `<Name>Extras` (the props)
// and `link<Name>Extras(control, props, link)`, which the generated level mixes
// in.
export const extendedClasses = new Set(["Grid", "TextHighlighter"]);

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
  "View",
  "ScrollOwner",
  "SourceElement"
]);
// The same of a whole family, by the end of the name: a command's parameter,
// an items source, a template.
export const unslottedSuffixes = ["CommandParameter", "ItemsSource", "Template"];

// Settable collection properties that WinUI leaves null until the app gives
// them one (a panel's ChildrenTransitions), by the name of the property, with
// the class that is made for it. The component takes a snippet prop in place
// of the property, and renders it in a <property> element that names that
// class's tag: the renderer makes the collection when the property holds none,
// and the components that fit its items (the transitions) register the class,
// so an app bundles it only when it uses one.
const TRANSITION_COLLECTION: TypeName = {
  namespace: "Microsoft.UI.Xaml.Media.Animation",
  name: "TransitionCollection"
};

export const createdCollections = new Map<string, TypeName>([
  ["Transitions", TRANSITION_COLLECTION],
  ["ChildTransitions", TRANSITION_COLLECTION],
  ["ChildrenTransitions", TRANSITION_COLLECTION],
  ["ContentTransitions", TRANSITION_COLLECTION],
  ["ItemContainerTransitions", TRANSITION_COLLECTION],
  ["HeaderTransitions", TRANSITION_COLLECTION],
  ["FooterTransitions", TRANSITION_COLLECTION]
]);

// The classes a component makes from a string prop (a grid's `rows` and
// `columns` lists), by the component's name: it registers them beside its own,
// so the renderer finds them and an app bundles them only with the component.
export const madeFromProps = new Map<string, TypeName[]>([
  ["Grid", [
    {
      namespace: "Microsoft.UI.Xaml.Controls",
      name: "ColumnDefinition"
    },
    {
      namespace: "Microsoft.UI.Xaml.Controls",
      name: "RowDefinition"
    }
  ]]
]);

// A property that has its own props `children`, `class`, `style` or
// `attached`, which every component takes.
export const reservedKeys = new Set(["children", "class", "style", "attached"]);

// A class WinUI activates but the generator leaves out, and why. Filled from
// the mount test: a control the test cannot construct on its own.
// An enum whose WinUI name is a name the language already has, as it is
// exported from winui-svelte/enums: importing `Symbol` would hide the global
// one in the app's module.
export const renamedEnums = new Map<string, string>([
  ["Symbol", "SymbolGlyph"]
]);

export const nonConstructible = new Map<string, string>([
  [
    "Microsoft.UI.Xaml.Controls.SwapChainBackgroundPanel",
    "the UWP panel WinUI 3 keeps for compatibility, bound and mounted: it refuses Opacity, Width, Height, MinWidth, "
    + "MaxWidth, MinHeight, MaxHeight and Margin (0x80004005) and is allowed only as the application's root visual or "
    + "inside a Page, so it cannot be placed in a panel like every other component; SwapChainPanel is its replacement"
  ],
  [
    "Microsoft.UI.Xaml.Controls.Primitives.PivotHeaderItem",
    "covered by Pivot: WinUI makes it only inside a Pivot, as the header of a PivotItem (constructing it fails with "
    + "E_NOINTERFACE), so a header is styled with the `header` snippet of PivotItem"
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

// The Windows metadata the winui-svelte/devices classes are in.
const DEVICES_WINMD = "Windows.Foundation.UniversalApiContract.winmd";

/**
 * Classes of the Windows App SDK that the helpers of winui-svelte/win2d need
 * and the components do not, and the Windows classes of winui-svelte/devices
 * (Bluetooth, radios, power, input, network, audio, gamepads, sensors), of
 * winui-svelte/web-apis (geolocation, media capture, speech, USB, HID, serial,
 * credentials, wake lock, sockets, files) and of the as-is examples: scripts/bindings/after-winapp.ts makes their
 * bindings after winapp's run, so a full `pnpm bindings` (about twelve
 * minutes) is not needed to add one.
 */
export const lateClasses = [
  {
    winmd: "Microsoft.UI.winmd",
    namespace: "Microsoft.UI.Composition",
    classes: ["CompositionEffectSourceParameter"]
  },
  {
    winmd: "Windows.Foundation.UniversalApiContract.winmd",
    namespace: "Windows.ApplicationModel.DataTransfer",
    classes: ["Clipboard", "DataTransferManager"]
  },
  {
    winmd: "Windows.Foundation.UniversalApiContract.winmd",
    namespace: "Windows.System",
    classes: ["Launcher"]
  },
  {
    winmd: "Windows.Foundation.UniversalApiContract.winmd",
    namespace: "Windows.Services.Store",
    classes: ["StoreContext", "StoreAppLicense", "StorePackageUpdate", "StorePackageUpdateResult", "StorePackageUpdateState", "StorePackageUpdateStatus"]
  },
  {
    winmd: "Windows.Foundation.UniversalApiContract.winmd",
    namespace: "Windows.ApplicationModel",
    classes: ["Package", "PackageCatalog", "PackageUpdatingEventArgs", "PackageStagingEventArgs", "PackageInstallingEventArgs", "StartupTask", "StartupTaskState"]
  },
  {
    winmd: "Windows.Foundation.UniversalApiContract.winmd",
    namespace: "Windows.Storage.Streams",
    classes: ["DataReader"]
  },
  {
    winmd: "Microsoft.UI.winmd",
    namespace: "Microsoft.UI.Input",
    classes: ["InputSystemCursor"]
  },
  {
    winmd: COMPONENT_WINMD,
    namespace: "Microsoft.UI.Xaml.Media.Imaging",
    classes: ["WriteableBitmap"]
  },
  {
    winmd: COMPONENT_WINMD,
    namespace: "Microsoft.UI.Xaml.Hosting",
    classes: ["ElementCompositionPreview"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Foundation",
    classes: ["IPropertyValue"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Devices.Enumeration",
    classes: ["DeviceAccessInformation", "DeviceAccessStatus"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Devices.Input",
    classes: ["MouseCapabilities", "KeyboardCapabilities", "TouchCapabilities"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Devices.Radios",
    classes: ["Radio"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Devices.Bluetooth",
    classes: ["BluetoothAdapter", "BluetoothDevice", "BluetoothLEDevice", "BluetoothUuidHelper"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Devices.Bluetooth.Advertisement",
    classes: ["BluetoothLEAdvertisementWatcher", "BluetoothLEAdvertisementReceivedEventArgs", "BluetoothLEAdvertisement", "BluetoothLEAdvertisementDataSection", "BluetoothLEManufacturerData"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Devices.Bluetooth.GenericAttributeProfile",
    classes: ["GattDeviceService", "GattCharacteristic", "GattDeviceServicesResult", "GattCharacteristicsResult", "GattReadResult", "GattWriteResult", "GattValueChangedEventArgs", "GattCharacteristicUuids", "GattServiceUuids"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Devices.Power",
    classes: ["Battery", "BatteryReport"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.System.Power",
    classes: ["PowerManager"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Devices.Display",
    classes: ["DisplayMonitor"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Devices.Sensors",
    classes: ["Accelerometer", "LightSensor", "Inclinometer"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Networking.Connectivity",
    classes: ["NetworkInformation"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Media.Devices",
    classes: ["MediaDevice"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Gaming.Input",
    classes: ["Gamepad"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Storage.Streams",
    classes: ["DataReader"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Security.Cryptography",
    classes: ["CryptographicBuffer"]
  },
  {
    winmd: COMPONENT_WINMD,
    namespace: "Microsoft.UI.Xaml.Media",
    classes: ["CompositionTarget"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Devices.Geolocation",
    classes: ["Geolocator", "Geoposition", "Geocoordinate", "GeolocationAccessStatus", "PositionAccuracy", "PositionStatus", "CivicAddress"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Devices.Sensors",
    classes: ["Gyrometer", "Magnetometer", "OrientationSensor", "Compass", "Barometer", "Altimeter", "ProximitySensor"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Devices.Haptics",
    classes: ["VibrationDevice", "VibrationAccessStatus"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Graphics.Display",
    classes: ["DisplayInformation"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Storage",
    classes: ["FileIO", "PathIO", "ApplicationData", "ApplicationDataContainer", "KnownFolders", "DownloadsFolder", "StorageLibrary", "UserDataPaths"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Storage.AccessCache",
    classes: ["StorageApplicationPermissions"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Foundation.Collections",
    classes: ["PropertySet"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.ApplicationModel.Contacts",
    classes: ["ContactPicker"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Networking.Sockets",
    classes: ["StreamSocket", "DatagramSocket", "MessageWebSocket", "StreamWebSocket", "StreamSocketListener"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Networking.BackgroundTransfer",
    classes: ["BackgroundDownloader", "BackgroundUploader"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Security.Credentials",
    classes: ["PasswordVault", "KeyCredentialManager"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Security.Credentials.UI",
    classes: ["UserConsentVerifier"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Security.Cryptography.Core",
    classes: ["CryptographicEngine", "SymmetricKeyAlgorithmProvider", "HashAlgorithmProvider"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Security.Cryptography.DataProtection",
    classes: ["DataProtectionProvider"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.System",
    classes: ["MemoryManager"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.System.Display",
    classes: ["DisplayRequest"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.System.UserProfile",
    classes: ["UserInformation", "GlobalizationPreferences"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.System.Profile",
    classes: ["AnalyticsInfo"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Globalization",
    classes: ["ApplicationLanguages", "Calendar", "GeographicRegion"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Globalization.NumberFormatting",
    classes: ["CurrencyFormatter", "DecimalFormatter"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Globalization.DateTimeFormatting",
    classes: ["DateTimeFormatter"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Graphics.Imaging",
    classes: ["BitmapDecoder", "BitmapEncoder", "BitmapTransform"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Graphics.Capture",
    classes: ["GraphicsCapturePicker", "GraphicsCaptureSession", "GraphicsCaptureItem", "Direct3D11CaptureFramePool"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Media",
    classes: ["VideoFrame", "AudioFrame"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Media.Capture",
    classes: ["MediaCapture", "MediaCaptureInitializationSettings"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Media.Capture.Frames",
    classes: ["MediaFrameReader"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Media.MediaProperties",
    classes: ["MediaEncodingProfile", "ImageEncodingProperties"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Media.SpeechSynthesis",
    classes: ["SpeechSynthesizer", "VoiceInformation", "SpeechSynthesisStream"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Media.SpeechRecognition",
    classes: ["SpeechRecognizer", "SpeechRecognitionResult", "SpeechRecognitionTopicConstraint", "SpeechRecognitionListConstraint", "SpeechContinuousRecognitionSession"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Media.Ocr",
    classes: ["OcrEngine"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Media.Transcoding",
    classes: ["MediaTranscoder"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Media.Audio",
    classes: ["AudioGraph", "AudioGraphSettings"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Devices.Enumeration",
    classes: ["DevicePicker"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Devices.Usb",
    classes: ["UsbDevice", "UsbInterface", "UsbBulkInPipe", "UsbBulkOutPipe", "UsbInterruptInPipe", "UsbSetupPacket", "UsbDeviceClasses", "UsbControlRequestType"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Devices.HumanInterfaceDevice",
    classes: ["HidDevice", "HidInputReport", "HidOutputReport", "HidFeatureReport"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Devices.SerialCommunication",
    classes: ["SerialDevice"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Gaming.Input",
    classes: ["RawGameController"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.UI.ViewManagement",
    classes: ["InputPane"]
  },
  {
    winmd: DEVICES_WINMD,
    namespace: "Windows.Foundation.Metadata",
    classes: ["ApiInformation"]
  }
];

/** How an extra package's classes reach the bindings. */
export const BindingScope = {
  // The classes of bindingsAfterWinapp, emitted with the Microsoft.UI.Xaml metadata.
  LISTED: "listed",
  // Every namespace of the package's own winmd.
  WHOLE_PACKAGE: "whole-package"
} as const;
export type BindingScope = typeof BindingScope[keyof typeof BindingScope];

/**
 * The NuGet packages beyond the Windows App SDK that winapp.yaml restores and
 * scripts/bindings/after-winapp.ts makes bindings for (winapp's own run cannot
 * pass their metadata): the one table that script and the build both read.
 * `libraries` are the native files the package ships per architecture;
 * `restoredLibrary` is set when winapp does not copy the library to .winapp/bin
 * itself, and says where in the package it is.
 */
export const extraPackages: Array<{
  name: string;
  winmd: string;
  scope: BindingScope;
  libraries: string[];
  restoredLibrary?: {
    file: string;
    runtimeFolder: string;
  };
}> = [
  {
    name: "WebView2",
    winmd: "Microsoft.Web.WebView2.Core.winmd",
    scope: BindingScope.LISTED,
    libraries: ["WebView2Loader.dll", "Microsoft.Web.WebView2.Core.dll"],
    restoredLibrary: {
      file: "Microsoft.Web.WebView2.Core.dll",
      runtimeFolder: "native_uap"
    }
  },
  {
    name: "Win2D",
    winmd: "Microsoft.Graphics.Canvas.winmd",
    scope: BindingScope.WHOLE_PACKAGE,
    libraries: ["Microsoft.Graphics.Canvas.dll"]
  }
];

// A property whose value changes by the user raises an event; the property
// is then $bindable(). The rule `<Property>Changed` finds the regular ones;
// these are the irregular, each listing the events that say the value
// changed. An event the class does not have is left out.
export const bindableEvents = new Map<string, string[]>([
  ["IsOn", ["Toggled"]],
  ["SelectedIndex", ["SelectionChanged"]],
  ["SelectedItem", ["SelectionChanged"]],
  ["SelectedValue", ["SelectionChanged"]],
  ["SelectionStart", ["SelectionChanged"]],
  ["SelectionLength", ["SelectionChanged"]],
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

// Read-only state a control exposes one-way, as a bindable prop the control
// writes and the app only reads: `Class.Property`, each with the events that
// say it changed (an event the class does not have is left out). Not the
// regular `<Property>Changed` rule: the base classes (FrameworkElement's
// ActualTheme, ActualWidth) would put the subscription in every component.
export const observedProperties = new Map<string, string[]>([
  ["NavigationView.DisplayMode", ["DisplayModeChanged"]],
  ["Frame.CanGoBack", ["Navigated"]],
  ["Frame.CanGoForward", ["Navigated"]],
  ["Frame.BackStackDepth", ["Navigated"]],
  ["ScrollViewer.HorizontalOffset", ["ViewChanged"]],
  ["ScrollViewer.VerticalOffset", ["ViewChanged"]],
  ["ScrollViewer.ZoomFactor", ["ViewChanged"]],
  ["ScrollView.HorizontalOffset", ["ViewChanged"]],
  ["ScrollView.VerticalOffset", ["ViewChanged"]],
  ["ScrollView.ZoomFactor", ["ViewChanged"]],
  ["ScrollView.ExtentWidth", ["ExtentChanged"]],
  ["ScrollView.ExtentHeight", ["ExtentChanged"]],
  ["ScrollView.State", ["StateChanged"]],
  ["ScrollPresenter.State", ["StateChanged"]],
  ["Popup.ActualPlacement", ["ActualPlacementChanged"]],
  ["TwoPaneView.Mode", ["ModeChanged"]],
  ["TextBlock.IsTextTrimmed", ["IsTextTrimmedChanged"]],
  ["RichTextBlock.IsTextTrimmed", ["IsTextTrimmedChanged"]],
  ["RichTextBlockOverflow.IsTextTrimmed", ["IsTextTrimmedChanged"]]
]);

// A property the rule would make bindable but whose items host keeps in step
// with the app's keys itself (`selectedKey`): TreeView.SelectedItem holds the
// control's own nodes, and two-way binding it undoes the host's selection.
export const hostOwnedBindables = new Map<string, string[]>([
  ["TreeView", ["SelectedItem"]]
]);

// Classes whose static Set<Name>(element, value) methods are attached
// properties, each as a prop named by the prefix and the property: gridRow,
// automationName, toolTip. A property that starts with the prefix already
// keeps its own name (AutomationId is automationId, not automationAutomationId).
// `slots` names the properties (as WinUI does) whose value is a control, so a
// snippet of that name fills them as it fills a property: the tool tip a
// ToolTipService sets. The others point at a control placed elsewhere or hold
// data. FlyoutBase.AttachedFlyout is left to the `attached` prop
// (`attached={[FlyoutBase, "AttachedFlyout", flyout]}`): as a prop of every
// framework element it puts FlyoutBase, a binding module of its own, and a
// snippet block in every component, which the one-Button bundle budget
// (scripts/pack/treeshake.test.ts) cannot take.
export const attachedOwners: Array<{
  owner: TypeName;
  prefix: string;
  slots?: string[];
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
    prefix: "toolTip",
    slots: ["ToolTip"]
  },
  {
    owner: {
      namespace: "Microsoft.UI.Xaml.Automation",
      name: "AutomationProperties"
    },
    prefix: "automation"
  },
  // The target of an animation: storyboardTarget, storyboardTargetName and
  // storyboardTargetProperty, on every timeline.
  {
    owner: {
      namespace: "Microsoft.UI.Xaml.Media.Animation",
      name: "Storyboard"
    },
    prefix: "storyboard"
  }
];

// What the runtime conversions build or read, which the bindings must hold
// whether or not a property names them.
export const supportClasses: TypeName[] = [
  {
    namespace: "Microsoft.UI.Xaml",
    name: "VisualStateManager"
  },
  {
    namespace: "Microsoft.UI.Xaml",
    name: "PropertyPath"
  },
  {
    namespace: "Microsoft.UI.Xaml",
    name: "TargetPropertyPath"
  },
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
    namespace: "Microsoft.UI.Xaml.Media",
    name: "PointCollection"
  },
  {
    namespace: "Microsoft.UI.Xaml.Media",
    name: "DoubleCollection"
  },
  {
    namespace: "Microsoft.UI.Xaml.Input",
    name: "InputScope"
  },
  {
    namespace: "Microsoft.UI.Xaml.Input",
    name: "InputScopeName"
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
  // What XAML text and a record of resources are loaded as (src/components/xaml.ts).
  {
    namespace: "Microsoft.UI.Xaml.Controls",
    name: "ControlTemplate"
  },
  {
    namespace: "Microsoft.UI.Xaml.Controls",
    name: "ItemsPanelTemplate"
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
    namespace: "Windows.UI.Composition",
    name: "Compositor"
  },
  {
    namespace: "Windows.UI.Composition",
    name: "CompositionColorBrush"
  },
  {
    namespace: "Windows.UI.ViewManagement",
    name: "AccessibilitySettings"
  },
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

// Classes the next features reach, which the bindings hold but nothing in
// src/ imports yet: the window's presenters, the system backdrop controllers,
// the save picker, app notifications, the app instance, connected animations
// and the in-memory streams a media source plays.
export const featureClasses: TypeName[] = [
  {
    namespace: "Microsoft.UI.Windowing",
    name: "FullScreenPresenter"
  },
  {
    namespace: "Microsoft.UI.Windowing",
    name: "CompactOverlayPresenter"
  },
  {
    namespace: "Microsoft.UI.Composition.SystemBackdrops",
    name: "DesktopAcrylicController"
  },
  {
    namespace: "Microsoft.UI.Composition.SystemBackdrops",
    name: "MicaController"
  },
  {
    namespace: "Microsoft.UI.Composition.SystemBackdrops",
    name: "SystemBackdropConfiguration"
  },
  {
    namespace: "Microsoft.Windows.Storage.Pickers",
    name: "FileSavePicker"
  },
  {
    namespace: "Microsoft.Windows.AppNotifications",
    name: "AppNotificationManager"
  },
  {
    namespace: "Microsoft.Windows.AppNotifications",
    name: "AppNotification"
  },
  {
    namespace: "Microsoft.Windows.AppNotifications.Builder",
    name: "AppNotificationBuilder"
  },
  {
    namespace: "Microsoft.Windows.AppNotifications.Builder",
    name: "AppNotificationButton"
  },
  {
    namespace: "Microsoft.Windows.AppNotifications.Builder",
    name: "AppNotificationComboBox"
  },
  {
    namespace: "Microsoft.Windows.AppNotifications.Builder",
    name: "AppNotificationProgressBar"
  },
  {
    namespace: "Microsoft.Windows.AppNotifications.Builder",
    name: "AppNotificationTextProperties"
  },
  {
    namespace: "Microsoft.UI.Xaml.Media.Animation",
    name: "ConnectedAnimationService"
  },
  {
    namespace: "Windows.Storage.Streams",
    name: "InMemoryRandomAccessStream"
  },
  {
    namespace: "Windows.Storage.Streams",
    name: "DataWriter"
  },
  {
    namespace: "Windows.Media.Core",
    name: "MediaSource"
  },
  {
    namespace: "Windows.ApplicationModel.DataTransfer",
    name: "Clipboard"
  },
  {
    namespace: "Windows.ApplicationModel.DataTransfer",
    name: "DataPackage"
  },
  {
    namespace: "Windows.ApplicationModel.DataTransfer",
    name: "DataTransferManager"
  },
  {
    namespace: "Windows.System",
    name: "Launcher"
  },
  {
    namespace: "Windows.Storage",
    name: "StorageFile"
  },
  {
    namespace: "Windows.Storage",
    name: "StorageFolder"
  },
  {
    namespace: "Windows.Storage.Streams",
    name: "RandomAccessStreamReference"
  },
  {
    namespace: "Windows.Storage.Streams",
    name: "DataReader"
  }
];

// How a control shows the app's items by a snippet (src/components/hand-written/
// items): the component takes `items`, `key` and `item` in place of the control's
// children and items source, and a host connects them to the control. LIST
// is a ListViewBase, which reports its containers; REPEATER keeps its items
// in an ItemsRepeater (itself, or one in its template) whose elements are
// a ContentControl the row goes in (the template's root, or the element
// itself); ITEM_CONTAINER is that with an ItemContainer as root. TREE is a
// TreeView, whose items form a tree: the component also takes `children` (the
// items under an item) and `expandedKeys`, and the control's nodes are made
// from the items as they are opened.
export const ItemsHost = {
  LIST: "list",
  REPEATER: "repeater",
  ITEM_CONTAINER: "itemContainer",
  TREE: "tree"
} as const;

export type ItemsHost = typeof ItemsHost[keyof typeof ItemsHost];

export const itemsHosted = new Map<string, ItemsHost>([
  ["ListView", ItemsHost.LIST],
  ["GridView", ItemsHost.LIST],
  ["ItemsRepeater", ItemsHost.REPEATER],
  ["BreadcrumbBar", ItemsHost.REPEATER],
  ["ItemsView", ItemsHost.ITEM_CONTAINER],
  ["TreeView", ItemsHost.TREE]
]);

// How a control that opens over the window is opened from state
// (src/components/hand-written/overlay): the component takes `open` (bindable,
// kept in step with the control's Opened and Closed events), `target` (the
// element it opens next to; by default the one it is written in) and, for a
// dialog, `onresult`. DIALOG shows through ShowAsync, one at a time, in the
// window of its element; FLYOUT through ShowAt that element. Both close
// through Hide.
export const OverlayHost = {
  DIALOG: "dialog",
  FLYOUT: "flyout"
} as const;

export type OverlayHost = typeof OverlayHost[keyof typeof OverlayHost];

export const overlayHosted = new Map<string, OverlayHost>([
  ["ContentDialog", OverlayHost.DIALOG],
  ["Flyout", OverlayHost.FLYOUT],
  ["MenuFlyout", OverlayHost.FLYOUT],
  ["MenuBarItemFlyout", OverlayHost.FLYOUT],
  ["CommandBarFlyout", OverlayHost.FLYOUT],
  ["TextCommandBarFlyout", OverlayHost.FLYOUT],
  ["DatePickerFlyout", OverlayHost.FLYOUT],
  ["TimePickerFlyout", OverlayHost.FLYOUT],
  ["PickerFlyout", OverlayHost.FLYOUT],
  ["ListPickerFlyout", OverlayHost.FLYOUT]
]);

// Exports of the bindings that are not metadata types: the generic
// instantiations the conversions name, under the `alias` where the generated
// name carries a hash.
export const extraBindings: Array<{
  name: string;
  alias?: string;
  module: string;
}> = [
  {
    name: "IReference_Boolean",
    module: "#winui/windows/foundation/IReference_Boolean"
  },
  {
    name: "IReference_Double",
    module: "#winui/windows/foundation/IReference_Double"
  },
  {
    name: "IReference_WindowsFoundationTimeSpan_g75cd585a528e9bb3",
    alias: "IReference_TimeSpan",
    module: "#winui/windows/foundation/IReference_WindowsFoundationTimeSpan_g75cd585a528e9bb3"
  },
  {
    name: "IReference_WindowsFoundationDateTime_g49e2fdd1bcf351db",
    alias: "IReference_DateTime",
    module: "#winui/windows/foundation/IReference_WindowsFoundationDateTime_g49e2fdd1bcf351db"
  },
  {
    name: "IReference_WindowsFoundationPoint_g401c6a14650e6826",
    alias: "IReference_Point",
    module: "#winui/windows/foundation/IReference_WindowsFoundationPoint_g401c6a14650e6826"
  },
  {
    name: "IReference_WindowsFoundationRect_g7d5f48bd5717ecb2",
    alias: "IReference_Rect",
    module: "#winui/windows/foundation/IReference_WindowsFoundationRect_g7d5f48bd5717ecb2"
  },
  // The list components hold their keys in a vector of boxed values (in a
  // vector of groups, a grouped list's), and
  // narrow the controls WinUI hands back (projectAs).
  {
    name: "IVector_Object",
    module: "#winui/windows/foundation/collections/IVector_Object"
  },
  {
    name: "IObservableVector_Object",
    module: "#winui/windows/foundation/collections/IObservableVector_Object"
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
    name: "DurationType"
  },
  {
    namespace: "Microsoft.UI.Xaml.Media.Animation",
    name: "RepeatBehaviorType"
  },
  {
    namespace: "Microsoft.UI.Xaml.Input",
    name: "InputScopeNameValue"
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
  },
  // What a ContentDialog answers (src/components/hand-written/overlay).
  {
    namespace: "Microsoft.UI.Xaml.Controls",
    name: "ContentDialogResult"
  }
];

// How a property's value is written, by the type it holds.
export const PropertyKind = {
  BOOLEAN: "boolean",
  NUMBER: "number",
  STRING: "string",
  ENUM: "enum",
  // An enum whose members are bits (FlagsAttribute): a list of names combines them.
  FLAGS: "flags",
  THICKNESS: "thickness",
  CORNER_RADIUS: "cornerRadius",
  GRID_LENGTH: "gridLength",
  BRUSH: "brush",
  COLOR: "color",
  IMAGE_SOURCE: "imageSource",
  FONT_FAMILY: "fontFamily",
  GLYPH: "glyph",
  URI: "uri",
  DURATION: "duration",
  TIME_SPAN: "timeSpan",
  KEY_TIME: "keyTime",
  REPEAT_BEHAVIOR: "repeatBehavior",
  FONT_WEIGHT: "fontWeight",
  POINT: "point",
  SIZE: "size",
  RECT: "rect",
  MATRIX: "matrix",
  VECTOR3: "vector3",
  DATE_TIME: "dateTime",
  POINT_COLLECTION: "pointCollection",
  DOUBLE_COLLECTION: "doubleCollection",
  INPUT_SCOPE: "inputScope",
  GEOMETRY: "geometry",
  CONTROL_TEMPLATE: "controlTemplate",
  DATA_TEMPLATE: "dataTemplate",
  ITEMS_PANEL_TEMPLATE: "itemsPanelTemplate",
  STYLE: "style",
  RESOURCE_DICTIONARY: "resourceDictionary",
  NULLABLE_BOOLEAN: "nullableBoolean",
  NULLABLE_DOUBLE: "nullableDouble",
  NULLABLE_TIME_SPAN: "nullableTimeSpan",
  NULLABLE_DATE_TIME: "nullableDateTime",
  NULLABLE_POINT: "nullablePoint",
  NULLABLE_RECT: "nullableRect",
  NULLABLE_COLOR: "nullableColor",
  MEDIA_PLAYBACK_SOURCE: "mediaPlaybackSource",
  OBJECT: "object",
  PASSTHROUGH: "passthrough"
} as const;

export type PropertyKind = (typeof PropertyKind)[keyof typeof PropertyKind];

// By "Type.Property", ahead of the type: a string that is also written as a code point.
export const kindOfProperty = new Map<string, PropertyKind>([
  ["FontIcon.Glyph", PropertyKind.GLYPH],
  ["FontIconSource.Glyph", PropertyKind.GLYPH]
]);

// By the full name of the type; anything else a value or a class is handed
// on as the bindings type it.
export const kindOfType = new Map<string, PropertyKind>([
  ["Microsoft.UI.Xaml.Thickness", PropertyKind.THICKNESS],
  ["Microsoft.UI.Xaml.CornerRadius", PropertyKind.CORNER_RADIUS],
  ["Microsoft.UI.Xaml.GridLength", PropertyKind.GRID_LENGTH],
  ["Microsoft.UI.Xaml.Media.Brush", PropertyKind.BRUSH],
  ["Windows.UI.Color", PropertyKind.COLOR],
  ["Microsoft.UI.Xaml.Media.ImageSource", PropertyKind.IMAGE_SOURCE],
  ["Windows.Media.Playback.IMediaPlaybackSource", PropertyKind.MEDIA_PLAYBACK_SOURCE],
  ["Microsoft.UI.Xaml.Media.FontFamily", PropertyKind.FONT_FAMILY],
  ["Windows.Foundation.Uri", PropertyKind.URI],
  ["Microsoft.UI.Xaml.Duration", PropertyKind.DURATION],
  ["Windows.Foundation.TimeSpan", PropertyKind.TIME_SPAN],
  ["Microsoft.UI.Xaml.Media.Animation.KeyTime", PropertyKind.KEY_TIME],
  ["Microsoft.UI.Xaml.Media.Animation.RepeatBehavior", PropertyKind.REPEAT_BEHAVIOR],
  ["Windows.UI.Text.FontWeight", PropertyKind.FONT_WEIGHT],
  ["Windows.Foundation.Point", PropertyKind.POINT],
  ["Windows.Foundation.Size", PropertyKind.SIZE],
  ["Windows.Foundation.Rect", PropertyKind.RECT],
  ["Microsoft.UI.Xaml.Media.Matrix", PropertyKind.MATRIX],
  ["Windows.Foundation.Numerics.Vector3", PropertyKind.VECTOR3],
  ["Windows.Foundation.DateTime", PropertyKind.DATE_TIME],
  ["Microsoft.UI.Xaml.Media.PointCollection", PropertyKind.POINT_COLLECTION],
  ["Microsoft.UI.Xaml.Media.DoubleCollection", PropertyKind.DOUBLE_COLLECTION],
  ["Microsoft.UI.Xaml.Input.InputScope", PropertyKind.INPUT_SCOPE],
  ["Microsoft.UI.Xaml.Media.Geometry", PropertyKind.GEOMETRY],
  ["Microsoft.UI.Xaml.Controls.ControlTemplate", PropertyKind.CONTROL_TEMPLATE],
  ["Microsoft.UI.Xaml.DataTemplate", PropertyKind.DATA_TEMPLATE],
  ["Microsoft.UI.Xaml.Controls.ItemsPanelTemplate", PropertyKind.ITEMS_PANEL_TEMPLATE],
  ["Microsoft.UI.Xaml.Style", PropertyKind.STYLE],
  ["Microsoft.UI.Xaml.ResourceDictionary", PropertyKind.RESOURCE_DICTIONARY]
]);

// The same for a value the metadata types IReference<T> (null when unset), by
// the full name of T.
export const nullableKindOfType = new Map<string, PropertyKind>([
  ["Windows.Foundation.TimeSpan", PropertyKind.NULLABLE_TIME_SPAN],
  ["Windows.Foundation.DateTime", PropertyKind.NULLABLE_DATE_TIME],
  ["Windows.Foundation.Point", PropertyKind.NULLABLE_POINT],
  ["Windows.Foundation.Rect", PropertyKind.NULLABLE_RECT],
  ["Windows.UI.Color", PropertyKind.NULLABLE_COLOR]
]);

export const numericPrimitives = new Set(["SByte", "Byte", "Int16", "UInt16", "Int32", "UInt32", "Single", "Double"]);

// Classes WinUI only accepts made ready (src/components/constructed.ts): the
// component reads these props once, when the control is made, and the helper
// makes the control from them. By class name: the helper, the interface of
// the props, and the props.
export const constructedClasses = new Map<string, {
  helper: string;
  props: string;
  keys: string[];
  // Whether the helper makes the control from XAML and needs the class's XAML name.
  isMadeByXaml: boolean;
}>([
  ["VisualState", {
    helper: "namedByXaml",
    props: "NamedProps",
    keys: ["name"],
    isMadeByXaml: true
  }],
  ["VisualStateGroup", {
    helper: "namedByXaml",
    props: "NamedProps",
    keys: ["name"],
    isMadeByXaml: true
  }],
  ["Setter", {
    helper: "setterAt",
    props: "SetterTargetProps",
    keys: ["target", "path"],
    isMadeByXaml: false
  }]
]);

export type TypeReference = string | {
  module: string;
  name: string;
};

const PACKAGE_MODULE = "winui-svelte/components";

/** The module that exports each enum, with the union of its member names. */
export const ENUMS_MODULE = "winui-svelte/enums";

// The input types whose names the editor can offer for an attribute, with what else each takes
export const OFFERED_INPUTS = new Map<string, TypeReference[]>([
  ["GlyphInput", [
    {
      module: PACKAGE_MODULE,
      name: "FluentGlyphName"
    },
    "string",
    "number",
    "number[]"
  ]],
  ["FontFamilyInput", [
    {
      module: PACKAGE_MODULE,
      name: "FontFamilyName"
    },
    "string"
  ]]
]);
