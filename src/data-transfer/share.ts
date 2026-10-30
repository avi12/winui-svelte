import type { ClipboardContent } from "./clipboard.ts";
import { dataTransferOf } from "./clipboard.ts";
import { fillPackage } from "./package-io.ts";
import { targetOf } from "./winrt-package.ts";
import { DataTransferManager } from "#winui/windows/application-model/data-transfer/DataTransferManager";

/** What `share` offers to other apps. */
export interface ShareContent extends ClipboardContent {
  /** The title the share pane shows. */
  title: string;
  description?: string;
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
 * Opens the system share pane with some content. Windows' share needs the app
 * to have a package identity (a packaged or sparse-packaged app): a plain
 * Node.js or Electron process has none, and `share` then throws a
 * `ShareUnavailableError`. `clipboard.write` and drag out work without it.
 *
 * @param content - What to share.
 * @throws {ShareUnavailableError} When the app cannot show the share pane.
 */
export function share(content: ShareContent) {
  const isSupported = DataTransferManager.isSupported();
  if (!isSupported) {
    throw new ShareUnavailableError("this version of Windows has no share pane");
  }

  const manager = managerOf();
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
  DataTransferManager.showShareUI();
}
