// The classes of WinUI's metadata that are not components, and why. The
// coverage test fails for a class that is neither a component, in
// `nonConstructible` (tables.ts), nor here.

const XAML = "Microsoft.UI.Xaml";

export const handWrittenComponents = new Map<string, string>([
  [`${XAML}.Window`, "src/components/hand-written/Window.svelte: the root of an app, not an element"]
]);

// A family of classes matched by the end of the full name or a namespace prefix.
// A pattern that matches nothing fails the coverage test.
export const notComponentPatterns: Array<{
  suffix?: string;
  namespacePrefix?: string;
  reason: string;
}> = [
  {
    namespacePrefix: "Microsoft.Graphics.Canvas",
    reason: "Win2D drawing API, not an element: an app makes these in a draw handler through winui-svelte/win2d (the controls themselves are components)"
  },
  {
    suffix: "AutomationPeer",
    reason: "a UI Automation peer: WinUI makes them for its own controls, an app writes one only to subclass a control"
  },
  {
    suffix: "EventArgs",
    reason: "event data a handler receives, never made by an app"
  },
  {
    suffix: "Identifiers",
    reason: "static identifiers of UI Automation properties and patterns"
  },
  {
    suffix: "TemplateSettings",
    reason: "values WinUI computes for a control template, read-only to an app"
  },
  {
    suffix: "Helper",
    reason: "a static helper of functions, no element"
  },
  {
    suffix: "Attribute",
    reason: "an attribute of the XAML compiler or of the metadata, no object"
  },
  {
    suffix: "Deferral",
    reason: "a deferral a handler completes, handed out by WinUI"
  },
  {
    suffix: "VisualSource",
    reason: "an animated visual source an AnimatedVisualPlayer takes by its source property, no element"
  },
  {
    suffix: "Converter",
    reason: "a value converter of WinUI's own control templates"
  },
  {
    suffix: "SnapPoint",
    reason: "a snap point an app adds to a ScrollViewer through code, not an element"
  },
  {
    suffix: "SnapPointBase",
    reason: "the abstract base of the snap points"
  },
  {
    suffix: "Collection",
    reason: "a collection WinUI creates and owns: the snippet of the property that holds it fills it"
  },
  {
    suffix: "ConnectedAnimationConfiguration",
    reason: "an option of ConnectedAnimation, made when an animation is configured"
  },
  {
    suffix: "LayoutContext",
    reason: "state WinUI hands to a custom layout, which an app subclasses and no component can"
  },
  {
    namespacePrefix: `${XAML}.Automation.Provider`,
    reason: "a UI Automation provider interface an app implements through a peer"
  },
  {
    suffix: "AutomationPeerAnnotation",
    reason: "a value an app assigns to a peer's annotations"
  },
  {
    namespacePrefix: `${XAML}.CustomAttributes`,
    reason: "an attribute of WinUI's own build"
  },
  {
    namespacePrefix: `${XAML}.Hosting`,
    reason: "XAML hosting for another shell: this package is the host"
  },
  {
    namespacePrefix: `${XAML}.XamlTypeInfo`,
    reason: "the metadata provider of the XAML compiler"
  },
  {
    namespacePrefix: `${XAML}.Resources`,
    reason: "the resource string loader the XAML compiler wires"
  }
];

