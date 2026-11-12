import { DomErrorName, domException } from "./dom-exception.ts";
import { defineNavigatorProperty } from "./install.ts";
import type { NativeFile } from "#src/data-transfer/native-file.js";
import { nativeFileAt } from "#src/data-transfer/native-file.js";
import type { ShareContent, ShareWindow } from "#src/data-transfer/share.js";
import { share, ShareUnavailableError } from "#src/data-transfer/share.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const TEMPORARY_PREFIX = "winui-svelte-share-";

/** What the Web Share API runs on; the tests give a fake. */
export interface ShareBackend {
  isSupported(): boolean;
  show(content: ShareContent): Promise<void>;
}

/**
 * The Windows share pane, over `share` of `data-transfer`. Given a window it
 * opens the pane from it, which an unpackaged process can do too; without one
 * it needs a package identity, and without that `show` rejects with a
 * `ShareUnavailableError`.
 *
 * @param window - The window to share from, if any.
 * @returns The backend the real install uses.
 */
export function windowsShareBackend(window?: ShareWindow) {
  return {
    isSupported: () => true,
    show(content) {
      share(
        window ? {
          ...content,
          window
        } : content
      );
      return Promise.resolve();
    }
  } satisfies ShareBackend;
}

/**
 * What Windows adds to the standard `ShareData`: the other formats a
 * `DataPackage` holds. A browser ignores them.
 */
export interface ShareExtras {
  /** The longer line under the title in the share pane. */
  readonly description?: string;

  /** An HTML fragment. */
  readonly html?: string;

  /** A picture. */
  readonly bitmap?: NativeFile;

  /** Text under custom format ids. */
  readonly custom?: Readonly<Record<string, string>>;

  /** Files and folders by path; they join `files`. */
  readonly nativeFiles?: readonly NativeFile[];
}

/** The standard `ShareData`, with the extras. */
export interface ShareInit extends ShareExtras {
  readonly title?: string;
  readonly text?: string;
  readonly url?: string;
  readonly files?: readonly File[];
}

declare global {
  // The extras join the standard ShareData wherever this module is imported.
  interface ShareData extends ShareExtras {}
}

function hasContent(data: ShareInit) {
  const hasText = [data.title, data.text, data.url].some(value => value !== undefined);
  const hasFiles = (data.files?.length ?? 0) + (data.nativeFiles?.length ?? 0) > 0;
  const hasOthers = [data.html, data.bitmap, data.custom].some(value => value !== undefined);
  return hasText || hasFiles || hasOthers;
}

function isValidUrl(url: string | undefined) {
  const isAbsent = url === undefined;
  if (isAbsent) {
    return true;
  }

  return URL.canParse(url);
}

function isShareable(data: ShareInit) {
  return hasContent(data) && isValidUrl(data.url);
}

function temporaryFileOf({ file, folder }: {
  file: File;
  folder: string;
}) {
  const target = path.join(folder, path.basename(file.name));
  return file.arrayBuffer().then(buffer => {
    writeFileSync(target, new Uint8Array(buffer));
    return nativeFileAt(target);
  });
}

/** The `navigator.share` and `navigator.canShare` functions. */
export class Sharer {
  private readonly backend: ShareBackend;
  private readonly temporaryFolder: () => string;

  /** Made by `installShare`. */
  constructor({ backend, temporaryFolder }: {
    backend: ShareBackend;
    temporaryFolder: () => string;
  }) {
    this.backend = backend;
    this.temporaryFolder = temporaryFolder;
  }

  /**
   * Whether `share` would accept the data.
   *
   * @param data - What would be shared.
   * @returns False when it is empty, its `url` does not parse or the system has no share pane.
   */
  canShare(data: ShareInit = {}) {
    return this.backend.isSupported() && isShareable(data);
  }

  /**
   * Opens the share pane. The promise settles once the pane is shown: Windows
   * does not say whether the user finished sharing.
   *
   * @param data - What to share.
   * @throws {TypeError} When the data is empty or its `url` does not parse.
   * @throws {DOMException} `NotAllowedError` when the app cannot show the pane (no package identity).
   */
  async share(data: ShareInit = {}) {
    const isValid = isShareable(data);
    if (!isValid) {
      throw new TypeError("Failed to execute 'share' on 'Navigator': Invalid share data");
    }

    const folder = this.temporaryFolder();
    const copied = await Promise.all(
      (data.files ?? []).map(file => temporaryFileOf({
        file,
        folder
      }))
    );
    const files = [...copied, ...data.nativeFiles ?? []];
    try {
      await this.backend.show({
        title: data.title ?? data.text ?? "",
        ...data.description !== undefined && {
          description: data.description
        },
        ...data.text !== undefined && {
          text: data.text
        },
        ...data.url !== undefined && {
          uri: data.url
        },
        ...data.html !== undefined && {
          html: data.html
        },
        ...data.bitmap !== undefined && {
          bitmap: data.bitmap
        },
        ...data.custom !== undefined && {
          custom: data.custom
        },
        ...files.length > 0 && {
          files
        }
      });
    } catch (error) {
      const isUnavailable = error instanceof ShareUnavailableError;
      if (isUnavailable) {
        throw domException({
          name: DomErrorName.NOT_ALLOWED,
          message: error.message
        });
      }

      throw error;
    }
  }
}

/** What `installShare` takes. */
export interface ShareInstallOptions {
  /**
   * The window the share pane opens from (a `WindowHandle` or the native
   * `Window`); with one, an app without a package identity can share.
   */
  readonly window?: ShareWindow;

  /** Stands in for the Windows share pane; the tests give one. */
  readonly backend?: ShareBackend;

  /** Makes the folder that holds copies of the `File`s to share; a new temporary folder by default. */
  readonly temporaryFolder?: () => string;
}

function newTemporaryFolder() {
  return mkdtempSync(path.join(tmpdir(), TEMPORARY_PREFIX));
}

/**
 * Defines `navigator.share` and `navigator.canShare` over the Windows share
 * pane. Windows shows it to an app with a package identity, or to any app
 * that gives the `window` to open it from; otherwise it gets a
 * `NotAllowedError`, and `canShare` stays true because the identity is known
 * only when the pane opens.
 *
 * @param options - The backend and the temporary folder, for tests.
 * @returns The function that takes them away again.
 */
export function installShare(options: ShareInstallOptions = {}) {
  const sharer = new Sharer({
    backend: options.backend ?? windowsShareBackend(options.window),
    temporaryFolder: options.temporaryFolder ?? newTemporaryFolder
  });
  const uninstalls = [
    defineNavigatorProperty({
      name: "share",
      value: (data?: ShareInit) => sharer.share(data)
    }),
    defineNavigatorProperty({
      name: "canShare",
      value: (data?: ShareInit) => sharer.canShare(data)
    })
  ];
  return () => {
    for (const uninstall of uninstalls.reverse()) {
      uninstall();
    }
  };
}
