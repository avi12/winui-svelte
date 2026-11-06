import type { WindowBounds } from "./anchor.ts";
import { applyPresentation, presentationOf } from "./apply-chrome.ts";
import { isBackgroundRun } from "./background-mode.ts";
import { WindowPresentation } from "./chrome.ts";
import type { WindowHandle } from "./window-handle.ts";
import type { SavedWindowState } from "./window-state.ts";
import {
  parseWindowState,
  rescaledBounds,
  restoredBounds,
  serializeWindowState,
  WindowRestoreState
} from "./window-state.ts";
import { appDataFolder } from "#src/web-apis/app-data-folder.js";
import { atomicFile } from "#src/web-apis/atomic-file.js";
import type { StorageFile } from "#src/web-apis/atomic-file.js";
import { AppWindowPresenterKind, DisplayArea, DisplayAreaFallback, OverlappedPresenterState } from "#src/winui.js";
import path from "node:path";

const FOLDER_NAME = "window-state";
const FILE_EXTENSION = ".json";
const SAVE_DELAY_MILLISECONDS = 400;
const HEXADECIMAL = 16;
const UNSAFE_FILE_NAME_CHARACTER = /[^A-Za-z0-9.-]/g;

function fileNameOf(key: string) {
  const safe = key.replace(UNSAFE_FILE_NAME_CHARACTER, character => `_${character.codePointAt(0)?.toString(HEXADECIMAL)}`);
  return `${safe}${FILE_EXTENSION}`;
}

/** The file a window's place is kept in: under the app's local data folder, one per key. */
export function windowStateFile(key: string) {
  return atomicFile(path.join(appDataFolder({}), FOLDER_NAME, fileNameOf(key)));
}

const RESTORE_STATES = new Map<OverlappedPresenterState, WindowRestoreState>([
  [OverlappedPresenterState.Maximized, WindowRestoreState.maximized],
  [OverlappedPresenterState.Minimized, WindowRestoreState.minimized],
  [OverlappedPresenterState.Restored, WindowRestoreState.normal]
]);

/**
 * Keeps a window where its user left it: restores the saved place before the
 * window first shows, and saves it (debounced) whenever the window moves,
 * resizes or changes state, and when it closes.
 */
export class WindowStateKeeper {
  private readonly handle: WindowHandle;
  private readonly file: StorageFile;
  private normalBounds: WindowBounds;
  private state: WindowRestoreState = WindowRestoreState.normal;
  private presentation: WindowPresentation = WindowPresentation.windowed;
  private saved: SavedWindowState | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor({ handle, file }: {
    handle: WindowHandle;
    file: StorageFile;
  }) {
    this.handle = handle;
    this.file = file;
    this.normalBounds = this.currentBounds();
  }

  /**
   * Moves and resizes the window to the saved place, kept inside the work
   * area of the nearest display. A background run keeps the place as saved,
   * since its windows are off screen on purpose.
   *
   * @param isPresentationFree - Whether the window may take the saved presentation (no presentation prop).
   * @returns Whether a saved place was found.
   */
  restore({ isPresentationFree }: { isPresentationFree: boolean }) {
    this.saved = parseWindowState(this.file.read());
    const { saved } = this;
    if (!saved) {
      return false;
    }

    const { appWindow } = this.handle;
    appWindow.move({
      x: saved.bounds.x,
      y: saved.bounds.y
    });
    const { scale } = this.handle;
    const bounds = this.fittedBounds({
      saved,
      scale
    });
    appWindow.moveAndResize(bounds);
    this.normalBounds = bounds;
    const isPresentationToRestore = isPresentationFree && saved.presentation !== WindowPresentation.windowed;
    if (isPresentationToRestore) {
      applyPresentation({
        appWindow,
        presentation: saved.presentation
      });
    }

    return true;
  }

  /** Maximizes or minimizes the window as it was saved; call once it is shown. */
  restoreState() {
    const { saved } = this;
    const isToRestore = saved !== null && this.isOverlapped;
    if (!isToRestore) {
      return;
    }

    const isMaximized = saved.state === WindowRestoreState.maximized;
    const isMinimized = saved.state === WindowRestoreState.minimized;
    if (isMaximized) {
      this.handle.maximize();
    }

    if (isMinimized) {
      this.handle.minimize();
    }
  }

  /** The window moved, resized or changed state: remembers it and saves soon. */
  changed() {
    this.sample();

    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => this.saveNow(), SAVE_DELAY_MILLISECONDS);
  }

  /** Saves what the window is now, without waiting. */
  saveNow() {
    this.cancel();
    this.sample();
    this.file.write(
      serializeWindowState({
        bounds: this.normalBounds,
        scale: this.handle.scale,
        state: this.state,
        presentation: this.presentation
      })
    );
  }

  /** Drops a save that has not happened yet. */
  cancel() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private get isOverlapped() {
    return this.handle.appWindow.presenter.kind === AppWindowPresenterKind.Overlapped;
  }

  private currentBounds() {
    const { position, size } = this.handle.appWindow;
    return {
      x: position.x,
      y: position.y,
      width: size.width,
      height: size.height
    };
  }

  private fittedBounds({ saved, scale }: {
    saved: SavedWindowState;
    scale: number;
  }) {
    if (isBackgroundRun()) {
      return rescaledBounds({
        bounds: saved.bounds,
        from: saved.scale,
        to: scale
      });
    }

    const area = DisplayArea.getFromRect(saved.bounds, DisplayAreaFallback.Nearest).workArea;
    return restoredBounds({
      saved,
      scale,
      area
    });
  }

  // The normal bounds are the window's own only while it is restored; a
  // maximized, minimized or full screen window keeps the last ones.
  private sample() {
    const { appWindow } = this.handle;
    this.presentation = presentationOf(appWindow);

    if (!this.isOverlapped) {
      return;
    }

    this.state = RESTORE_STATES.get(this.handle.presenter.state) ?? WindowRestoreState.normal;
    const isNormal = this.state === WindowRestoreState.normal;
    if (isNormal) {
      this.normalBounds = this.currentBounds();
    }
  }
}
