import { PickerLocationId } from "#src/winui.js";

// The file and folder pickers of the Windows App SDK
// (Microsoft.Windows.Storage.Pickers): what the options say becomes the
// picker's members, and what the user picked becomes paths. They need no
// package identity. A picker is made with the window it belongs to
// (WindowHandle does that), and a cancelled one gives null, not an error.

/** A well-known folder a picker can open in. */
export const PickerLocation = {
  documents: "documents",
  computer: "computer",
  desktop: "desktop",
  downloads: "downloads",
  music: "music",
  pictures: "pictures",
  videos: "videos"
} as const;

/** One of `PickerLocation`'s values. */
export type PickerLocation = (typeof PickerLocation)[keyof typeof PickerLocation];

const LOCATION_IDS = {
  [PickerLocation.documents]: PickerLocationId.DocumentsLibrary,
  [PickerLocation.computer]: PickerLocationId.ComputerFolder,
  [PickerLocation.desktop]: PickerLocationId.Desktop,
  [PickerLocation.downloads]: PickerLocationId.Downloads,
  [PickerLocation.music]: PickerLocationId.MusicLibrary,
  [PickerLocation.pictures]: PickerLocationId.PicturesLibrary,
  [PickerLocation.videos]: PickerLocationId.VideosLibrary
} as const satisfies Record<PickerLocation, PickerLocationId>;

/** What every picker takes. */
export interface PickerOptions {
  /** The dialog's title. */
  title?: string;

  /** The text of the button that accepts the choice (the system's own by default). */
  commitButtonText?: string;

  /** A well-known folder to open in. */
  startIn?: PickerLocation;

  /** A folder to open in, by path; wins over `startIn`. */
  startFolder?: string;

  /**
   * Names the dialog's saved state: pickers with the same identifier open in
   * the folder the user last chose in one of them.
   */
  settingsIdentifier?: string;
}

/** What the open-file pickers take besides `PickerOptions`. */
export interface OpenFilePickerOptions extends PickerOptions {
  /**
   * The extensions to show, with the dot (`".png"`), or `"*"` for every file.
   * Left out, every file is shown.
   */
  fileTypes?: readonly string[];
}

/** What the save-file picker takes besides `PickerOptions`. */
export interface SaveFilePickerOptions extends PickerOptions {
  /** The name the file name box starts with. */
  suggestedFileName?: string;

  /** The extension added when the user types a name without one (`".txt"`). */
  defaultFileExtension?: string;

  /**
   * The file types the user can save as: each label (`"Text"`) with the
   * extensions it stands for (`[".txt"]`).
   */
  fileTypeChoices?: Readonly<Record<string, readonly string[]>>;

  /** Whether to ask before replacing a file that exists (the system's default is yes). */
  shouldPromptOverwrite?: boolean;
}

/** The members every WinUI picker has. */
interface Picker {
  title: string;
  commitButtonText: string;
  suggestedStartLocation: PickerLocationId;
  suggestedStartFolder: string;
  settingsIdentifier: string;
}

interface PickedPath {
  readonly path: string;
}

/** The part of `FileOpenPicker` that `pickFile` and `pickFiles` use. */
export interface OpenFilePicker extends Picker {
  readonly fileTypeFilter: {
    append(extension: string): void;
  } | null;
  pickSingleFileAsync(): Promise<PickedPath | null>;
  pickMultipleFilesAsync(): Promise<{
    toArray(): PickedPath[];
  } | null>;
}

/** The part of `FolderPicker` that `pickFolder` uses. */
export interface FolderPickerLike extends Picker {
  pickSingleFolderAsync(): Promise<PickedPath | null>;
}

/** The part of `FileSavePicker` that `saveFile` uses. */
export interface SaveFilePicker extends Picker {
  readonly fileTypeChoices: {
    insert(label: string, extensions: string[]): boolean;
  } | null;
  suggestedFileName: string;
  defaultFileExtension: string;
  showOverwritePrompt: boolean;
  pickSaveFileAsync(): Promise<PickedPath | null>;
}

function setDefined<Target, Key extends keyof Target>({ target, key, value }: {
  target: Target;
  key: Key;
  value: Target[Key] | undefined;
}) {
  const isDefined = value !== undefined;
  if (isDefined) {
    target[key] = value;
  }
}

function configure({ picker, options }: {
  picker: Picker;
  options: PickerOptions;
}) {
  const { startIn } = options;
  setDefined({
    target: picker,
    key: "title",
    value: options.title
  });
  setDefined({
    target: picker,
    key: "commitButtonText",
    value: options.commitButtonText
  });
  setDefined({
    target: picker,
    key: "suggestedStartLocation",
    value: startIn && LOCATION_IDS[startIn]
  });
  setDefined({
    target: picker,
    key: "suggestedStartFolder",
    value: options.startFolder
  });
  setDefined({
    target: picker,
    key: "settingsIdentifier",
    value: options.settingsIdentifier
  });
}

function configureOpen({ picker, options }: {
  picker: OpenFilePicker;
  options: OpenFilePickerOptions;
}) {
  configure({
    picker,
    options
  });
  for (const extension of options.fileTypes ?? []) {
    picker.fileTypeFilter?.append(extension);
  }
}

/**
 * Asks the user for one file.
 *
 * @param options - The open-file picker, made for the window, and what to set on it.
 * @returns The file's path, or null when the user cancelled.
 */
export async function pickFile({ picker, options }: {
  picker: OpenFilePicker;
  options: OpenFilePickerOptions;
}) {
  configureOpen({
    picker,
    options
  });
  const picked = await picker.pickSingleFileAsync();
  return picked?.path ?? null;
}

/**
 * Asks the user for any number of files.
 *
 * @param options - The open-file picker, made for the window, and what to set on it.
 * @returns The files' paths in the order picked; empty when the user cancelled.
 */
export async function pickFiles({ picker, options }: {
  picker: OpenFilePicker;
  options: OpenFilePickerOptions;
}) {
  configureOpen({
    picker,
    options
  });
  const picked = await picker.pickMultipleFilesAsync();
  return picked?.toArray().map(file => file.path) ?? [];
}

/**
 * Asks the user for a folder.
 *
 * @param options - The folder picker, made for the window, and what to set on it.
 * @returns The folder's path, or null when the user cancelled.
 */
export async function pickFolder({ picker, options }: {
  picker: FolderPickerLike;
  options: PickerOptions;
}) {
  configure({
    picker,
    options
  });
  const picked = await picker.pickSingleFolderAsync();
  return picked?.path ?? null;
}

/**
 * Asks the user where to save a file. The file is not made: the app writes it.
 *
 * @param options - The save-file picker, made for the window, and what to set on it.
 * @returns The path the user chose, or null when the user cancelled.
 */
export async function saveFile({ picker, options }: {
  picker: SaveFilePicker;
  options: SaveFilePickerOptions;
}) {
  configure({
    picker,
    options
  });
  setDefined({
    target: picker,
    key: "suggestedFileName",
    value: options.suggestedFileName
  });
  setDefined({
    target: picker,
    key: "defaultFileExtension",
    value: options.defaultFileExtension
  });
  setDefined({
    target: picker,
    key: "showOverwritePrompt",
    value: options.shouldPromptOverwrite
  });
  for (const [label, extensions] of Object.entries(options.fileTypeChoices ?? {})) {
    picker.fileTypeChoices?.insert(label, [...extensions]);
  }

  const picked = await picker.pickSaveFileAsync();
  return picked?.path ?? null;
}
