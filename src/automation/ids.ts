/**
 * The control types of UI Automation (`UIA_*ControlTypeId` in
 * `UIAutomationClient.h`), by name.
 */
export const UiaControlType = {
  button: 50000,
  calendar: 50001,
  checkBox: 50002,
  comboBox: 50003,
  edit: 50004,
  hyperlink: 50005,
  image: 50006,
  listItem: 50007,
  list: 50008,
  menu: 50009,
  menuBar: 50010,
  menuItem: 50011,
  progressBar: 50012,
  radioButton: 50013,
  scrollBar: 50014,
  slider: 50015,
  spinner: 50016,
  statusBar: 50017,
  tab: 50018,
  tabItem: 50019,
  text: 50020,
  toolBar: 50021,
  toolTip: 50022,
  tree: 50023,
  treeItem: 50024,
  custom: 50025,
  group: 50026,
  thumb: 50027,
  dataGrid: 50028,
  dataItem: 50029,
  document: 50030,
  splitButton: 50031,
  window: 50032,
  pane: 50033,
  header: 50034,
  headerItem: 50035,
  table: 50036,
  titleBar: 50037,
  separator: 50038,
  semanticZoom: 50039,
  appBar: 50040
} as const;

/** One control type of UI Automation. */
export type UiaControlType = typeof UiaControlType[keyof typeof UiaControlType];

/**
 * The properties of an element that the client reads (`UIA_*PropertyId` in
 * `UIAutomationClient.h`).
 */
export const UiaPropertyId = {
  boundingRectangle: 30001,
  processId: 30002,
  controlType: 30003,
  name: 30005,
  isEnabled: 30010,
  automationId: 30011,
  className: 30012,
  isControlElement: 30016,
  nativeWindowHandle: 30020,
  isOffscreen: 30022,
  isTextPatternAvailable: 30040,
  isValuePatternAvailable: 30043,
  headingLevel: 30173
} as const;

/** One property of UI Automation. */
export type UiaPropertyId = typeof UiaPropertyId[keyof typeof UiaPropertyId];

/** The patterns of an element that the client reads (`UIA_*PatternId`). */
export const UiaPatternId = {
  value: 10002,
  text: 10014
} as const;

/** The names a caller gives a pattern, `element.pattern("text")`. */
export const UiaPatternName = {
  text: "text",
  value: "value"
} as const;

/** One pattern name. */
export type UiaPatternName = typeof UiaPatternName[keyof typeof UiaPatternName];

/**
 * `HeadingLevel_None` (80050): the value of the heading level property of an
 * element that is not a heading.
 */
export const HEADING_LEVEL_NONE = 80050;

/** `HeadingLevel1` (80051): the property value of a first level heading; level 9 is 80059. */
export const HEADING_LEVEL_FIRST = 80051;
