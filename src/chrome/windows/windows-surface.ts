import type { ChromeWindowSurface } from "./window-surface.ts";
import { WindowState } from "./window-types.ts";
import { applyPresentation, presentationOf } from "#src/window/apply-chrome.js";
import { WindowPresentation } from "#src/window/chrome.js";
import { foregroundWindowHandle } from "#src/window/native.js";
import { TaskbarFlashUntil } from "#src/window/taskbar-calls.js";
import type { WindowHandle } from "#src/window/window-handle.js";
import { OverlappedPresenterState, WindowActivationState } from "#src/winui.js";

const OVERLAPPED_STATES = new Map<OverlappedPresenterState, WindowState>([
  [OverlappedPresenterState.Maximized, WindowState.maximized],
  [OverlappedPresenterState.Minimized, WindowState.minimized],
  [OverlappedPresenterState.Restored, WindowState.normal]
]);

function stateOf(handle: WindowHandle) {
  const isFullScreen = presentationOf(handle.appWindow) === WindowPresentation.fullScreen;
  if (isFullScreen) {
    return WindowState.fullscreen;
  }

  return OVERLAPPED_STATES.get(handle.presenter.state) ?? WindowState.normal;
}

function windowedPresenter(handle: WindowHandle) {
  const isWindowed = presentationOf(handle.appWindow) === WindowPresentation.windowed;
  if (!isWindowed) {
    applyPresentation({
      appWindow: handle.appWindow,
      presentation: WindowPresentation.windowed
    });
  }

  return handle.presenter;
}

function applyState({ handle, state }: {
  handle: WindowHandle;
  state: WindowState;
}) {
  const isFullScreen = state === WindowState.fullscreen || state === WindowState.lockedFullscreen;
  if (isFullScreen) {
    applyPresentation({
      appWindow: handle.appWindow,
      presentation: WindowPresentation.fullScreen
    });
    return;
  }

  const presenter = windowedPresenter(handle);
  const isMinimized = state === WindowState.minimized;
  if (isMinimized) {
    presenter.minimize();
  } else if (state === WindowState.maximized) {
    presenter.maximize();
  } else {
    presenter.restore();
  }
}

/**
 * Makes a `WindowHandle` into what `ChromeWindows` works on: its bounds and
 * state from the `AppWindow` and its presenter, its focus from whether it is
 * the foreground window, flashing through its taskbar button.
 *
 * @param handle - A window, from `bind:handle` on `<Window>` or `createWindow`.
 * @returns The window as a `ChromeWindowSurface`.
 */
export function chromeWindowSurface(handle: WindowHandle) {
  const { appWindow, window } = handle;
  function bounds() {
    return {
      x: appWindow.position.x,
      y: appWindow.position.y,
      width: appWindow.size.width,
      height: appWindow.size.height
    };
  }
  return {
    bounds,
    state: () => stateOf(handle),
    isFocused: () => foregroundWindowHandle() === appWindow.id.value,
    isAlwaysOnTop: () => presentationOf(appWindow) === WindowPresentation.windowed && handle.presenter.isAlwaysOnTop,
    setBounds(changes) {
      appWindow.moveAndResize({
        ...bounds(),
        ...changes
      });
    },
    setState: state => applyState({
      handle,
      state
    }),
    focus: () => handle.bringToFront(),
    drawAttention(isOn) {
      if (isOn) {
        handle.taskbar.flash({ until: TaskbarFlashUntil.FOREGROUND });
      } else {
        handle.taskbar.stopFlashing();
      }
    },
    close: () => handle.close(),
    onFocusChanged: listener => window.onActivated((_sender, event) => {
      listener(event.windowActivationState !== WindowActivationState.Deactivated);
    }),
    onBoundsChanged: listener => appWindow.onChanged((_sender, event) => {
      const isMoved = event.didPositionChange || event.didSizeChange;
      if (isMoved) {
        listener();
      }
    }),
    onClosed: listener => window.onClosed(listener)
  } satisfies ChromeWindowSurface;
}