const singles: Array<[string, string, string]> = [
  [XAML, "Application", "the app singleton: the app and window subpaths own its lifecycle"],
  [XAML, "ApplicationInitializationCallbackParams", "passed by WinUI to the start callback"],
  [`${XAML}.Automation`, "AutomationAnnotation", "a value an app assigns to an element's annotations, not an element"],
  [`${XAML}.Automation`, "AutomationProperties", "static attached properties, reached through the automation props"],
  [`${XAML}.Automation`, "AutomationProperty", "an identifier of a UI Automation property"],
  [XAML, "BringIntoViewOptions", "the options of one bring-into-view call"],
  [XAML, "BrushTransition", "a transition object of an element property, set through its prop"],
  [XAML, "ScalarTransition", "a transition object of an element property, set through its prop"],
  [XAML, "Vector3Transition", "a transition object of an element property, set through its prop"],
  [XAML, "ResourceDictionary", "the resources prop takes a plain record (resource-record.ts)"],
  [`${XAML}.Controls`, "XamlControlsResources", "WinUI's theme resources, merged by the app subpath"],
  [XAML, "ColorPaletteResources", "the css subpath writes the palette"],
  [`${XAML}.Controls`, "AnnotatedScrollBarLabel", "a value of AnnotatedScrollBar's labels"],
  [`${XAML}.Controls`, "ItemCollection", "the items of an ItemsControl: the items host owns them"],
  [`${XAML}.Controls`, "ItemCollectionTransition", "made by WinUI for a transition provider"],
  [`${XAML}.Controls`, "ItemCollectionTransitionProgress", "made by WinUI for a transition provider"],
  [`${XAML}.Controls`, "ItemCollectionTransitionProvider", "a base class an app subclasses to animate items"],
  [`${XAML}.Controls`, "LinedFlowLayoutItemCollectionTransitionProvider", "the provider LinedFlowLayout makes for itself"],
  [`${XAML}.Controls`, "ItemContainerGenerator", "made by WinUI for an ItemsControl"],
  [`${XAML}.Controls`, "ItemsSourceView", "the view an ItemsRepeater makes of its source"],
  [`${XAML}.Controls`, "ListViewPersistenceHelper", "a static helper that saves and restores a ListView's scroll"],
  [`${XAML}.Controls`, "ScrollViewerView", "the target of one change-view call"],
  [`${XAML}.Controls`, "ScrollingScrollOptions", "the options of one scroll call"],
  [`${XAML}.Controls`, "ScrollingZoomOptions", "the options of one zoom call"],
  [`${XAML}.Controls`, "SemanticZoomLocation", "the data of a view change event"],
  [`${XAML}.Controls`, "DataTemplateSelector", "an app subclass: the items hosts take a snippet"],
  [`${XAML}.Controls`, "StyleSelector", "an app subclass: a prop sets the style"],
  [`${XAML}.Controls`, "GroupStyleSelector", "an app subclass: a prop sets the group style"],
  [`${XAML}.Controls`, "ToolTipService", "static attached properties, reached through the toolTip prop"],
  [`${XAML}.Controls.Primitives`, "FlyoutShowOptions", "the options of one show call"],
  [`${XAML}.Controls.Primitives`, "LayoutInformation", "a static helper that reads layout slots"],
  [`${XAML}.Controls.Primitives`, "LoopingSelector", "an internal part of the date and time pickers"],
  [`${XAML}.Controls.Primitives`, "LoopingSelectorItem", "an internal part of the date and time pickers"],
  [`${XAML}.Controls.Primitives`, "LoopingSelectorPanel", "an internal part of the date and time pickers"],
  [`${XAML}.Controls`, "DatePickerFlyoutItem", "an item WinUI makes for its date picker flyout"],
  [`${XAML}.Controls`, "DatePickerFlyoutPresenter", "the presenter of a flyout, made by WinUI"],
  [`${XAML}.Controls`, "TimePickerFlyoutPresenter", "the presenter of a flyout, made by WinUI"],
  [`${XAML}.Controls`, "ListPickerFlyoutPresenter", "the presenter of a flyout, made by WinUI"],
  [`${XAML}.Controls`, "PickerFlyoutPresenter", "the presenter of a flyout, made by WinUI"],
  [`${XAML}.Controls`, "MapElement", "needs a MapControl, which WinUI 3 does not ship"],
  [`${XAML}.Controls`, "MapLayer", "needs a MapControl, which WinUI 3 does not ship"],
  [`${XAML}.Controls`, "InputPropertyAttribute", "an attribute of the animated visuals"],
  [`${XAML}.Controls`, "ControlTemplate", "templates are snippets or css in this package"],
  [`${XAML}.Controls`, "ItemsPanelTemplate", "the layout of items is a prop or a panel component"],
  [XAML, "DataTemplate", "the items hosts take a snippet instead"],
  [XAML, "DataTemplateKey", "a resource key of the XAML compiler"],
  [XAML, "DebugSettings", "a diagnostic switch reached through Application"],
  [XAML, "DependencyProperty", "a handle, not an object an app makes"],
  [XAML, "PropertyMetadata", "the metadata of a custom property, which needs a managed type"],
  [XAML, "DispatcherTimer", "JavaScript has its own timers"],
  [XAML, "DragOperationDeferral", "a deferral a drag handler completes"],
  [XAML, "DragUI", "the drag visual of one drag event"],
  [XAML, "DragUIOverride", "the drag visual of one drag event"],
  [XAML, "ElementFactoryGetArgs", "the arguments of an element factory call"],
  [XAML, "ElementFactoryRecycleArgs", "the arguments of an element factory call"],
  [XAML, "ElementSoundPlayer", "a static sound switch"],
  [XAML, "FrameworkView", "the UWP application view, which WinUI 3 desktop does not use"],
  [XAML, "FrameworkViewSource", "the UWP application view source, which WinUI 3 desktop does not use"],
  [XAML, "XamlIsland", "hosting of XAML in another shell"],
  [XAML, "XamlRoot", "reached from an element, made by WinUI"],
  [XAML, "PropertyPath", "a path of XAML bindings and storyboards, which JavaScript does not need"],
  [XAML, "TargetPropertyPath", "a path of XAML bindings and storyboards, which JavaScript does not need"],
  [XAML, "DependencyObject", "the root of the hierarchy: the abstract base of every component"],
  [XAML, "FrameworkTemplate", "the abstract base of the templates"],
  [XAML, "RoutedEvent", "a handle of a routed event, not an object an app makes"],
  [`${XAML}.Controls`, "ColumnDefinition", "made from the columns prop of a grid"],
  [`${XAML}.Controls`, "RowDefinition", "made from the rows prop of a grid"],
  [`${XAML}.Media`, "GeneralTransform", "the abstract base of the transforms"],
  [`${XAML}.Media`, "XamlLight", "the abstract base of the XAML lights, which an app subclasses"],
  [`${XAML}.Media.Imaging`, "SurfaceImageSource", "draws through Direct2D on a native surface, which JavaScript cannot reach"],
  [`${XAML}.Media.Imaging`, "VirtualSurfaceImageSource", "draws through Direct2D on a native surface, which JavaScript cannot reach"],
  [`${XAML}.Media.Imaging`, "WriteableBitmap", "takes its size when it is made; writeableBitmapOf in winui-svelte/media makes one from pixels"],
  [XAML, "Style", "the class and style props are the styling surface"],
  [XAML, "TriggerBase", "the base of EventTrigger"],
  [XAML, "TriggerAction", "the base of BeginStoryboard"],
  [XAML, "EventTrigger", "runs only from a XAML Loaded event: use a storyboard"],
  [XAML, "VisualStateManager", "the attached owner of the visual state groups, reached through their component"],
  [`${XAML}.Data`, "BindableAttribute", "an attribute of the XAML compiler"],
  [`${XAML}.Data`, "BindingBase", "bindings are the Svelte props"],
  [`${XAML}.Data`, "Binding", "bindings are the Svelte props"],
  [`${XAML}.Data`, "BindingExpressionBase", "bindings are the Svelte props"],
  [`${XAML}.Data`, "BindingExpression", "bindings are the Svelte props"],
  [`${XAML}.Data`, "BindingOperations", "a static helper of XAML bindings"],
  [`${XAML}.Data`, "ItemIndexRange", "an argument of an items source change"],
  [`${XAML}.Data`, "RelativeSource", "part of XAML bindings"],
  [XAML, "DependencyObjectCollection", "a collection WinUI creates and owns"],
  [`${XAML}.Documents`, "TextPointer", "a position in a rich text block, a value an app reads"],
  [`${XAML}.Documents`, "Typography", "static attached properties, reached through the typography props"],
  [`${XAML}.Documents`, "TextHighlighterBase", "the abstract base of TextHighlighter"],
  [`${XAML}.Input`, "AccessKeyManager", "a static helper"],
  [`${XAML}.Input`, "FindNextElementOptions", "the options of one focus search"],
  [`${XAML}.Input`, "FocusManager", "a static helper"],
  [`${XAML}.Input`, "FocusMovementResult", "the result of one focus move"],
  [`${XAML}.Input`, "InertiaExpansionBehavior", "legacy manipulation inertia setting"],
  [`${XAML}.Input`, "InertiaRotationBehavior", "legacy manipulation inertia setting"],
  [`${XAML}.Input`, "InertiaTranslationBehavior", "legacy manipulation inertia setting"],
  [`${XAML}.Input`, "ManipulationPivot", "legacy manipulation setting"],
  [`${XAML}.Input`, "Pointer", "the pointer of one event"],
  [`${XAML}.Input`, "InputScope", "a value of TextBox's input scope"],
  [`${XAML}.Input`, "InputScopeName", "a value of TextBox's input scope"],
  [`${XAML}.Markup`, "MarkupExtension", "a XAML extension point"],
  [`${XAML}.Markup`, "ProvideValueTargetProperty", "a XAML extension point"],
  [`${XAML}.Markup`, "XamlBinaryWriter", "the XAML compiler's writer"],
  [`${XAML}.Markup`, "XamlMarkupHelper", "a static helper of the XAML compiler"],
  [`${XAML}.Markup`, "XamlReader", "reached through the xaml subpath"],
  [`${XAML}.Media.Animation`, "BeginStoryboard", "runs only from a XAML Loaded event: use a storyboard"],
  [`${XAML}.Media.Animation`, "ConnectedAnimation", "made by ConnectedAnimationService for one navigation"],
  [`${XAML}.Media.Animation`, "ConnectedAnimationService", "a static service of the navigation helpers"],
  [`${XAML}.Media.Animation`, "NavigationTransitionInfo", "the abstract base of the navigation transitions"],
  [`${XAML}.Media.Animation`, "Transition", "the abstract base of the element transitions"],
  [`${XAML}.Media.Animation`, "EasingFunctionBase", "the abstract base of the easing functions"],
  [`${XAML}.Media.Animation`, "Timeline", "the abstract base of the animations"],
  [`${XAML}.Media`, "CompositionTarget", "static render events"],
  [`${XAML}.Media`, "FontFamily", "a value: the fontFamily prop takes a string"],
  [`${XAML}.Media`, "LoadedImageSurface", "a composition surface, not an element"],
  [`${XAML}.Media.Imaging`, "XamlRenderingBackgroundTask", "a UWP background task"],
  [`${XAML}.Media`, "VisualTreeHelper", "a static helper"],
  [`${XAML}.Media`, "Projection", "the abstract base of the projections"],
  [`${XAML}.Media.Media3D`, "Transform3D", "the abstract base of the 3D transforms"],
  [`${XAML}.Navigation`, "FrameNavigationOptions", "the options of one navigation"],
  [`${XAML}.Navigation`, "PageStackEntry", "an entry of a Frame's back stack"],
  [`${XAML}.Printing`, "PrintDocument", "needs the UWP printing contract"]
];

export const notComponents = new Map<string, string>(
  singles.map(([namespace, name, reason]) => [`${namespace}.${name}`, reason])
);

// Classes that should become components and have not yet. The coverage test
// lists them as gaps; a class leaves this table when it is generated.
export const knownGaps = new Map<string, string>();
