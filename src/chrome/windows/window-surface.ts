import type { WindowState } from "./window-types.ts";
import type { WindowBounds } from "#src/window/anchor.js";

/** What `ChromeWindows` needs of a window; `chromeWindowSurface` makes one of a `WindowHandle`, a test gives a fake. */
export interface ChromeWindowSurface {
  /** Position and size in device pixels. */
  bounds(): WindowBounds;
  state(): WindowState;
  isFocused(): boolean;
  isAlwaysOnTop(): boolean;

  /** Moves and resizes; a side not given stays. */
  setBounds(bounds: Partial<WindowBounds>): void;
  setState(state: WindowState): void;

  /** Shows the window and gives it focus. */
  focus(): void;

  /** Flashes the taskbar button until the window is brought forward, or stops it. */
  drawAttention(isOn: boolean): void;
  close(): void;

  /** Each `on` method returns what stops listening. */
  onFocusChanged(listener: (isFocused: boolean) => void): () => void;
  onBoundsChanged(listener: () => void): () => void;
  onClosed(listener: () => void): () => void;
}
