import type { ClipboardContent } from "./clipboard.ts";
import { dataTransferOf } from "./clipboard.ts";
import { fillPackage } from "./package-io.ts";
import { dataTransferManagerOf, showShareUiForWindow } from "./share-interop.ts";
import { targetOf } from "./winrt-package.ts";
import { DataTransferManager } from "#winui/windows/application-model/data-transfer/DataTransferManager";

/** What `share` offers to other apps. */
export interface ShareContent extends ClipboardContent {
  /**
   * The window to share from. A process without a package identity (plain
   * Node.js, Electron) can share only from a window: the pane is opened
   * through `IDataTransferManagerInterop`.
   */
  window?: ShareWindow;

  /** The title the share pane shows. */
  title: string;
  description?: string;
}

/** The window the share pane opens from: a `WindowHandle` or the native `Window`. */
export interface ShareWindow {
  readonly appWindow: {
    readonly id: {
      readonly value: bigint;
    };
  };
}

/** Thrown by `share` when Windows has no share pane for this app. */
export class ShareUnavailableError extends Error {
  override readonly name = "ShareUnavailableError";
}

function managerOf() {
  try {
    return DataTransferManager.getForCurrentView();
  } catch (error) {
    throw new ShareUnavailableError("the share pane needs an app with a package identity; this process has none", { cause: error });
  }
}

/**
 * Opens the system share pane with some content. Give it the `window` to
 * share from: that works in an unpackaged process too. Without a window it
 * uses `GetForCurrentView`, which needs a package identity (a packaged or
 * sparse-packaged app), and throws a `ShareUnavailableError` otherwise.
 *
 * @param content - What to share.
 * @throws {ShareUnavailableError} When the app cannot show the share pane.
 */
export function share(content: ShareContent) {
  const isSupported = DataTransferManager.isSupported();
  if (!isSupported) {
    throw new ShareUnavailableError("this version of Windows has no share pane");
  }

  const hwnd = content.window?.appWindow.id.value;
  const isFromWindow = hwnd !== undefined;
  const manager = isFromWindow ? dataTransferManagerOf(hwnd) : managerOf();
  const transfer = dataTransferOf(content);
  const stop = manager.onDataRequested(async (_sender, args) => {
    const { request } = args;
    const deferral = request.getDeferral();
    try {
      request.data.properties.title = content.title;
      request.data.properties.description = content.description ?? "";
      await fillPackage({
        transfer,
        target: targetOf(request.data)
      });
    } finally {
      deferral.complete();
      stop();
    }
  });
  if (isFromWindow) {
    showShareUiForWindow(hwnd);
    return;
  }

  DataTransferManager.showShareUI();
}
