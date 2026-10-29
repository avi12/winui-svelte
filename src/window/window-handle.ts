import { scaleOf } from "./native.ts";
import type { OpenFilePickerOptions, PickerOptions, SaveFilePickerOptions } from "./pickers.ts";
import { pickFile, pickFiles, pickFolder, saveFile } from "./pickers.ts";
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
  private isClosed = false;
  private closeGuard = () => false;

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
    return pickFiles({
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
