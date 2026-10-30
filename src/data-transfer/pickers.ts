import type { Accept } from "./accept.ts";
import { isFoldersOnly, pickerExtensionsOf } from "./accept.ts";
import type { NativeFile } from "./native-file.ts";
import { nativeFileAt } from "./native-file.ts";
import { control } from "#src/renderer/host/control.js";
import type { PickerOptions } from "#src/window/pickers.js";
import { pickFilePaths, pickFolder as pickFolderPath, saveFile } from "#src/window/pickers.js";
import { FileOpenPicker, FileSavePicker, FolderPicker } from "#src/winui.js";
import type { WindowId } from "#winui/microsoft/ui/windowing/AppWindow";

/**
 * What a dialog is opened over: a control (its window is found from the
 * control's XamlRoot), or a `WindowHandle` from `bind:handle` on `<Window>`.
 */
export interface PickerOwner {
  readonly xamlRoot?: {
    readonly contentIslandEnvironment: {
      readonly appWindowId: WindowId;
    };
  } | null;
  readonly appWindow?: {
    readonly id: WindowId;
  };
}

/** What `pickFiles` takes: the web's `<input type=file>` attributes and the dialog's options. */
export interface PickFilesOptions extends PickerOptions {
  /** The window or control the dialog opens over. */
  owner: PickerOwner;

  /** Which files to show, like `<input accept>`: `".png,image/*"`. `["directory"]` alone picks a folder. */
  accept?: Accept;

  /** Let the user pick more than one. Default false. */
  multiple?: boolean;

  /** Pick a folder in place of files. Default false. */
  directory?: boolean;
}

/** What `pickSaveFile` takes. */
export interface PickSaveFileOptions extends PickerOptions {
  owner: PickerOwner;

  /** The extensions the user can save as (`".png"`), shown as one choice. */
  accept?: Accept;

  /** The name the file name box starts with. */
  suggestedFileName?: string;

  /** The extension added when the user types a name without one. */
  defaultFileExtension?: string;
}

const SAVE_CHOICE_LABEL = "Files";

function windowIdOf(owner: PickerOwner) {
  const id = owner.appWindow?.id ?? owner.xamlRoot?.contentIslandEnvironment.appWindowId;
  const hasWindow = id !== undefined;
  if (!hasWindow) {
    throw new Error("the dialog has no window to open over: pass a control that is in a window, or the window handle");
  }

  return id;
}

function dialogOptionsOf(options: PickerOptions) {
  const { title, commitButtonText, startIn, startFolder, settingsIdentifier } = options;
  return {
    ...title !== undefined && {
      title
    },
    ...commitButtonText !== undefined && {
      commitButtonText
    },
    ...startIn !== undefined && {
      startIn
    },
    ...startFolder !== undefined && {
      startFolder
    },
    ...settingsIdentifier !== undefined && {
      settingsIdentifier
    }
  };
}

/**
 * Opens the system file or folder dialog and reads what the user chose.
 *
 * @param options - The window, the filter and the dialog's title, start folder and so on.
 * @returns The chosen files (or folders) as `NativeFile`, in the order picked; empty when the user cancelled.
 */
export async function pickFiles(options: PickFilesOptions) {
  const windowId = windowIdOf(options.owner);
  const isFolder = options.directory === true || isFoldersOnly(options.accept);
  const dialogOptions = dialogOptionsOf(options);
  if (isFolder) {
    const folder = await pickFolderPath({
      picker: new FolderPicker(windowId),
      options: dialogOptions
    });
    return folder === null ? [] : [nativeFileAt(folder)];
  }

  const extensions = pickerExtensionsOf(options.accept);
  const paths = await pickFilePaths({
    picker: new FileOpenPicker(windowId),
    options: {
      ...dialogOptions,
      fileTypes: extensions.length > 0 ? extensions : ["*"]
    }
  });
  const chosen = options.multiple === true ? paths : paths.slice(0, 1);
  return chosen.map(nativeFileAt);
}

/**
 * Asks the user where to save a file. The file is not made: the app writes it.
 *
 * @param options - The window, the name to suggest and the dialog's options.
 * @returns The path the user chose, or null when the user cancelled.
 */
export function pickSaveFile(options: PickSaveFileOptions) {
  const extensions = pickerExtensionsOf(options.accept);
  const hasExtensions = extensions.length > 0;
  return saveFile({
    picker: new FileSavePicker(windowIdOf(options.owner)),
    options: {
      ...dialogOptionsOf(options),
      ...options.suggestedFileName !== undefined && {
        suggestedFileName: options.suggestedFileName
      },
      ...options.defaultFileExtension !== undefined && {
        defaultFileExtension: options.defaultFileExtension
      },
      ...hasExtensions && {
        fileTypeChoices: {
          [SAVE_CHOICE_LABEL]: extensions
        }
      }
    }
  });
}

/** What `filePicker` takes: `pickFiles` without the owner, and who to tell. */
export interface FilePickerOptions extends Omit<PickFilesOptions, "owner"> {
  /** Told the chosen files; not called when the user cancels. */
  onPick: (files: NativeFile[]) => void;
}

/** The part of a button `filePicker` needs. */
interface Clickable extends PickerOwner {
  onClick(callback: () => void): () => void;
}

function rethrowLater(error: unknown) {
  queueMicrotask(() => {
    throw error;
  });
}

/**
 * Makes a button open the file dialog when clicked, like a web
 * `<input type=file>`, with `filePicker({ accept: "image/*", multiple: true,
 * onPick })` after `@attach` on the button. The dialog opens over the
 * button's window.
 *
 * @param options - What `pickFiles` takes, and `onPick`.
 * @returns The attachment to put after `@attach`.
 */
export function filePicker({ onPick, ...options }: FilePickerOptions) {
  return control<Clickable>(button => button.onClick(() => {
    pickFiles({
      ...options,
      owner: button
    }).then(files => {
      const hasChosen = files.length > 0;
      if (hasChosen) {
        onPick(files);
      }
    }, rethrowLater);
  }));
}
