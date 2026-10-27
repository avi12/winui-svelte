import { scaleOf } from "./native.ts";
import type { Window } from "#src/winui.js";
import { OverlappedPresenter, projectAs } from "#src/winui.js";

/**
 * What app code does with an open window: `bind:handle` on `<Window>` gives it
 * one. The native Window and AppWindow are there for what this does not cover.
 */
export class WindowHandle {
  /** The native WinUI window. */
  readonly window: Window;
  private isClosed = false;

  constructor(window: Window) {
    this.window = window;
    window.onClosed(() => {
      this.isClosed = true;
    });
  }

  /** The native AppWindow: position, size, icon and the rest of the windowing API. */
  get appWindow() {
    return this.window.appWindow;
  }

  /** Device pixels per device-independent pixel (the window's DPI over 96). */
  get scale() {
    return scaleOf(this.appWindow.id.value);
  }

  /**
   * The overlapped presenter (minimize, maximize, restore, the size limits):
   * what a window has until the app gives it another (compact overlay, full
   * screen).
   */
  get presenter() {
    return projectAs(this.appWindow.presenter, OverlappedPresenter);
  }

  /** Shows the window and gives it focus. */
  activate() {
    this.window.activate();
  }

  /** Minimizes the window. */
  minimize() {
    this.presenter.minimize();
  }

  /** Maximizes the window. */
  maximize() {
    this.presenter.maximize();
  }

  /** Out of minimized or maximized to its normal size. */
  restore() {
    this.presenter.restore();
  }

  /** Restored, shown and focused: what launching an app again does. */
  bringToFront() {
    this.restore();
    this.activate();
  }

  /** Closes the window. Closing a closed window is a no-op. */
  close() {
    if (!this.isClosed) {
      this.window.close();
    }
  }
}
