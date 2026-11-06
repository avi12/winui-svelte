import { applyShownInSwitchers } from "./apply-chrome.ts";
import type { DockOptions } from "./dock.ts";
import { dockWindow } from "./dock.ts";
import { scaleOf } from "./native.ts";
import type { OpenFilePickerOptions, PickerOptions, SaveFilePickerOptions } from "./pickers.ts";
import { pickFile, pickFilePaths, pickFolder, saveFile } from "./pickers.ts";
import { createTaskbarButton } from "./taskbar.ts";
import type { TaskbarButton } from "./taskbar.ts";
import { WindowGeometry } from "#src/web-apis/window-geometry.js";
import type { Window } from "#src/winui.js";
import {
  FileOpenPicker,
  FileSavePicker,
  FolderPicker,
  OverlappedPresenter,
  projectAs
} from "#src/winui.js";

/**
 * What app code does with an open window: `bind:handle` on `<Window>` gives it
 * one. The native Window and AppWindow are there for what this does not cover.
 */
export class WindowHandle {
  /** The native WinUI window. */
  readonly window: Window;

  /**
   * The window's size and place as the web has them: `outerWidth`,
   * `screenX`, `resizeTo`, `moveBy` and the rest, in CSS pixels.
   */
  readonly geometry: WindowGeometry;
  private isClosed = false;
  private taskbarButton: TaskbarButton | null = null;
  private closeGuard = () => false;

  constructor(window: Window) {
    this.window = window;
    this.geometry = new WindowGeometry(window.appWindow, () => this.scale);
    window.onClosed(() => {
      this.isClosed = true;
    });
  }

  /**
   * The window's button on the taskbar: a progress bar, an overlay icon and
   * flashing. Needs no package identity.
   */
  get taskbar() {
    this.taskbarButton ??= createTaskbarButton(this.appWindow.id.value);
    return this.taskbarButton;
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

  /**
   * Shows or hides the window's taskbar button and Alt+Tab entry. Unlike
   * `appWindow.isShownInSwitchers`, it does not throw for a window that has no
   * button to hide.
   */
  setShownInSwitchers(isShown: boolean) {
    applyShownInSwitchers({
      appWindow: this.appWindow,
      isShown
    });
  }

  /**
   * Moves the window against a corner of a display's work area (the display
   * minus the taskbar), `inset` device pixels in from both edges: an overlay
   * that sits bottom-right above the taskbar of the display the user is on.
   * With `sizeToContent` and the same `anchor` on the window, the corner stays
   * as the content grows.
   *
   * @param options - The corner, the inset in device pixels and the display (the active one by default).
   */
  dock(options: DockOptions) {
    dockWindow({
      appWindow: this.appWindow,
      ...options
    });
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

  /**
   * Asks the user for a file in the system open dialog, over this window.
   * Needs no package identity. Call it on the UI thread.
   *
   * @param options - The dialog title, start folder, accepted file types and so on.
   * @returns The file path, or null when the user cancelled.
   */
  pickFile(options: OpenFilePickerOptions = {}) {
    return pickFile({
      picker: new FileOpenPicker(this.appWindow.id),
      options
    });
  }

  /**
   * Asks the user for any number of files in the system open dialog, over
   * this window.
   *
   * @param options - The dialog title, start folder, accepted file types and so on.
   * @returns The file paths in the order picked; empty when the user cancelled.
   */
  pickFiles(options: OpenFilePickerOptions = {}) {
    return pickFilePaths({
      picker: new FileOpenPicker(this.appWindow.id),
      options
    });
  }

  /**
   * Asks the user for a folder in the system folder dialog, over this window.
   *
   * @param options - The dialog title, start folder and so on.
   * @returns The folder path, or null when the user cancelled.
   */
  pickFolder(options: PickerOptions = {}) {
    return pickFolder({
      picker: new FolderPicker(this.appWindow.id),
      options
    });
  }

  /**
   * Asks the user where to save a file in the system save dialog, over this
   * window. The file is not made: the app writes it.
   *
   * @param options - The dialog title, suggested name, offered file types and so on.
   * @returns The path the user chose, or null when the user cancelled.
   */
  saveFile(options: SaveFilePickerOptions = {}) {
    return saveFile({
      picker: new FileSavePicker(this.appWindow.id),
      options
    });
  }

  /**
   * Sets what is asked before `close` closes the window: `true` keeps it
   * open. WinUI's own Closing event is raised only for a close the user
   * asks for (the close button, Alt+F4), not for Window.Close().
   */
  guardClose(guard: () => boolean) {
    this.closeGuard = guard;
  }

  /** Closes the window, unless the window component's `onClosing` keeps it open. Closing a closed window is a no-op. */
  close() {
    const isCloseAllowed = !this.isClosed && !this.closeGuard();
    if (isCloseAllowed) {
      this.window.close();
    }
  }
}
