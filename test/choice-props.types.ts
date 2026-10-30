import type {
  AppBarComponentProps,
  BorderComponentProps,
  ColorInput,
  GridLengthInput,
  KeyboardAcceleratorComponentProps,
  StackPanelComponentProps,
  WindowComponentProps
} from "#src/components/index.js";
import {
  AppBarClosedDisplayMode,
  Backdrop,
  Orientation,
  ThemeBrush,
  TrayBalloonIcon
} from "#src/enums.js";
import type { BalloonOptions } from "#src/tray/index.js";

// Never run: `pnpm check` (tsc) reads it. A prop that takes a closed set of
// values takes exactly that set: each set is given a member, by name and as
// the exported enum's value, and an out-of-set value under an
// `@ts-expect-error` that fails the check if it were accepted.

declare module "#src/components/convert.js" {
  interface AppBrushes {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- a resource key keeps its XAML case
    BrandBrush: true;
  }
}

export const accepted: {
  appBar: readonly AppBarComponentProps[];
  stackPanel: readonly StackPanelComponentProps[];
  accelerator: readonly KeyboardAcceleratorComponentProps[];
  border: readonly BorderComponentProps[];
  window: readonly WindowComponentProps[];
  color: readonly ColorInput[];
  gridLength: readonly GridLengthInput[];
  balloon: BalloonOptions;
} = {
  appBar: [
    { closedDisplayMode: "Minimal" },
    { closedDisplayMode: AppBarClosedDisplayMode.Hidden }
  ],
  stackPanel: [{ orientation: Orientation.Horizontal }],
  accelerator: [{ modifiers: "Control" }, { modifiers: ["Control", "Shift"] }],
  border: [
    { background: "#0078d4" },
    { background: "transparent" },
    { background: "AcrylicBackgroundFillColorDefaultBrush" },
    { background: ThemeBrush.SolidBackgroundFillColorBaseBrush },
    { background: "BrandBrush" }
  ],
  window: [{ backdrop: "micaAlt" }, { backdrop: Backdrop.acrylic }],
  color: ["#fff", "#80ffffff", "transparent"],
  gridLength: [120, "Auto", "*", "2*", "120", "120px"],
  balloon: {
    title: "Saved",
    icon: TrayBalloonIcon.WARNING
  }
};

export const refused: {
  appBar: readonly AppBarComponentProps[];
  stackPanel: readonly StackPanelComponentProps[];
  accelerator: readonly KeyboardAcceleratorComponentProps[];
  border: readonly BorderComponentProps[];
  window: readonly WindowComponentProps[];
  color: readonly ColorInput[];
  gridLength: readonly GridLengthInput[];
  balloon: BalloonOptions;
} = {
  appBar: [
    // @ts-expect-error a member's name is WinUI's own, in its case
    { closedDisplayMode: "minimal" },
    // @ts-expect-error 7 is no member's value
    { closedDisplayMode: 7 }
  ],
  // @ts-expect-error "Diagonal" is no Orientation
  stackPanel: [{ orientation: "Diagonal" }],
  accelerator: [
    // @ts-expect-error a list combines the names of a flag enum only
    { modifiers: ["Control", "Hyper"] },
    // @ts-expect-error a combination is written as a list of names, not a number
    { modifiers: 5 }
  ],
  border: [
    // @ts-expect-error "blue" is neither hex, a color keyword nor a brush resource
    { background: "blue" },
    // @ts-expect-error an app's own brush is named in AppBrushes first
    { background: "UnknownBrush" }
  ],
  // @ts-expect-error "glass" is no Backdrop
  window: [{ backdrop: "glass" }],
  // @ts-expect-error a color is hex text or a keyword
  color: ["red"],
  // @ts-expect-error "auto" is written "Auto", as XAML has it
  gridLength: ["auto"],
  balloon: {
    title: "Saved",
    // @ts-expect-error "question" is no balloon icon
    icon: "question"
  }
};
